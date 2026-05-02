"""Heuristic engagement feedback from aggregated TRIBE-style time series.

This is interpretive guidance based on summary statistics of model outputs,
not medical or neuroscientific advice.
"""

from __future__ import annotations

import typing as tp

import numpy as np


def _top_segments(
    engagement: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    k: int = 3,
) -> list[tuple[float, float, float]]:
    """Return up to k (start, end, score) windows with highest engagement."""
    if engagement.size == 0:
        return []
    idx = np.argsort(-engagement)[:k]
    out: list[tuple[float, float, float]] = []
    for i in idx:
        out.append((float(starts[i]), float(ends[i]), float(engagement[i])))
    return out


def _flat_segments(
    engagement: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    k: int = 2,
) -> list[tuple[float, float, float]]:
    """Return low-engagement windows."""
    if engagement.size == 0:
        return []
    idx = np.argsort(engagement)[:k]
    out: list[tuple[float, float, float]] = []
    for i in idx:
        out.append((float(starts[i]), float(ends[i]), float(engagement[i])))
    return out


def _fmt_range(a: float, b: float) -> str:
    return f"{a:.1f}s–{b:.1f}s"


def build_feedback(
    *,
    region_labels: list[str],
    region_timeseries: np.ndarray,
    engagement: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    video_duration_sec: float,
    demo_mode: bool,
) -> dict[str, tp.Any]:
    """Produce positives, negatives, and stimulation tips."""
    eng = np.asarray(engagement, dtype=np.float64).ravel()
    rs = np.asarray(region_timeseries, dtype=np.float64)
    if rs.ndim != 2:
        raise ValueError("region_timeseries must be 2D (time x regions)")

    positives: list[str] = []
    negatives: list[str] = []
    tips: list[str] = []

    if demo_mode:
        positives.append(
            "Demo mode: the timeline shows synthetic activity so you can explore the UI "
            "without loading TRIBE v2."
        )

    if eng.size == 0:
        negatives.append("No time bins were returned; try a different clip or format.")
        return {
            "positives": positives,
            "negatives": negatives,
            "stimulation_tips": [
                "Ensure the backend ran inference successfully and returned segment timings.",
            ],
            "disclaimer": _disclaimer(),
        }

    mean_e = float(np.mean(eng))
    std_e = float(np.std(eng)) if eng.size > 1 else 0.0
    peak = float(np.max(eng))
    trough = float(np.min(eng))

    tops = _top_segments(eng, starts, ends, k=min(3, eng.size))
    flats = _flat_segments(eng, starts, ends, k=min(2, eng.size))

    if tops:
        positives.append(
            f"Strongest predicted multimodal drive appears around {_fmt_range(tops[0][0], tops[0][1])} "
            f"(relative peak in model activity)."
        )
    if mean_e > 0:
        positives.append(
            f"Overall level of predicted cortical activity is moderate-to-present "
            f"(mean |aggregate| ≈ {mean_e:.3f} in normalized units)."
        )

    # Region-specific highlights
    if rs.shape[1] > 0 and rs.shape[0] == eng.shape[0]:
        mean_per_region = np.mean(np.abs(rs), axis=0)
        order = np.argsort(-mean_per_region)
        top_r = int(order[0])
        bot_r = int(order[-1])
        positives.append(
            f"Across coarse surface groups, “{region_labels[top_r]}” shows the highest average "
            f"predicted response; “{region_labels[bot_r]}” is comparatively quieter."
        )

    if std_e < 1e-6 or (peak > 0 and (peak - trough) / (peak + 1e-9) < 0.05):
        negatives.append(
            "Predicted activity is very flat over time; the clip may be visually/auditorily uniform "
            "or very short relative to the model's sampling."
        )
    if flats:
        negatives.append(
            f"Some stretches look comparatively subdued, e.g. {_fmt_range(flats[0][0], flats[0][1])}."
        )

    if not negatives:
        negatives.append(
            "No major “cold” periods detected at this resolution; consider trimming redundant segments "
            "if pacing still feels slow to viewers."
        )

    # Stimulation / engagement tips (creative + model-agnostic heuristics)
    if tops:
        tips.append(
            f"Repeat or echo motifs from your highest-response window ({_fmt_range(tops[0][0], tops[0][1])}) "
            "later in the edit to re-trigger similar multimodal cues."
        )
    tips.append(
        "Alternate visual motion, faces or hands on screen, and clear speech onsets; encoding models "
        "like TRIBE v2 respond to coordinated changes across video and audio."
    )
    tips.append(
        "Use contrast (quiet ↔ loud, static ↔ motion) on cuts every few seconds to avoid long "
        "plateaus in predicted activity."
    )
    if video_duration_sec > 120:
        tips.append(
            f"At ~{video_duration_sec:.0f}s runtime, consider chaptering or pattern interrupts so "
            "attention-heavy cues are redistributed across the timeline."
        )

    return {
        "positives": positives,
        "negatives": negatives,
        "stimulation_tips": tips,
        "disclaimer": _disclaimer(),
    }


def _disclaimer() -> str:
    return (
        "TRIBE v2 predicts population-average cortical responses to stimuli for research purposes. "
        "This app’s summaries and tips are heuristic interpretations of those predictions—not "
        "medical advice, not a measurement of your viewers’ brains, and not a guarantee of engagement."
    )
