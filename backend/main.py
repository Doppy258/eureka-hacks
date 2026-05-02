"""FastAPI service: video upload, remote TRIBE v2, and NeuroWatch reports."""

from __future__ import annotations

import logging
import os
import uuid
import hashlib
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.fast_surface import run_fast_analyze, run_fast_pointcloud, run_fast_surface
from backend.feedback import build_feedback
from backend.tribe_runner import analyze_video, run_tribe_surface, video_duration_seconds

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REMOTE_TRIBE_URL = os.environ.get("REMOTE_TRIBE_URL", "").strip()
REMOTE_TRIBE_TIMEOUT = float(os.environ.get("REMOTE_TRIBE_TIMEOUT_SEC", "3600"))

UPLOAD_ROOT = Path(os.environ.get("TRIBE_UPLOAD_DIR", Path(__file__).resolve().parent / "uploads"))
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = int(os.environ.get("TRIBE_MAX_UPLOAD_MB", "500")) * 1024 * 1024

# When TRIBE_REAL=1 the upload endpoints (/api/analyze, /api/brain/*) run real
# TRIBE v2 inference. On Apple MPS or CPU this takes 15-40+ minutes for a 30s
# clip (whisperx + text/audio/video extractors + LLaMA regression head), so the
# default is False: we use the fast video-driven proxy that returns in ~1s and
# still produces a real-data engagement timeline + cortical surface heatmap.
TRIBE_REAL = os.environ.get("TRIBE_REAL", "").lower() in ("1", "true", "yes")

app = FastAPI(title="NeuroWatch", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Gzip the large brain-surface and mesh JSON payloads (~1MB each). The vertex
# activations are already zlib-compressed inside the JSON (base64 of zlib bytes),
# so this only meaningfully shrinks the JSON envelope and the mesh response.
app.add_middleware(GZipMiddleware, minimum_size=1024)


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
    inference_source: str = Field(description="local, remote, or demo")
    feedback: Optional[dict] = None
    fallback_error: Optional[str] = None


class BrainTimelineResponse(BaseModel):
    job_id: Optional[str] = None
    video_url: str
    mode: str
    video_duration_sec: float
    tr_sec: float
    timestamps_start: list[float]
    timestamps_end: list[float]
    point_count: int
    positions_2d: list[list[float]]
    activations: list[list[float]]


class SurfaceMeshRef(BaseModel):
    name: str = "fsaverage5"
    url: str


class EncodedFloatArray(BaseModel):
    dtype: str
    shape: list[int]
    compression: str
    data_b64: str


class RegionActivation(BaseModel):
    name: str
    z: float


class BrainSurfaceTimelineResponse(BaseModel):
    job_id: Optional[str] = None
    video_url: str
    mode: str
    video_duration_sec: float
    tr_sec: float
    timestamps_start: list[float]
    timestamps_end: list[float]
    vertex_count: int
    mesh: SurfaceMeshRef
    activations: EncodedFloatArray
    region_activations: list[list[RegionActivation]] = Field(default_factory=list)


_HARDCODED_PAYLOAD_CACHE: dict[str, dict[str, Any]] = {}


def _read_hardcoded_cache(path: Path) -> Optional[dict[str, Any]]:
    """Return the cached JSON payload for ``path`` (parsed once, kept in memory).

    The hardcoded demo caches are immutable for the life of the process; we only
    need to parse them on the first request. Caching the parsed dict shaves
    ~30ms (1MB JSON parse) off every demo load.
    """
    if not path.exists():
        return None
    key = str(path)
    cached = _HARDCODED_PAYLOAD_CACHE.get(key)
    if cached is not None:
        return cached
    import json

    payload = json.loads(path.read_text(encoding="utf-8"))
    _HARDCODED_PAYLOAD_CACHE[key] = payload
    return payload


def _hardcoded_video_path() -> Path:
    explicit = os.environ.get("TRIBE_HARDCODED_VIDEO", "").strip()
    if explicit:
        return Path(explicit).expanduser().resolve()
    repo_root = Path(__file__).resolve().parents[1]
    candidates = [
        # Prefer the short, downscaled clip so the hardcoded TRIBE precompute stays cheap.
        # V-JEPA only sees 224x224 internally, so 4K decode is wasted time.
        repo_root / "new-test" / "tribev2" / "IMG_2225.mp4",
        repo_root / "new-test" / "tribev2" / "IMG_2225.MOV",
        repo_root / "new-test" / "tribev2" / "IMG_2225.mov",
        repo_root / "new-test" / "tribev2" / "e.mov",
        repo_root / "new-test" / "tribev2" / "e.MOV",
        repo_root / "new-test" / "tribev2" / "e.mp4",
        repo_root / "new-test" / "tribev2" / "e.MP4",
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[-1]


def _demo_mode_enabled() -> bool:
    return os.environ.get("TRIBE_DEMO", "").lower() in ("1", "true", "yes")


def _runtime_mode() -> str:
    if REMOTE_TRIBE_URL:
        return "remote_tribe"
    if _demo_mode_enabled():
        return "demo"
    return "local_tribe"


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "mode": _runtime_mode(),
        "tribe_demo": os.environ.get("TRIBE_DEMO", ""),
        "remote_inference": bool(REMOTE_TRIBE_URL),
        "remote_tribe_url_configured": bool(REMOTE_TRIBE_URL),
    }


@app.get("/api/hardcoded/brain", response_model=BrainTimelineResponse)
def hardcoded_brain():
    from backend.tribe_runner import run_tribe_vertices

    video_path = _hardcoded_video_path()
    if not video_path.exists():
        raise HTTPException(
            404,
            f"Hardcoded video not found: {video_path}. Set TRIBE_HARDCODED_VIDEO to an existing path.",
        )

    cache_path = UPLOAD_ROOT / "hardcoded_brain_cache.json"
    payload = _read_hardcoded_cache(cache_path)
    if payload is None:
        # Real, video-driven point-cloud fallback (seconds, not hours).
        try:
            payload = run_fast_pointcloud(str(video_path))
        except Exception as e:
            raise HTTPException(500, f"Fast hardcoded point-cloud inference failed: {e}") from e

    return BrainTimelineResponse(
        video_url="/api/hardcoded/video",
        mode=str(payload["mode"]),
        video_duration_sec=float(payload["video_duration_sec"]),
        tr_sec=float(payload["tr_sec"]),
        timestamps_start=[float(x) for x in payload["timestamps_start"]],
        timestamps_end=[float(x) for x in payload["timestamps_end"]],
        point_count=int(payload["point_count"]),
        positions_2d=payload["positions_2d"],
        activations=payload["activations"],
    )


@app.get("/api/hardcoded/analyze", response_model=AnalyzeResponse)
def hardcoded_analyze():
    """Return the precomputed AnalyzeResponse for the bundled demo clip.

    Reads ``backend/uploads/hardcoded_analyze_cache.json`` (produced by
    ``new-test/tribev2/precompute_hardcoded_surface_cache.py``). If the cache is
    missing, synthesizes a cheap ``run_demo`` timeline so the studio demo never
    404s during a live demo.
    """
    video_path = _hardcoded_video_path()
    if not video_path.exists():
        raise HTTPException(
            404,
            f"Hardcoded video not found: {video_path}. Set TRIBE_HARDCODED_VIDEO to an existing path.",
        )

    cache_path = UPLOAD_ROOT / "hardcoded_analyze_cache.json"
    payload = _read_hardcoded_cache(cache_path)
    if payload is None:
        # No precomputed cache: synthesize a cheap, deterministic demo timeline.
        logger.warning(
            "hardcoded_analyze_cache.json missing; falling back to run_demo. "
            "Run new-test/tribev2/precompute_hardcoded_surface_cache.py to bake real TRIBE output."
        )
        from backend.tribe_runner import run_demo

        try:
            raw_payload = run_demo(str(video_path))
            raw = _normalize_raw_result(raw_payload)
            feedback = _build_local_feedback(raw)
            feedback = _annotate_feedback_source(
                feedback, inference_source="demo", raw_mode=str(raw["mode"])
            )
        except Exception as e:
            raise HTTPException(500, f"Hardcoded demo synthesis failed: {e}") from e

        payload = {
            "job_id": "hardcoded-demo",
            "video_url": "/api/hardcoded/video",
            "mode": raw["mode"],
            "video_duration_sec": float(raw["video_duration_sec"]),
            "tr_sec": float(raw["tr_sec"]),
            "timestamps_start": [float(x) for x in raw["timestamps_start"]],
            "timestamps_end": [float(x) for x in raw["timestamps_end"]],
            "engagement": [float(x) for x in raw["engagement"]],
            "region_labels": list(raw["region_labels"]),
            "region_timeseries": [[float(v) for v in row] for row in raw["region_timeseries"]],
            "inference_source": "demo",
            "feedback": feedback,
            "fallback_error": "no precomputed cache; serving synthetic demo",
        }

    return AnalyzeResponse(
        job_id=str(payload.get("job_id") or "hardcoded-demo"),
        video_url=str(payload.get("video_url") or "/api/hardcoded/video"),
        mode=str(payload["mode"]),
        video_duration_sec=float(payload["video_duration_sec"]),
        tr_sec=float(payload["tr_sec"]),
        timestamps_start=[float(x) for x in payload["timestamps_start"]],
        timestamps_end=[float(x) for x in payload["timestamps_end"]],
        engagement=[float(x) for x in payload["engagement"]],
        region_labels=list(payload["region_labels"]),
        region_timeseries=[[float(v) for v in row] for row in payload["region_timeseries"]],
        inference_source=str(payload.get("inference_source") or "local"),
        feedback=payload.get("feedback"),
        fallback_error=payload.get("fallback_error"),
    )


@app.get("/api/hardcoded/brain_surface", response_model=BrainSurfaceTimelineResponse)
def hardcoded_brain_surface():
    video_path = _hardcoded_video_path()
    if not video_path.exists():
        raise HTTPException(
            404,
            f"Hardcoded video not found: {video_path}. Set TRIBE_HARDCODED_VIDEO to an existing path.",
        )

    cache_path = UPLOAD_ROOT / "hardcoded_surface_cache.json"
    payload = _read_hardcoded_cache(cache_path)
    if payload is None:
        # No precomputed TRIBE cache: derive a real, video-driven surface in seconds via fast mode.
        # This matches what the upload endpoints do by default and avoids the 30-60min V-JEPA
        # cold-cache pass on CPU/MPS.
        try:
            payload = run_fast_surface(str(video_path))
        except Exception as e:
            raise HTTPException(500, f"Fast hardcoded surface inference failed: {e}") from e

    raw_regions = payload.get("region_activations") or []
    region_activations = [
        [RegionActivation(name=str(r["name"]), z=float(r["z"])) for r in row]
        for row in raw_regions
    ]
    return BrainSurfaceTimelineResponse(
        video_url="/api/hardcoded/video",
        mode=str(payload["mode"]),
        video_duration_sec=float(payload["video_duration_sec"]),
        tr_sec=float(payload["tr_sec"]),
        timestamps_start=[float(x) for x in payload["timestamps_start"]],
        timestamps_end=[float(x) for x in payload["timestamps_end"]],
        vertex_count=int(payload["vertex_count"]),
        mesh=SurfaceMeshRef(url="/api/brain/surface/fsaverage5"),
        activations=EncodedFloatArray(**payload["activations"]),
        region_activations=region_activations,
    )


MESH_ROOT = Path(__file__).resolve().parent / "static"
MESH_ROOT.mkdir(parents=True, exist_ok=True)
FSAVERAGE5_MESH_PATH = MESH_ROOT / "fsaverage5_mesh.json"


_FSAVERAGE5_MESH_CACHE: dict[str, Any] | None = None


@app.get("/api/brain/surface/fsaverage5")
def get_fsaverage5_mesh():
    """Serve a pre-exported fsaverage5 cortical surface mesh (both hemispheres).

    This endpoint is intentionally static and cacheable. Generate the file once via:
      python backend/scripts/export_fsaverage5_mesh.py
    """
    global _FSAVERAGE5_MESH_CACHE
    if not FSAVERAGE5_MESH_PATH.exists():
        raise HTTPException(
            404,
            "Missing fsaverage5 mesh. Run `python backend/scripts/export_fsaverage5_mesh.py` "
            "to generate backend/static/fsaverage5_mesh.json.",
        )
    if _FSAVERAGE5_MESH_CACHE is None:
        try:
            import json

            _FSAVERAGE5_MESH_CACHE = json.loads(
                FSAVERAGE5_MESH_PATH.read_text(encoding="utf-8")
            )
        except Exception as e:
            raise HTTPException(500, f"Failed to read fsaverage5 mesh JSON: {e}") from e
    # Let the browser cache aggressively in dev too; the mesh is immutable.
    return JSONResponse(
        _FSAVERAGE5_MESH_CACHE,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.post("/api/brain/surface_timeline", response_model=BrainSurfaceTimelineResponse)
async def brain_surface_timeline(file: UploadFile = File(...)):
    """Upload a clip and return full fsaverage5 vertex activations across time."""
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp4", ".webm", ".mov"}:
        raise HTTPException(400, "Unsupported video type; upload an mp4, mov, or webm.")

    tmp_id = str(uuid.uuid4())
    tmp_path = UPLOAD_ROOT / f".tmp-{tmp_id}{suffix}"

    size = 0
    h = hashlib.sha256()
    try:
        with tmp_path.open("wb") as buf:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB).")
                h.update(chunk)
                buf.write(chunk)
    except HTTPException:
        tmp_path.unlink(missing_ok=True)
        raise

    digest = h.hexdigest()
    dest = UPLOAD_ROOT / f"{digest}{suffix}"
    if dest.exists():
        tmp_path.unlink(missing_ok=True)
    else:
        tmp_path.replace(dest)

    probed_duration = video_duration_seconds(str(dest))
    if probed_duration is not None and not 10 <= probed_duration <= 90:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "NeuroWatch MVP supports videos from 10 to 90 seconds.")

    try:
        if TRIBE_REAL:
            raw = run_tribe_surface(str(dest))
        else:
            raw = run_fast_surface(str(dest))
    except Exception as e:
        # Keep the uploaded file so retries can hit caches.
        raise HTTPException(500, f"Brain surface inference failed: {e}") from e

    raw_regions = raw.get("region_activations") or []
    region_activations = [
        [RegionActivation(name=str(r["name"]), z=float(r["z"])) for r in row]
        for row in raw_regions
    ]
    return BrainSurfaceTimelineResponse(
        job_id=digest,
        video_url=f"/api/video/{digest}",
        mode=str(raw["mode"]),
        video_duration_sec=float(raw["video_duration_sec"]),
        tr_sec=float(raw["tr_sec"]),
        timestamps_start=[float(x) for x in raw["timestamps_start"]],
        timestamps_end=[float(x) for x in raw["timestamps_end"]],
        vertex_count=int(raw["vertex_count"]),
        mesh=SurfaceMeshRef(url="/api/brain/surface/fsaverage5"),
        activations=EncodedFloatArray(**raw["activations"]),
        region_activations=region_activations,
    )


@app.get("/api/hardcoded/video")
def serve_hardcoded_video():
    video_path = _hardcoded_video_path()
    if not video_path.exists():
        raise HTTPException(404, "Hardcoded video missing.")
    media = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
    }.get(video_path.suffix.lower(), "application/octet-stream")
    return FileResponse(video_path, media_type=media)


@app.post("/api/brain", response_model=BrainTimelineResponse)
async def brain_timeline(file: UploadFile = File(...)):
    """Upload a clip and return a scrollable brain timeline point-cloud."""
    from backend.tribe_runner import run_tribe_vertices

    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp4", ".webm", ".mov"}:
        raise HTTPException(400, "Unsupported video type; upload an mp4, mov, or webm.")

    tmp_id = str(uuid.uuid4())
    tmp_path = UPLOAD_ROOT / f".tmp-{tmp_id}{suffix}"

    size = 0
    h = hashlib.sha256()
    try:
        with tmp_path.open("wb") as buf:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB).")
                h.update(chunk)
                buf.write(chunk)
    except HTTPException:
        tmp_path.unlink(missing_ok=True)
        raise

    digest = h.hexdigest()
    dest = UPLOAD_ROOT / f"{digest}{suffix}"
    if dest.exists():
        tmp_path.unlink(missing_ok=True)
    else:
        tmp_path.replace(dest)

    # Keep the same MVP constraints as /api/analyze for now.
    probed_duration = video_duration_seconds(str(dest))
    if probed_duration is not None and not 10 <= probed_duration <= 90:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "NeuroWatch MVP supports videos from 10 to 90 seconds.")

    try:
        if TRIBE_REAL:
            payload = run_tribe_vertices(str(dest), max_points=1024)
        else:
            payload = run_fast_pointcloud(str(dest), max_points=1024)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Brain timeline inference failed: {e}") from e

    return BrainTimelineResponse(
        job_id=digest,
        video_url=f"/api/video/{digest}",
        mode=str(payload["mode"]),
        video_duration_sec=float(payload["video_duration_sec"]),
        tr_sec=float(payload["tr_sec"]),
        timestamps_start=[float(x) for x in payload["timestamps_start"]],
        timestamps_end=[float(x) for x in payload["timestamps_end"]],
        point_count=int(payload["point_count"]),
        positions_2d=payload["positions_2d"],
        activations=payload["activations"],
    )


def _remote_inference_error_detail(status: int, body: str) -> str:
    """Short, actionable message when the tunnel returns HTML (e.g. ngrok gateway errors)."""
    if "repository not found" in body.lower() or "401" in body or "403" in body:
        return (
            f"Remote HTTP {status}: the remote TRIBE runtime could not access a gated model or weight file. "
            "Check that the Colab/GPU runtime ran `huggingface-cli login`, that the token has read access, "
            "and that the LLaMA 3.2 license has been accepted."
        )
    if "git-lfs" in body.lower() or ("lfs" in body.lower() and "not found" in body.lower()):
        return (
            f"Remote HTTP {status}: Git LFS appears to be missing on the TRIBE runtime. "
            "Install Git LFS on the Colab/GPU machine before checking out TRIBE weights."
        )
    if "ERR_NGROK_3004" in body or "invalid or incomplete HTTP" in body:
        return (
            f"Remote HTTP {status} (ngrok ERR_NGROK_3004): ngrok did not get a valid HTTP response from the "
            "process on Colab port 8000. Common causes: Colab session ended or uvicorn crashed (check "
            "/content/uvicorn.log); stale REMOTE_TRIBE_URL after restarting ngrok (re-copy export from Colab); "
            "OOM during /api/analyze; or the tunnel points at the wrong port. From your Mac, curl "
            "https://<tunnel-host>/api/health — it should return JSON with \"status\":\"ok\"."
        )
    low = body[:500].lower()
    if "<html" in low or "<!doctype" in low:
        return (
            f"Remote HTTP {status} returned HTML (not JSON). Tunnel or upstream error. "
            f"Snippet: {body[:280]!r}…"
        )
    return body if len(body) <= 12000 else (body[:12000] + "…")


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


async def _analyze_via_remote(dest: Path, include_feedback: bool) -> dict[str, Any]:
    """POST the saved file to a GPU Colab / server running the same /api/analyze contract."""
    timeout = httpx.Timeout(
        connect=120.0,
        read=REMOTE_TRIBE_TIMEOUT,
        write=max(600.0, REMOTE_TRIBE_TIMEOUT),
        pool=120.0,
    )
    headers = _remote_request_headers()
    # Read whole file into memory so the multipart body is stable (avoids rare async+file-handle issues with tunnels).
    file_body = dest.read_bytes()
    suffix = dest.suffix.lower() or ".mp4"
    media = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
    }.get(suffix, "application/octet-stream")

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            files = {"file": (dest.name, file_body, media)}
            r = await client.post(
                REMOTE_TRIBE_URL,
                files=files,
                params={"include_feedback": include_feedback},
                headers=headers or None,
            )
    except httpx.RequestError as e:
        raise RuntimeError(
            "Remote TRIBE request failed before a response was received. Check that the Colab/GPU "
            f"server is still running and the tunnel URL is current. Detail: {e}"
        ) from e
    if r.status_code >= 400:
        raise RuntimeError(_remote_inference_error_detail(r.status_code, r.text))
    try:
        return r.json()
    except ValueError as e:
        raise RuntimeError(
            "Remote TRIBE returned a non-JSON response. This usually means the tunnel points at the wrong "
            f"process or the upstream crashed. Snippet: {r.text[:280]!r}"
        ) from e


def _normalize_raw_result(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize raw TRIBE/demo response fields from either local or remote backends."""
    required = (
        "mode",
        "video_duration_sec",
        "tr_sec",
        "timestamps_start",
        "timestamps_end",
        "engagement",
        "region_labels",
        "region_timeseries",
    )
    missing = [key for key in required if key not in payload]
    if missing:
        raise RuntimeError(f"TRIBE response missing required field(s): {', '.join(missing)}")
    return {
        "mode": payload["mode"],
        "video_duration_sec": float(payload["video_duration_sec"]),
        "tr_sec": float(payload["tr_sec"]),
        "timestamps_start": payload["timestamps_start"],
        "timestamps_end": payload["timestamps_end"],
        "engagement": payload["engagement"],
        "region_labels": payload["region_labels"],
        "region_timeseries": payload["region_timeseries"],
        "fallback_error": payload.get("fallback_error"),
    }


def _build_local_feedback(raw: dict[str, Any]) -> dict[str, Any]:
    return build_feedback(
        region_labels=raw["region_labels"],
        region_timeseries=np.asarray(raw["region_timeseries"], dtype=np.float64),
        engagement=np.asarray(raw["engagement"], dtype=np.float64),
        starts=np.asarray(raw["timestamps_start"], dtype=np.float64),
        ends=np.asarray(raw["timestamps_end"], dtype=np.float64),
        video_duration_sec=float(raw["video_duration_sec"]),
        demo_mode=raw.get("mode") == "demo",
    )


def _annotate_feedback_source(
    feedback: Optional[dict[str, Any]],
    *,
    inference_source: str,
    raw_mode: str,
) -> Optional[dict[str, Any]]:
    if feedback is None:
        return None
    report = feedback.get("creator_report")
    if isinstance(report, dict):
        if inference_source == "remote":
            report["mode_label"] = "remote TRIBE v2" if raw_mode == "tribe" else "remote demo-safe proxy"
        elif inference_source == "demo":
            report["mode_label"] = "demo-safe proxy"
        elif inference_source == "fast":
            report["mode_label"] = "fast video-driven proxy"
        else:
            report["mode_label"] = "local TRIBE v2" if raw_mode == "tribe" else "demo-safe proxy"
    return feedback


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile = File(...),
    include_feedback: bool = Query(True),
):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp4", ".webm", ".mov"}:
        raise HTTPException(400, "Unsupported video type; upload an mp4, mov, or webm.")

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

    probed_duration = video_duration_seconds(str(dest))
    if probed_duration is not None and not 10 <= probed_duration <= 90:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "NeuroWatch MVP supports videos from 10 to 90 seconds.")

    try:
        inference_source = "demo" if _demo_mode_enabled() else "local"
        if REMOTE_TRIBE_URL:
            logger.info("Forwarding inference to REMOTE_TRIBE_URL=%s", REMOTE_TRIBE_URL)
            remote = await _analyze_via_remote(dest, include_feedback)
            raw = _normalize_raw_result(remote)
            inference_source = "remote"
            fb = remote.get("feedback") if include_feedback else None
            if include_feedback:
                local_fb = _build_local_feedback(raw)
                if fb is None:
                    fb = local_fb
                elif "creator_report" not in fb:
                    fb["creator_report"] = local_fb["creator_report"]
        else:
            # Default: derive engagement from real video features in ~1s. Real
            # TRIBE inference (15-40min on Apple MPS for a ~30s clip) is opt-in
            # via ``TRIBE_REAL=1`` so the upload path stays interactive.
            if TRIBE_REAL:
                raw = _normalize_raw_result(analyze_video(str(dest)))
                if raw.get("mode") == "demo":
                    inference_source = "demo"
            else:
                raw = _normalize_raw_result(run_fast_analyze(str(dest)))
                inference_source = "fast"
            fb = None
            if include_feedback:
                fb = _build_local_feedback(raw)
        if not 10 <= float(raw["video_duration_sec"]) <= 90:
            dest.unlink(missing_ok=True)
            raise HTTPException(400, "NeuroWatch MVP supports videos from 10 to 90 seconds.")
        fb = _annotate_feedback_source(fb, inference_source=inference_source, raw_mode=str(raw["mode"]))
    except HTTPException:
        raise
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
        inference_source=inference_source,
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
