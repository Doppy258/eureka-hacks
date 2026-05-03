"""Heuristic engagement feedback from aggregated TRIBE-style time series.

This is interpretive guidance based on summary statistics of model outputs,
not medical or neuroscientific advice.
"""

from __future__ import annotations

import typing as tp
from typing import Optional

import numpy as np

MIN_STALE_SECONDS = 2.0


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


def _normalize_0_100(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return np.asarray([], dtype=np.float64)

    # Fast-proxy engagement is already an absolute 0..1-ish salience score from
    # backend.fast_surface.build_fast_analyze_from_surface. Do NOT min/max it
    # within each clip, or a bad/flat video still manufactures a 100-point peak.
    if float(np.min(values)) >= 0.0 and float(np.max(values)) <= 1.5:
        return np.clip(values * 100.0, 0.0, 100.0)

    lo = float(np.min(values))
    hi = float(np.max(values))
    if hi <= lo:
        # A perfectly flat non-fast signal should read as low confidence, not a
        # fake middle score.
        return np.zeros(values.shape, dtype=np.float64)
    return np.clip(((values - lo) / (hi - lo)) * 100.0, 0.0, 100.0)


def _merge_boolean_runs(
    mask: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    min_duration_sec: float,
) -> list[dict[str, float]]:
    runs: list[dict[str, float]] = []
    run_start: Optional[float] = None
    run_end: Optional[float] = None
    run_scores: list[float] = []

    for i, active in enumerate(mask):
        if active:
            if run_start is None:
                run_start = float(starts[i])
                run_scores = []
            run_end = float(ends[i])
            run_scores.append(float(i))
        elif run_start is not None and run_end is not None:
            if run_end - run_start >= min_duration_sec:
                runs.append({"start": run_start, "end": run_end})
            run_start = None
            run_end = None
            run_scores = []

    if run_start is not None and run_end is not None and run_end - run_start >= min_duration_sec:
        runs.append({"start": run_start, "end": run_end})

    return runs


def _find_stale_segments(
    engagement: np.ndarray,
    normalized: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
) -> list[dict[str, tp.Any]]:
    if engagement.size == 0:
        return []
    if float(np.min(engagement)) >= 0.0 and float(np.max(engagement)) <= 1.5:
        # For fast-proxy scores, use an absolute stale threshold. This is what
        # lets a genuinely weak video be mostly stale instead of merely "lower
        # than its own tiny baseline."
        mask = normalized < 35.0
    else:
        threshold = float(np.mean(engagement) - 0.5 * np.std(engagement))
        mask = engagement < threshold
    runs = _merge_boolean_runs(mask, starts, ends, MIN_STALE_SECONDS)
    out: list[dict[str, tp.Any]] = []
    for run in runs:
        inside = (starts >= run["start"]) & (ends <= run["end"])
        avg = float(np.mean(normalized[inside])) if np.any(inside) else 0.0
        out.append(
            {
                "start": run["start"],
                "end": run["end"],
                "score": round(avg, 1),
                "reason": "Predicted brain response stays below the clip baseline for at least 2 seconds.",
            }
        )
    return out


def _window_score(
    normalized: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    start: float,
    end: float,
) -> float:
    mask = (starts < end) & (ends > start)
    if not np.any(mask):
        return 0.0
    return float(np.mean(normalized[mask]))


def _overall_creator_score(
    engagement: np.ndarray,
    normalized: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    video_duration_sec: float,
) -> float:
    if normalized.size == 0:
        return 0.0

    # Fast-proxy values are absolute 0..1-ish salience. Score these
    # conservatively: a constant noisy/loud clip should not get a 95 just
    # because every frame is stimulated. Reward peak strength, hook strength,
    # and variation over time; penalize flat high stimulation.
    is_fast_proxy = float(np.min(engagement)) >= 0.0 and float(np.max(engagement)) <= 1.5
    if not is_fast_proxy:
        return round(float(np.mean(normalized)), 1)

    mean_score = float(np.mean(normalized))
    p90_score = float(np.percentile(normalized, 90))
    hook_score = _window_score(normalized, starts, ends, 0.0, min(3.0, video_duration_sec))
    variation = float(np.std(normalized))
    variation_score = float(np.clip(variation * 2.2, 0.0, 100.0))

    base = (
        0.34 * p90_score
        + 0.24 * hook_score
        + 0.18 * mean_score
        + 0.24 * variation_score
    )

    # If the signal is flat, it may be loud/noisy, but it is not an engaging
    # edit curve. Good creator clips should have contrast: attention spikes,
    # resets, pattern interrupts, and quieter connective tissue.
    structure_multiplier = 0.35 + 0.65 * float(np.clip(variation / 32.0, 0.0, 1.0))
    score = base * structure_multiplier

    # Very low mean salience should stay low even if one frame jitters.
    if mean_score < 22.0:
        score *= mean_score / 22.0

    return round(float(np.clip(score, 0.0, 100.0)), 1)


def _find_peak_segments(
    normalized: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    duration: float,
    k: int = 3,
) -> list[dict[str, tp.Any]]:
    if normalized.size == 0:
        return []
    order = np.argsort(-normalized)
    selected: list[dict[str, tp.Any]] = []
    for raw_i in order:
        i = int(raw_i)
        center = (float(starts[i]) + float(ends[i])) / 2
        start = max(0.0, center - 1.5)
        end = min(duration, center + 1.5)
        if end - start < 1.0:
            end = min(duration, start + 1.0)
        overlaps = any(start < item["end"] and end > item["start"] for item in selected)
        if overlaps:
            continue
        selected.append(
            {
                "start": start,
                "end": end,
                "score": round(float(normalized[i]), 1),
                "reason": "Highest local predicted response; use this as a candidate reveal, payoff, or pattern interrupt.",
            }
        )
        if len(selected) >= k:
            break
    return selected


def _suggest_cut(peaks: list[dict[str, tp.Any]], duration: float, target_duration: float = 15.0) -> list[dict[str, float]]:
    if not peaks:
        return [{"start": 0.0, "end": min(duration, target_duration)}]

    remaining = target_duration
    clips: list[dict[str, float]] = []
    for peak in peaks:
        if remaining <= 0.1:
            break
        clip_start = max(0.0, float(peak["start"]))
        clip_end = min(duration, float(peak["end"]))
        clip_len = clip_end - clip_start
        if clip_len <= 0:
            continue
        if clip_len > remaining:
            clip_end = clip_start + remaining
        clips.append({"start": round(clip_start, 2), "end": round(clip_end, 2)})
        remaining -= clip_end - clip_start

    clips.sort(key=lambda item: item["start"])
    return clips


def _build_creator_report(
    *,
    engagement: np.ndarray,
    starts: np.ndarray,
    ends: np.ndarray,
    video_duration_sec: float,
    demo_mode: bool,
) -> dict[str, tp.Any]:
    normalized = _normalize_0_100(engagement)
    overall_score = _overall_creator_score(engagement, normalized, starts, ends, video_duration_sec)
    hook_score = round(_window_score(normalized, starts, ends, 0.0, min(3.0, video_duration_sec)), 1)
    stale_segments = _find_stale_segments(engagement, normalized, starts, ends)
    peak_segments = _find_peak_segments(normalized, starts, ends, video_duration_sec)
    stale_duration = sum(float(item["end"]) - float(item["start"]) for item in stale_segments)
    retention_risk = round((stale_duration / max(video_duration_sec, 1e-6)) * 100.0, 1)
    peak_density = round(len(peak_segments) / max(video_duration_sec / 10.0, 1e-6), 1)
    suggested_cut = _suggest_cut(peak_segments, video_duration_sec)

    suggestions: list[str] = []
    if peak_segments:
        strongest = peak_segments[0]
        suggestions.append(
            f"Move or tease the strongest moment ({_fmt_range(strongest['start'], strongest['end'])}) closer to the first 3 seconds."
        )
    if stale_segments:
        stale = stale_segments[0]
        suggestions.append(
            f"Cut, caption, zoom, or add a sound change around {_fmt_range(stale['start'], stale['end'])}; this is the clearest stale stretch."
        )
    if hook_score < overall_score:
        suggestions.append(
            "Your hook scores below the rest of the clip. Start with the reveal, a stronger visual change, or a sharper spoken claim."
        )
    if len(suggestions) < 3:
        suggestions.append(
            "Keep the science framing honest: treat this as a predicted editing signal, not a guarantee of viewer retention."
        )

    timeline = [
        {
            "start": round(float(starts[i]), 2),
            "end": round(float(ends[i]), 2),
            "brain_score": round(float(normalized[i]), 1),
            "label": (
                "stale"
                if any(float(starts[i]) >= s["start"] and float(ends[i]) <= s["end"] for s in stale_segments)
                else "high_engagement"
                if float(normalized[i]) >= 75
                else "medium"
            ),
        }
        for i in range(normalized.size)
    ]

    return {
        "product_name": "NeuroWatch",
        "mode_label": "TRIBE v2" if not demo_mode else "demo-safe proxy",
        "overall_score": overall_score,
        "hook_score": hook_score,
        "retention_risk": retention_risk,
        "peak_density": peak_density,
        "stale_segments": stale_segments,
        "peak_segments": peak_segments,
        "suggested_cut": suggested_cut,
        "suggestions": suggestions[:4],
        "timeline": timeline,
        "disclaimer": _disclaimer(),
    }


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
            "creator_report": _build_creator_report(
                engagement=eng,
                starts=starts,
                ends=ends,
                video_duration_sec=video_duration_sec,
                demo_mode=demo_mode,
            ),
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
        "creator_report": _build_creator_report(
            engagement=eng,
            starts=starts,
            ends=ends,
            video_duration_sec=video_duration_sec,
            demo_mode=demo_mode,
        ),
    }


def _disclaimer() -> str:
    return (
        "TRIBE v2 predicts population-average cortical responses to stimuli for research purposes. "
        "This app’s summaries and tips are heuristic interpretations of those predictions—not "
        "medical advice, not a measurement of your viewers’ brains, and not a guarantee of engagement."
    )
