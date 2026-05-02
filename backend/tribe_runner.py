"""Run TRIBE v2 on a video path, or fall back to demo synthetic data."""

from __future__ import annotations

import logging
import os
import subprocess
import typing as tp

import numpy as np

logger = logging.getLogger(__name__)

_model_singleton: tp.Any | None = None

# Left / right hemisphere sectors on fsaverage5-style vertex layout (10242 + 10242 vertices).
REGION_LABELS = [
    "Left cortical sector 1 (surface vertices)",
    "Left cortical sector 2 (surface vertices)",
    "Left cortical sector 3 (surface vertices)",
    "Left cortical sector 4 (surface vertices)",
    "Right cortical sector 1 (surface vertices)",
    "Right cortical sector 2 (surface vertices)",
    "Right cortical sector 3 (surface vertices)",
    "Right cortical sector 4 (surface vertices)",
]


def _video_duration_ffprobe(path: str) -> float | None:
    try:
        out = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            stderr=subprocess.STDOUT,
            timeout=60,
        )
        return float(out.decode().strip())
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError, OSError):
        return None


def _segment_times(all_segments: tp.Sequence[tp.Any]) -> tuple[np.ndarray, np.ndarray]:
    starts: list[float] = []
    ends: list[float] = []
    for s in all_segments:
        off = float(getattr(s, "offset", getattr(s, "start", 0.0)))
        dur = float(getattr(s, "duration", getattr(s, "dur", 0.0)))
        if dur <= 0:
            tr = getattr(s, "TR", None)
            if tr is not None:
                dur = float(tr)
        starts.append(off)
        ends.append(off + max(dur, 1e-3))
    return np.asarray(starts, dtype=np.float64), np.asarray(ends, dtype=np.float64)


def _aggregate_lr_sectors(preds: np.ndarray) -> np.ndarray:
    """(T, V) -> (T, 8) by splitting each hemisphere into 4 contiguous vertex bands."""
    t, v = preds.shape
    half = v // 2
    if half * 2 != v:
        # Unexpected layout: fall back to 8 equal bins across all vertices
        edges = np.linspace(0, v, 9, dtype=int)
        return np.stack([preds[:, edges[i] : edges[i + 1]].mean(axis=1) for i in range(8)], axis=1)

    left = preds[:, :half]
    right = preds[:, half:]
    out_cols: list[np.ndarray] = []
    for hemi in (left, right):
        h = hemi.shape[1]
        edges = np.linspace(0, h, 5, dtype=int)
        for i in range(4):
            out_cols.append(hemi[:, edges[i] : edges[i + 1]].mean(axis=1))
    return np.stack(out_cols, axis=1)


def run_demo(video_path: str) -> dict[str, tp.Any]:
    duration = _video_duration_ffprobe(video_path) or 30.0
    tr = 1.5
    n = max(int(duration / tr), 8)
    rng = np.random.default_rng(42)
    t = np.linspace(0, duration, n, endpoint=False)
    base = 0.4 + 0.35 * np.sin(2 * np.pi * t / max(duration / 3, 1e-3))
    noise = 0.08 * rng.standard_normal(n)
    engagement = np.clip(base + noise, 0, None)
    region = np.outer(engagement, rng.uniform(0.7, 1.3, size=8))
    starts = t
    ends = t + tr
    return {
        "mode": "demo",
        "video_duration_sec": duration,
        "tr_sec": tr,
        "timestamps_start": starts.tolist(),
        "timestamps_end": ends.tolist(),
        "engagement": engagement.tolist(),
        "region_labels": REGION_LABELS,
        "region_timeseries": region.tolist(),
    }


def _resolve_torch_device(preference: str) -> str:
    """Match TRIBE’s ``device`` string: cuda / mps / cpu.

    TRIBE’s ``from_pretrained(..., device="auto")`` only picks CUDA or CPU.
    On Apple Silicon, ``mps`` is usually much faster than CPU for this stack.
    """
    import torch

    pref = (preference or "auto").strip().lower()
    if pref not in ("auto", ""):
        return pref
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _get_tribe_model():
    global _model_singleton
    if _model_singleton is not None:
        return _model_singleton
    from tribev2 import TribeModel  # type: ignore

    cache = os.environ.get("TRIBE_CACHE", "./tribe_cache")
    repo = os.environ.get("TRIBE_REPO", "facebook/tribev2")
    raw = os.environ.get("TRIBE_DEVICE", "auto")
    device = _resolve_torch_device(raw)
    if raw.lower() in ("auto", ""):
        logger.info("TRIBE_DEVICE=auto resolved to %s", device)
    _model_singleton = TribeModel.from_pretrained(repo, cache_folder=cache, device=device)
    return _model_singleton


def run_tribe(video_path: str, cache_folder: str | None = None) -> dict[str, tp.Any]:
    """Load TribeModel and run predict; raises on failure."""
    if cache_folder:
        os.environ["TRIBE_CACHE"] = cache_folder
    model = _get_tribe_model()
    events = model.get_events_dataframe(video_path=video_path)
    preds, all_segments = model.predict(events, verbose=False)
    preds = np.asarray(preds, dtype=np.float32)
    starts, ends = _segment_times(all_segments)
    duration = _video_duration_ffprobe(video_path)
    if duration is None and ends.size:
        duration = float(np.max(ends))
    elif duration is None:
        duration = float(starts[-1] + 1.5) if starts.size else 30.0

    region_ts = _aggregate_lr_sectors(preds)
    engagement = np.mean(np.abs(preds), axis=1)

    tr_est = float(np.median(np.diff(starts))) if starts.size > 1 else 1.5

    return {
        "mode": "tribe",
        "video_duration_sec": duration,
        "tr_sec": tr_est,
        "timestamps_start": starts.tolist(),
        "timestamps_end": ends.tolist(),
        "engagement": engagement.astype(float).tolist(),
        "region_labels": REGION_LABELS,
        "region_timeseries": region_ts.astype(float).tolist(),
    }


def analyze_video(video_path: str) -> dict[str, tp.Any]:
    force_demo = os.environ.get("TRIBE_DEMO", "").lower() in ("1", "true", "yes")
    if force_demo:
        logger.info("TRIBE_DEMO enabled; using synthetic timeline.")
        return run_demo(video_path)

    try:
        return run_tribe(video_path)
    except Exception as e:
        logger.warning("TRIBE inference unavailable (%s); using demo timeline.", e)
        data = run_demo(video_path)
        data["mode"] = "demo"
        data["fallback_error"] = str(e)
        return data
