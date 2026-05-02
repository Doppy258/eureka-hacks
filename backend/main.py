"""FastAPI service: video upload, TRIBE v2 (or demo) timeline, heuristic feedback."""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

import httpx
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from feedback import build_feedback
from tribe_runner import analyze_video

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REMOTE_TRIBE_URL = os.environ.get("REMOTE_TRIBE_URL", "").strip()
REMOTE_TRIBE_TIMEOUT = float(os.environ.get("REMOTE_TRIBE_TIMEOUT_SEC", "3600"))

UPLOAD_ROOT = Path(os.environ.get("TRIBE_UPLOAD_DIR", Path(__file__).resolve().parent / "uploads"))
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = int(os.environ.get("TRIBE_MAX_UPLOAD_MB", "500")) * 1024 * 1024

app = FastAPI(title="TRIBE Studio", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeResponse(BaseModel):
    job_id: str
    video_url: str
    mode: str = Field(description="tribe or demo")
    video_duration_sec: float
    tr_sec: float
    timestamps_start: list[float]
    timestamps_end: list[float]
    engagement: list[float]
    region_labels: list[str]
    region_timeseries: list[list[float]]
    feedback: dict | None = None
    fallback_error: str | None = None


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "tribe_demo": os.environ.get("TRIBE_DEMO", ""),
        "remote_inference": bool(REMOTE_TRIBE_URL),
    }


def _remote_request_headers() -> dict[str, str]:
    """Free ngrok often interstitials browser clients; this header helps programmatic POSTs."""
    h: dict[str, str] = {}
    if "ngrok" in REMOTE_TRIBE_URL.lower():
        h["ngrok-skip-browser-warning"] = "true"
    extra = os.environ.get("REMOTE_TRIBE_EXTRA_HEADERS", "")
    # Optional: REMOTE_TRIBE_EXTRA_HEADERS='X-Custom: a,Authorization: Bearer x'
    if extra.strip():
        for part in extra.split(","):
            if ":" in part:
                k, v = part.split(":", 1)
                h[k.strip()] = v.strip()
    return h


async def _analyze_via_remote(dest: Path, include_feedback: bool) -> dict:
    """POST the saved file to a GPU Colab / server running the same /api/analyze contract."""
    timeout = httpx.Timeout(
        connect=120.0,
        read=REMOTE_TRIBE_TIMEOUT,
        write=600.0,
        pool=120.0,
    )
    headers = _remote_request_headers()
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        with dest.open("rb") as fh:
            files = {"file": (dest.name, fh, "application/octet-stream")}
            r = await client.post(
                REMOTE_TRIBE_URL,
                files=files,
                params={"include_feedback": include_feedback},
                headers=headers or None,
            )
    if r.status_code >= 400:
        raise RuntimeError(r.text or f"Remote HTTP {r.status_code}")
    return r.json()


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile = File(...),
    include_feedback: bool = Query(True),
):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp4", ".webm", ".mov", ".mkv", ".avi"}:
        raise HTTPException(400, "Unsupported video type; try mp4 or webm.")

    job_id = str(uuid.uuid4())
    dest = UPLOAD_ROOT / f"{job_id}{suffix}"

    size = 0
    try:
        with dest.open("wb") as buf:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB).")
                buf.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise

    logger.info("Saved upload job=%s path=%s bytes=%s", job_id, dest, size)

    try:
        if REMOTE_TRIBE_URL:
            logger.info("Forwarding inference to REMOTE_TRIBE_URL=%s", REMOTE_TRIBE_URL)
            remote = await _analyze_via_remote(dest, include_feedback)
            raw = {
                "mode": remote["mode"],
                "video_duration_sec": float(remote["video_duration_sec"]),
                "tr_sec": float(remote["tr_sec"]),
                "timestamps_start": remote["timestamps_start"],
                "timestamps_end": remote["timestamps_end"],
                "engagement": remote["engagement"],
                "region_labels": remote["region_labels"],
                "region_timeseries": remote["region_timeseries"],
                "fallback_error": remote.get("fallback_error"),
            }
            fb = remote.get("feedback") if include_feedback else None
            if include_feedback and fb is None:
                fb = build_feedback(
                    region_labels=raw["region_labels"],
                    region_timeseries=np.asarray(raw["region_timeseries"], dtype=np.float64),
                    engagement=np.asarray(raw["engagement"], dtype=np.float64),
                    starts=np.asarray(raw["timestamps_start"], dtype=np.float64),
                    ends=np.asarray(raw["timestamps_end"], dtype=np.float64),
                    video_duration_sec=float(raw["video_duration_sec"]),
                    demo_mode=raw.get("mode") == "demo",
                )
        else:
            raw = analyze_video(str(dest))
            fb = None
            if include_feedback:
                fb = build_feedback(
                    region_labels=raw["region_labels"],
                    region_timeseries=np.asarray(raw["region_timeseries"], dtype=np.float64),
                    engagement=np.asarray(raw["engagement"], dtype=np.float64),
                    starts=np.asarray(raw["timestamps_start"], dtype=np.float64),
                    ends=np.asarray(raw["timestamps_end"], dtype=np.float64),
                    video_duration_sec=float(raw["video_duration_sec"]),
                    demo_mode=raw.get("mode") == "demo",
                )
    except Exception as e:
        dest.unlink(missing_ok=True)
        logger.exception("Inference failed")
        raise HTTPException(500, f"Inference failed: {e}") from e

    return AnalyzeResponse(
        job_id=job_id,
        video_url=f"/api/video/{job_id}",
        mode=raw["mode"],
        video_duration_sec=float(raw["video_duration_sec"]),
        tr_sec=float(raw["tr_sec"]),
        timestamps_start=[float(x) for x in raw["timestamps_start"]],
        timestamps_end=[float(x) for x in raw["timestamps_end"]],
        engagement=[float(x) for x in raw["engagement"]],
        region_labels=list(raw["region_labels"]),
        region_timeseries=[[float(v) for v in row] for row in raw["region_timeseries"]],
        feedback=fb,
        fallback_error=raw.get("fallback_error"),
    )


@app.get("/api/video/{job_id}")
def serve_video(job_id: str):
    matches = list(UPLOAD_ROOT.glob(f"{job_id}.*"))
    if not matches:
        raise HTTPException(404, "Unknown job or video expired.")
    path = matches[0]
    media = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
    }.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media)


@app.delete("/api/video/{job_id}")
def delete_video(job_id: str):
    for p in UPLOAD_ROOT.glob(f"{job_id}.*"):
        p.unlink(missing_ok=True)
    return {"ok": True}


def run():
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("UVICORN_RELOAD", "").lower() in ("1", "true"),
    )


if __name__ == "__main__":
    run()
