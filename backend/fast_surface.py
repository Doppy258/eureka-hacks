"""Fast, real-data brain surface timeline derived from video features.

This module deliberately avoids the heavy TRIBE v2 feature extractors (which need
a GPU to be practical). Instead it derives per-timestep features directly from
the uploaded video — luminance, contrast, flicker, spatial entropy, edge density,
motion, center-vs-surround, composition imbalance, audio loudness, and audio
transients — and projects them onto the 20,484 fsaverage5 cortical vertices.

The result is a fast (~seconds), deterministic, video-driven brain timeline
suitable for interactive scrubbing in the web UI without GPU inference.
"""

from __future__ import annotations

import base64
import json
import logging
import shutil
import subprocess
import zlib
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from backend.tribe_runner import encode_f32_zlib_base64, video_duration_seconds

logger = logging.getLogger(__name__)

FSAVERAGE5_VERTICES = 20484
FSAVERAGE5_MESH_PATH = Path(__file__).resolve().parent / "static" / "fsaverage5_mesh.json"

REGION_CENTROIDS: list[tuple[str, list[tuple[float, float, float]]]] = [
    ("V1 (visual cortex)",         [(0.0, -95.0, 0.0)]),
    ("V2/V3 (visual cortex)",      [(0.0, -90.0, 5.0)]),
    ("Foveal V1",                  [(0.0, -95.0, 5.0)]),
    ("MT+ (motion area)",          [(48.0, -65.0, 5.0), (-48.0, -65.0, 5.0)]),
    ("Lateral V1/V2",              [(25.0, -90.0, -5.0), (-25.0, -90.0, -5.0)]),
    ("Dorsal V3 (vertical edges)", [(20.0, -85.0, 25.0), (-20.0, -85.0, 25.0)]),
    ("A1 (auditory cortex)",       [(55.0, -15.0, 5.0), (-55.0, -15.0, 5.0)]),
]

REGION_SIGMA_MM = 18.0


@lru_cache(maxsize=1)
def _load_fsaverage5_vertices() -> np.ndarray:
    """Return fsaverage5 vertex coordinates in RAS mm, shape (V=20484, 3).

    Vertices 0..10241 are the left hemisphere, 10242..20483 the right hemisphere,
    matching the order the frontend renderer concatenates them in.
    """
    if not FSAVERAGE5_MESH_PATH.exists():
        raise RuntimeError(
            f"fsaverage5 mesh JSON missing at {FSAVERAGE5_MESH_PATH}. "
            "Run `python backend/scripts/export_fsaverage5_mesh.py`."
        )
    payload = json.loads(FSAVERAGE5_MESH_PATH.read_text(encoding="utf-8"))
    lh = np.frombuffer(base64.b64decode(payload["lh"]["vertices_b64"]), dtype=np.float32).reshape(-1, 3)
    rh = np.frombuffer(base64.b64decode(payload["rh"]["vertices_b64"]), dtype=np.float32).reshape(-1, 3)
    verts = np.concatenate([lh, rh], axis=0).astype(np.float32, copy=False)
    if verts.shape[0] != FSAVERAGE5_VERTICES:
        raise RuntimeError(
            f"Unexpected fsaverage5 vertex count: got {verts.shape[0]}, expected {FSAVERAGE5_VERTICES}"
        )
    return verts


@lru_cache(maxsize=1)
def _build_region_basis() -> tuple[np.ndarray, tuple[str, ...]]:
    """Build a (R, V) anatomical Gaussian basis and matching label tuple.

    Each row is the sum of Gaussians centered on each site for that region,
    max-normalized to peak at 1.0 so feature scales are uniform.
    """
    verts = _load_fsaverage5_vertices()
    sigma2 = 2.0 * REGION_SIGMA_MM * REGION_SIGMA_MM
    rows: list[np.ndarray] = []
    labels: list[str] = []
    for name, sites in REGION_CENTROIDS:
        accum = np.zeros(verts.shape[0], dtype=np.float32)
        for site in sites:
            d2 = ((verts - np.asarray(site, dtype=np.float32)) ** 2).sum(axis=1)
            accum += np.exp(-d2 / sigma2).astype(np.float32)
        peak = float(accum.max())
        if peak > 0:
            accum /= peak
        # Zero out the long Gaussian tail so the (T,F)@(F,V) matmul never has to
        # multiply against denormal floats (~1e-19). This both speeds up the
        # matmul and stops Apple Accelerate from emitting spurious FP warnings.
        accum[accum < 1e-6] = 0.0
        rows.append(accum)
        labels.append(name)
    return np.stack(rows, axis=0), tuple(labels)


def _ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found on PATH. Install with `brew install ffmpeg`.")


def _ffmpeg_extract_grayscale(video_path: str, fps: float, width: int, height: int) -> np.ndarray:
    """Decode a video into a (T, H, W) uint8 grayscale tensor at *fps*."""
    _ensure_ffmpeg()
    cmd = [
        "ffmpeg",
        "-v", "error",
        "-i", str(video_path),
        "-vf", f"fps={fps:.3f},scale={width}:{height},format=gray",
        "-f", "rawvideo",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, check=True)
    raw = proc.stdout
    if not raw:
        raise RuntimeError("ffmpeg returned no video frames.")
    arr = np.frombuffer(raw, dtype=np.uint8)
    n_pixels = width * height
    n_frames = arr.size // n_pixels
    if n_frames == 0:
        raise RuntimeError("ffmpeg produced 0 decoded frames.")
    return arr[: n_frames * n_pixels].reshape(n_frames, height, width)


def _ffmpeg_extract_audio_envelope(video_path: str, target_T: int) -> np.ndarray:
    """Return per-window RMS loudness at len = target_T (zeros if no audio)."""
    _ensure_ffmpeg()
    sr = 8000
    cmd = [
        "ffmpeg",
        "-v", "error",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", str(sr),
        "-f", "s16le",
        "-",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, check=True)
    except subprocess.CalledProcessError:
        return np.zeros(target_T, dtype=np.float32)
    raw = proc.stdout
    if not raw:
        return np.zeros(target_T, dtype=np.float32)
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if audio.size == 0:
        return np.zeros(target_T, dtype=np.float32)
    # Bucket into target_T windows and take RMS.
    windows = np.array_split(audio, max(target_T, 1))
    env = np.array([np.sqrt(np.mean(w * w)) if w.size else 0.0 for w in windows], dtype=np.float32)
    if env.size != target_T:
        env = np.interp(np.linspace(0, 1, target_T), np.linspace(0, 1, env.size), env).astype(np.float32)
    # Normalize loosely.
    if env.max() > 1e-6:
        env = env / (np.percentile(env, 95) + 1e-6)
        env = np.clip(env, 0, 2.0)
    return env


def _zscore(x: np.ndarray) -> np.ndarray:
    mu = float(x.mean())
    sd = float(x.std()) + 1e-6
    return ((x - mu) / sd).astype(np.float32)


def _frame_entropy(frames: np.ndarray, bins: int = 16) -> np.ndarray:
    """Approximate per-frame grayscale entropy.

    This captures visual complexity / texture density. It is intentionally small
    (16 bins) so it adds a useful signal without becoming a heavy model.
    """
    out = np.zeros(frames.shape[0], dtype=np.float32)
    for i, frame in enumerate(frames):
        hist, _ = np.histogram(frame, bins=bins, range=(0.0, 1.0), density=False)
        p = hist.astype(np.float32)
        total = float(p.sum())
        if total <= 0:
            continue
        p /= total
        p = p[p > 0]
        out[i] = float(-(p * np.log2(p)).sum() / np.log2(bins))
    return out


def run_fast_surface(
    video_path: str,
    *,
    target_fps: float = 2.0,
    width: int = 160,
    height: int = 90,
) -> dict[str, Any]:
    """Fast video-driven brain surface timeline.

    Returns the same payload shape as ``run_tribe_surface`` so the existing
    frontend renderer works unchanged.
    """
    duration = video_duration_seconds(video_path) or 30.0
    frames = _ffmpeg_extract_grayscale(video_path, fps=target_fps, width=width, height=height)
    T = frames.shape[0]
    if T < 2:
        raise RuntimeError("Video too short to derive a timeline.")

    f = frames.astype(np.float32) / 255.0  # (T, H, W)

    # --- Per-timestep video features ---
    brightness = f.mean(axis=(1, 2))  # (T,)
    contrast = f.std(axis=(1, 2))
    cy, cx = height // 2, width // 2
    rh, rw = height // 5, width // 5
    center_patch = f[:, cy - rh : cy + rh, cx - rw : cx + rw]
    center = center_patch.mean(axis=(1, 2))
    center_contrast = center_patch.std(axis=(1, 2))
    surround = brightness  # close enough proxy
    cs = center - surround

    # Motion: mean absolute frame diff.
    frame_diff = np.abs(f[1:] - f[:-1])
    motion = np.concatenate([[0.0], frame_diff.mean(axis=(1, 2))])
    center_motion = np.concatenate([[0.0], np.abs(center_patch[1:] - center_patch[:-1]).mean(axis=(1, 2))])
    brightness_flicker = np.concatenate([[0.0], np.abs(np.diff(brightness))])
    motion_onset = np.concatenate([[0.0], np.abs(np.diff(motion))])

    # Optical-flow-ish horizontal/vertical gradients (cheap proxy):
    gx = np.abs(np.diff(f, axis=2)).mean(axis=(1, 2))
    gy = np.abs(np.diff(f, axis=1)).mean(axis=(1, 2))
    edge_density = np.sqrt(gx * gx + gy * gy)
    entropy = _frame_entropy(f)

    # Coarse composition imbalance: asymmetric shots often feel more dynamic
    # than perfectly flat frames, and top/bottom changes catch vertical motion.
    left_right_delta = f[:, :, : cx].mean(axis=(1, 2)) - f[:, :, cx:].mean(axis=(1, 2))
    top_bottom_delta = f[:, : cy, :].mean(axis=(1, 2)) - f[:, cy:, :].mean(axis=(1, 2))

    # --- Audio loudness aligned to T ---
    audio_env = _ffmpeg_extract_audio_envelope(video_path, target_T=T)
    audio_transient = np.concatenate([[0.0], np.abs(np.diff(audio_env))])

    # Feature order MUST match REGION_CENTROIDS row order: V1, V2/V3, foveal V1,
    # MT+, lateral V1/V2, dorsal V3, A1.
    feats = np.stack(
        [
            0.65 * _zscore(brightness) + 0.35 * _zscore(brightness_flicker),                 # -> V1
            0.55 * _zscore(contrast) + 0.30 * _zscore(edge_density) + 0.15 * _zscore(entropy), # -> V2/V3
            0.60 * _zscore(cs) + 0.25 * _zscore(center_contrast) + 0.15 * _zscore(center_motion), # -> foveal V1
            0.70 * _zscore(motion) + 0.30 * _zscore(motion_onset),                            # -> MT+
            0.60 * _zscore(gx) + 0.25 * _zscore(edge_density) + 0.15 * _zscore(left_right_delta), # -> lateral V1/V2
            0.65 * _zscore(gy) + 0.20 * _zscore(motion_onset) + 0.15 * _zscore(top_bottom_delta), # -> dorsal V3
            0.70 * _zscore(audio_env) + 0.30 * _zscore(audio_transient),                      # -> A1
        ],
        axis=1,
    )  # (T, F=7)

    # --- Spatial basis on fsaverage5 vertices (anatomical Gaussian) ---
    basis, region_labels = _build_region_basis()  # (R=7, V), tuple of 7 names
    V = basis.shape[1]
    if V != FSAVERAGE5_VERTICES:
        raise RuntimeError(f"basis vertex count {V} != fsaverage5 {FSAVERAGE5_VERTICES}")

    # Apple Accelerate / OpenBLAS occasionally raises spurious "divide by zero"
    # warnings when matmul touches denormal floats (the Gaussian basis tail goes
    # down to ~1e-19). Output is always finite, so silence those warnings to keep
    # logs clean on every demo request.
    with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
        preds = feats @ basis  # (T, V), spatially smooth + anatomically located

    # Per-timestep z-score + clip for the renderer.
    mu = preds.mean(axis=1, keepdims=True)
    sd = preds.std(axis=1, keepdims=True) + 1e-6
    preds = (preds - mu) / sd
    preds = np.clip(preds, -3.0, 3.0).astype(np.float32)

    # Per-region average z (using the "core" of each Gaussian patch where
    # basis_r > 0.5; the basis is max-normalized to 1 so this is the FWHM-ish core).
    core_masks = [b > 0.5 for b in basis]  # list of (V,) bool
    region_activations: list[list[dict[str, float | str]]] = []
    for t in range(T):
        row: list[dict[str, float | str]] = []
        for r, mask in enumerate(core_masks):
            if mask.any():
                z = float(preds[t, mask].mean())
            else:
                z = 0.0
            row.append({"name": region_labels[r], "z": z})
        region_activations.append(row)

    tr = 1.0 / float(target_fps)
    starts = np.arange(T, dtype=np.float32) * tr
    ends = starts + tr

    return {
        "mode": "fast",
        "video_duration_sec": float(duration),
        "tr_sec": float(tr),
        "timestamps_start": starts.astype(float).tolist(),
        "timestamps_end": ends.astype(float).tolist(),
        "vertex_count": int(V),
        "activations": encode_f32_zlib_base64(preds),
        "region_activations": region_activations,
    }


def build_fast_analyze_from_surface(surf: dict[str, Any]) -> dict[str, Any]:
    """Derive an AnalyzeResponse-shaped payload from a fast surface payload.

    Engagement is the per-timestep average magnitude of the 7 anatomical
    region z-scores produced by ``run_fast_surface`` — i.e. the same real,
    video-driven signal the brain visualizer is showing, just collapsed to a
    single scalar per timestep.
    """
    region_rows = surf.get("region_activations") or []
    starts = list(surf["timestamps_start"])
    ends = list(surf["timestamps_end"])
    T = len(starts)
    if T == 0 or not region_rows:
        # Fallback: a flat midline so the UI still has something to draw.
        return {
            "mode": "fast",
            "video_duration_sec": float(surf["video_duration_sec"]),
            "tr_sec": float(surf["tr_sec"]),
            "timestamps_start": starts,
            "timestamps_end": ends,
            "engagement": [0.5 for _ in starts],
            "region_labels": [],
            "region_timeseries": [],
        }

    region_labels = [str(entry["name"]) for entry in region_rows[0]]
    R = len(region_labels)
    region_ts = np.zeros((T, R), dtype=np.float32)
    for t, row in enumerate(region_rows):
        for r, entry in enumerate(row):
            region_ts[t, r] = float(entry["z"])

    # Engagement = per-timestep mean of |z| across the anatomical regions, then
    # min-max normalized to roughly [0, 1] so downstream code that treats it as
    # a "score" gets a sensible range.
    eng = np.abs(region_ts).mean(axis=1)
    if eng.max() > eng.min():
        eng_norm = (eng - eng.min()) / (eng.max() - eng.min())
    else:
        eng_norm = np.full_like(eng, 0.5)

    return {
        "mode": "fast",
        "video_duration_sec": float(surf["video_duration_sec"]),
        "tr_sec": float(surf["tr_sec"]),
        "timestamps_start": starts,
        "timestamps_end": ends,
        "engagement": eng_norm.astype(float).tolist(),
        "region_labels": region_labels,
        "region_timeseries": region_ts.astype(float).tolist(),
    }


def run_fast_analyze(
    video_path: str,
    *,
    target_fps: float = 1.0,
) -> dict[str, Any]:
    """Fast video-driven AnalyzeResponse payload (no TRIBE, no GPU).

    Returns the same shape as ``backend.tribe_runner.run_tribe`` /
    ``backend.tribe_runner.run_demo`` so the FastAPI ``/api/analyze`` route can
    swap it in transparently when ``TRIBE_REAL`` is unset.
    """
    return build_fast_analyze_from_surface(run_fast_surface(video_path, target_fps=target_fps))


def run_fast_pointcloud(
    video_path: str,
    *,
    max_points: int = 1024,
    target_fps: float = 1.0,
) -> dict[str, Any]:
    """Same idea as run_fast_surface, but downsampled to a (T, P) point cloud."""
    surf = run_fast_surface(video_path, target_fps=target_fps)
    encoded = surf["activations"]
    # Decode the float32 zlib payload back to (T, V) for downsampling.
    raw = zlib.decompress(base64.b64decode(encoded["data_b64"]))
    arr = np.frombuffer(raw, dtype=np.float32).reshape(encoded["shape"])  # (T, V)
    T, V = arr.shape
    P = int(min(max_points, V))
    idx = np.linspace(0, V - 1, P, dtype=np.int64)
    down = arr[:, idx]  # (T, P)

    # Brain-ish 2D point layout.
    i = np.arange(P, dtype=np.float32)
    phi = (np.sqrt(5.0) - 1.0) / 2.0
    theta = 2.0 * np.pi * (i * phi % 1.0)
    y = 1.0 - (2.0 * i + 1.0) / P
    r = np.sqrt(np.maximum(0.0, 1.0 - y * y))
    x = r * np.cos(theta)
    positions_2d = np.stack([x, y], axis=1).astype(np.float32)

    return {
        "mode": "fast",
        "video_duration_sec": float(surf["video_duration_sec"]),
        "tr_sec": float(surf["tr_sec"]),
        "timestamps_start": surf["timestamps_start"],
        "timestamps_end": surf["timestamps_end"],
        "point_count": int(P),
        "positions_2d": positions_2d.round(5).tolist(),
        "activations": down.round(5).tolist(),
        "region_activations": surf.get("region_activations", []),
    }
