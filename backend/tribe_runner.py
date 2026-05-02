"""Minimal TRIBE v2 adapter for NeuroWatch.

This module intentionally keeps only the inference calls NeuroWatch needs:
``TribeModel.from_pretrained``, ``get_events_dataframe(video_path=...)``, and
``predict(events=...)``. Training, plotting, datasets, and notebooks stay out of
this repository.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import typing as tp
from typing import Optional
from pathlib import Path

import numpy as np
import zlib
import base64

logger = logging.getLogger(__name__)

_model_singleton: Optional[tp.Any] = None

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


def _video_duration_ffprobe(path: str) -> Optional[float]:
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


def video_duration_seconds(path: str) -> Optional[float]:
    """Best-effort video duration for upload validation before heavy inference."""
    return _video_duration_ffprobe(path)


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
    try:
        # Allow using the local Tribev2 checkout used in `new-test/tribev2`
        repo_root = tp.cast("tp.Any", __file__)
        try:
            from pathlib import Path

            repo_root = Path(__file__).resolve().parents[1]
            local_tribe = repo_root / "new-test" / "tribev2"
            if local_tribe.exists() and str(local_tribe) not in sys.path:
                sys.path.insert(0, str(local_tribe))
        except Exception:
            pass
        from tribev2 import TribeModel  # type: ignore
    except ImportError as e:
        raise RuntimeError(
            "TRIBE v2 is not installed in this Python environment. For the lightweight app, run with "
            "TRIBE_DEMO=1 locally or set REMOTE_TRIBE_URL to a Colab/GPU backend that has TRIBE installed."
        ) from e

    # Match the official TRIBE v2 quickstart default (`cache_folder="./cache"`).
    # The launcher runs the backend with cwd = new-test/tribev2 so "./cache" resolves
    # exactly like your standalone script and feature caches hit.
    cache = os.environ.get("TRIBE_CACHE", "./cache")
    repo = os.environ.get("TRIBE_REPO", "facebook/tribev2")
    raw = os.environ.get("TRIBE_DEVICE", "auto")
    device = _resolve_torch_device(raw)
    if raw.lower() in ("auto", ""):
        logger.info("TRIBE_DEVICE=auto resolved to %s", device)
    # Critical for macOS + PyTorch DataLoader: avoid spawning workers that re-import __main__.
    # Also override extractor device defaults from the training config (often "cuda").
    # Feature extractors in this config only accept cpu/cuda/auto/accelerate (not mps).
    import torch

    feature_device = "cuda" if torch.cuda.is_available() else "cpu"
    _model_singleton = TribeModel.from_pretrained(
        repo,
        cache_folder=cache,
        device=device,
        config_update={
            "data.num_workers": 0,
            "data.audio_feature.device": feature_device,
            "data.image_feature.image.device": feature_device,
            "data.text_feature.device": feature_device,
            "data.video_feature.image.device": feature_device,
        },
    )
    return _model_singleton


def run_tribe(video_path: str, cache_folder: Optional[str] = None) -> dict[str, tp.Any]:
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


def run_tribe_vertices(
    video_path: str,
    *,
    max_points: int = 2048,
    seed: int = 0,
) -> dict[str, tp.Any]:
    """Return a lightweight point-cloud timeline for web visualization.

    Output shape: activations[T][P], where P = max_points (downsampled vertices).
    """
    model = _get_tribe_model()
    events = model.get_events_dataframe(video_path=video_path)
    preds, all_segments = model.predict(events, verbose=False)
    preds = np.asarray(preds, dtype=np.float32)  # (T, V)
    starts, ends = _segment_times(all_segments)

    t, v = preds.shape
    p = int(min(max_points, v))
    rng = np.random.default_rng(seed)
    idx = np.linspace(0, v - 1, p, dtype=np.int64)
    # Add a tiny shuffle for nicer spatial distribution while staying deterministic.
    jitter = rng.permutation(p)
    idx = idx[jitter]

    down = preds[:, idx]  # (T, P)
    # Normalize per-timestep for visualization (robust to global scale).
    mu = down.mean(axis=1, keepdims=True)
    sd = down.std(axis=1, keepdims=True) + 1e-6
    z = (down - mu) / sd
    z = np.clip(z, -3.0, 3.0).astype(np.float32)

    # Deterministic “brain-ish” 2D projection: points on a sphere projected to 2D.
    # This is intentionally lightweight (no fsaverage mesh download).
    i = np.arange(p, dtype=np.float32)
    phi = (np.sqrt(5.0) - 1.0) / 2.0  # golden ratio conjugate
    theta = 2.0 * np.pi * (i * phi % 1.0)
    y = 1.0 - (2.0 * i + 1.0) / p
    r = np.sqrt(np.maximum(0.0, 1.0 - y * y))
    x = r * np.cos(theta)
    z3 = r * np.sin(theta)
    # Simple camera projection
    positions_2d = np.stack([x, y], axis=1).astype(np.float32)  # (P, 2)

    duration = _video_duration_ffprobe(video_path)
    if duration is None and ends.size:
        duration = float(np.max(ends))
    elif duration is None:
        duration = float(starts[-1] + 1.5) if starts.size else 30.0

    return {
        "mode": "tribe",
        "video_duration_sec": float(duration),
        "tr_sec": float(np.median(np.diff(starts))) if starts.size > 1 else 1.5,
        "timestamps_start": starts.astype(float).tolist(),
        "timestamps_end": ends.astype(float).tolist(),
        "point_count": int(p),
        "positions_2d": positions_2d.round(5).tolist(),
        "activations": z.round(5).tolist(),
    }


def encode_f32_zlib_base64(arr: np.ndarray) -> dict[str, tp.Any]:
    """Encode a float32 array as base64(zlib(raw-bytes)).

    Frontend contract:
    - data_b64 decodes to zlib-compressed raw little-endian bytes (C-order).
    - dtype is always 'float32'.
    - shape is arr.shape.
    """
    a = np.asarray(arr, dtype=np.float32, order="C")
    raw = a.tobytes(order="C")
    comp = zlib.compress(raw, level=6)
    return {
        "dtype": "float32",
        "shape": list(a.shape),
        "compression": "zlib",
        "data_b64": base64.b64encode(comp).decode("ascii"),
    }


def run_tribe_surface(
    video_path: str,
    *,
    normalize_per_timestep: bool = True,
    clip_z: float = 3.0,
) -> dict[str, tp.Any]:
    """Return full vertex activations for fsaverage5-style surfaces.

    Output:
    - timestamps_start/end, tr_sec, duration
    - activations: base64(zlib(float32 bytes)) with shape (T, V)
    """
    model = _get_tribe_model()
    events = model.get_events_dataframe(video_path=video_path)
    preds, all_segments = model.predict(events, verbose=False)
    preds = np.asarray(preds, dtype=np.float32)  # (T, V)
    starts, ends = _segment_times(all_segments)

    if normalize_per_timestep and preds.size:
        mu = preds.mean(axis=1, keepdims=True)
        sd = preds.std(axis=1, keepdims=True) + 1e-6
        preds = (preds - mu) / sd
        if clip_z is not None:
            preds = np.clip(preds, -float(clip_z), float(clip_z))

    duration = _video_duration_ffprobe(video_path)
    if duration is None and ends.size:
        duration = float(np.max(ends))
    elif duration is None:
        duration = float(starts[-1] + 1.5) if starts.size else 30.0

    return {
        "mode": "tribe",
        "video_duration_sec": float(duration),
        "tr_sec": float(np.median(np.diff(starts))) if starts.size > 1 else 1.5,
        "timestamps_start": starts.astype(float).tolist(),
        "timestamps_end": ends.astype(float).tolist(),
        "vertex_count": int(preds.shape[1]),
        "activations": encode_f32_zlib_base64(preds),
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
