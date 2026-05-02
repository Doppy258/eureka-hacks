import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  Brain,
  Clock,
  FileVideo,
  Flame,
  RotateCcw,
  Scissors,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react'
import BrainSurfaceRenderer, { decodeEncodedFloat32, type SurfaceMeshJson } from './BrainSurfaceRenderer'
import './studio.css'
import './App.css'

type CreatorSegment = {
  start: number
  end: number
  score?: number
  reason?: string
}

type CreatorTimelinePoint = {
  start: number
  end: number
  brain_score: number
  label: 'stale' | 'high_engagement' | 'medium' | string
}

type CreatorReport = {
  product_name: string
  mode_label: string
  overall_score: number
  hook_score: number
  retention_risk: number
  peak_density: number
  stale_segments: CreatorSegment[]
  peak_segments: CreatorSegment[]
  suggested_cut: CreatorSegment[]
  suggestions: string[]
  timeline: CreatorTimelinePoint[]
  disclaimer: string
}

type AnalyzeResponse = {
  job_id: string
  video_url: string
  mode: string
  inference_source?: string
  video_duration_sec: number
  tr_sec: number
  timestamps_start: number[]
  timestamps_end: number[]
  engagement: number[]
  region_labels: string[]
  region_timeseries: number[][]
  feedback: {
    positives: string[]
    negatives: string[]
    stimulation_tips: string[]
    disclaimer: string
    creator_report?: CreatorReport
  } | null
  fallback_error?: string | null
}

type EncodedFloatArray = {
  dtype: 'float32'
  shape: number[]
  compression: 'zlib'
  data_b64: string
}

type RegionActivation = {
  name: string
  z: number
}

type BrainSurfaceTimelineResponse = {
  job_id?: string | null
  video_url: string
  mode: string
  video_duration_sec: number
  tr_sec: number
  timestamps_start: number[]
  timestamps_end: number[]
  vertex_count: number
  mesh: { name: string; url: string }
  activations: EncodedFloatArray
  region_activations?: RegionActivation[][]
}

type SurfaceState = {
  timeline: BrainSurfaceTimelineResponse
  mesh: SurfaceMeshJson
  activations: Float32Array
}

type ChartPoint = {
  t: number
  score: number
  label: string
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function normalizeScores(values: number[]): number[] {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max <= min) return values.map(() => 50)
  return values.map((value) => Math.round(((value - min) / (max - min)) * 1000) / 10)
}

function buildFallbackReport(result: AnalyzeResponse): CreatorReport {
  const normalized = normalizeScores(result.engagement)
  const timeline = result.timestamps_start.map((start, i) => {
    const score = normalized[i] ?? 0
    return {
      start,
      end: result.timestamps_end[i] ?? start + result.tr_sec,
      brain_score: score,
      label: score >= 75 ? 'high_engagement' : score <= 35 ? 'stale' : 'medium',
    }
  })
  const sorted = [...timeline].sort((a, b) => b.brain_score - a.brain_score)
  const peaks = sorted.slice(0, 3).map((point) => ({
    start: Math.max(0, point.start - 0.5),
    end: Math.min(result.video_duration_sec, point.end + 0.5),
    score: point.brain_score,
    reason: 'Highest local predicted response in the uploaded clip.',
  }))
  const stale = timeline
    .filter((point) => point.label === 'stale')
    .slice(0, 3)
    .map((point) => ({
      start: point.start,
      end: point.end,
      score: point.brain_score,
      reason: 'Predicted response is low compared with the rest of the clip.',
    }))
  const hookPoints = timeline.filter((point) => point.start < 3)
  const hookScore = hookPoints.length
    ? hookPoints.reduce((sum, point) => sum + point.brain_score, 0) / hookPoints.length
    : 0

  return {
    product_name: 'NeuroWatch',
    mode_label: getModeLabel(result),
    overall_score: Math.round((normalized.reduce((sum, value) => sum + value, 0) / Math.max(normalized.length, 1)) * 10) / 10,
    hook_score: Math.round(hookScore * 10) / 10,
    retention_risk: Math.round((stale.length / Math.max(timeline.length, 1)) * 1000) / 10,
    peak_density: Math.round((peaks.length / Math.max(result.video_duration_sec / 10, 1)) * 10) / 10,
    stale_segments: stale,
    peak_segments: peaks,
    suggested_cut: peaks.map((peak) => ({ start: peak.start, end: peak.end })),
    suggestions: [
      peaks[0]
        ? `Open with or tease the strongest moment around ${formatTime(peaks[0].start)}.`
        : 'Upload a clip with clear visual and audio changes for a stronger report.',
      stale[0]
        ? `Tighten ${formatTime(stale[0].start)}-${formatTime(stale[0].end)} or add a visual change there.`
        : 'No obvious stale section was detected at this resolution.',
      'Use this as a predicted editing signal, not a guarantee of real audience retention.',
    ],
    timeline,
    disclaimer: result.feedback?.disclaimer ?? '',
  }
}

function getModeLabel(result: AnalyzeResponse): string {
  if (result.inference_source === 'remote') {
    return result.mode === 'tribe' ? 'remote TRIBE v2' : 'remote demo-safe proxy'
  }
  if (result.inference_source === 'local') {
    return result.mode === 'tribe' ? 'local TRIBE v2' : 'demo-safe proxy'
  }
  if (result.inference_source === 'fast') {
    return 'fast video-driven proxy'
  }
  return result.mode === 'tribe' ? 'TRIBE v2' : 'demo-safe proxy'
}

function apiErrorMessage(body: string, fallback: string): string {
  if (!body) return fallback
  try {
    const parsed = JSON.parse(body) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
    if (Array.isArray(parsed.detail)) return parsed.detail.map((item) => String(item?.msg ?? item)).join('; ')
  } catch {
    return body
  }
  return body
}

function scoreTone(score: number): string {
  if (score >= 72) return 'strong'
  if (score >= 45) return 'steady'
  return 'risk'
}

// The mesh endpoint is static and immutable, so we always hit the same URL.
// Caching the in-flight promise (and the decoded result) means the second
// surface load — for example after a real upload — never fetches the 1MB mesh
// JSON again.
const MESH_URL = '/api/brain/surface/fsaverage5'
let meshPromise: Promise<SurfaceMeshJson> | null = null

function fetchMeshOnce(): Promise<SurfaceMeshJson> {
  if (meshPromise) return meshPromise
  meshPromise = (async () => {
    const meshRes = await fetch(MESH_URL)
    if (!meshRes.ok) {
      meshPromise = null
      throw new Error((await meshRes.text()) || meshRes.statusText)
    }
    return (await meshRes.json()) as SurfaceMeshJson
  })()
  return meshPromise
}

async function fetchSurfaceFromTimeline(
  timeline: BrainSurfaceTimelineResponse,
  meshOverride?: SurfaceMeshJson,
): Promise<SurfaceState> {
  const [mesh, activations] = await Promise.all([
    meshOverride ? Promise.resolve(meshOverride) : fetchMeshOnce(),
    decodeEncodedFloat32(timeline.activations),
  ])
  return { timeline, mesh, activations }
}

export default function StudioApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [surface, setSurface] = useState<SurfaceState | null>(null)
  const [surfaceError, setSurfaceError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(true)
  const [playhead, setPlayhead] = useState(0)

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  // Auto-load the precomputed IMG_2225.mp4 demo so the studio is interactive
  // immediately on mount. Both fetches are JSON cache hits (~hundreds of ms).
  const loadDemo = useCallback(async (): Promise<void> => {
    setDemoLoading(true)
    setError(null)
    setSurfaceError(null)
    try {
      // Fire all three requests in parallel (analyze, surface timeline, mesh).
      // The mesh is static and module-cached so subsequent demo reloads skip it.
      const meshReq = fetchMeshOnce().catch(() => null)
      const analyzeReq = fetch('/api/hardcoded/analyze').then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || r.statusText)
        return (await r.json()) as AnalyzeResponse
      })
      const surfaceReq = fetch('/api/hardcoded/brain_surface').then(async (r) => {
        if (!r.ok) throw new Error((await r.text()) || r.statusText)
        return (await r.json()) as BrainSurfaceTimelineResponse
      })

      const [analyzeRes, surfaceTimeline] = await Promise.allSettled([analyzeReq, surfaceReq])

      if (analyzeRes.status === 'fulfilled') {
        setResult(analyzeRes.value)
        setUsingDemo(true)
      } else {
        throw analyzeRes.reason instanceof Error
          ? analyzeRes.reason
          : new Error(String(analyzeRes.reason))
      }

      if (surfaceTimeline.status === 'fulfilled') {
        try {
          const mesh = (await meshReq) ?? undefined
          const next = await fetchSurfaceFromTimeline(surfaceTimeline.value, mesh)
          setSurface(next)
        } catch (e) {
          setSurfaceError(e instanceof Error ? e.message : 'Failed to load brain surface mesh.')
          setSurface(null)
        }
      } else {
        setSurfaceError(
          surfaceTimeline.reason instanceof Error
            ? surfaceTimeline.reason.message
            : String(surfaceTimeline.reason),
        )
        setSurface(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo clip.')
    } finally {
      setDemoLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await loadDemo()
    })()
    return () => {
      cancelled = true
    }
  }, [loadDemo])

  const report = useMemo(() => {
    if (!result) return null
    return result.feedback?.creator_report ?? buildFallbackReport(result)
  }, [result])

  const modeLabel = result ? report?.mode_label ?? getModeLabel(result) : 'ready'

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!report) return []
    return report.timeline.map((point) => ({
      t: Math.round(((point.start + point.end) / 2) * 100) / 100,
      score: point.brain_score,
      label: point.label,
    }))
  }, [report])

  const brainCells = useMemo(() => {
    const points = report?.timeline ?? []
    if (!points.length) {
      return Array.from({ length: 24 }, (_, i) => ({ key: i, score: 18 + (i % 5) * 4 }))
    }
    return Array.from({ length: 24 }, (_, i) => {
      const point = points[Math.floor((i / 24) * points.length)] ?? points[0]
      return { key: i, score: point.brain_score }
    })
  }, [report])

  // Map the current playhead -> active surface timestep via binary search over
  // timestamps_start. Mirrors the BrainTimelineViewer behavior so the brain
  // updates as the source clip plays.
  const surfaceTimestep = useMemo(() => {
    if (!surface) return 0
    const starts = surface.timeline.timestamps_start
    if (!starts.length) return 0
    let lo = 0
    let hi = starts.length - 1
    let best = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (starts[mid] <= playhead) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return best
  }, [surface, playhead])

  const topRegions = useMemo(() => {
    if (!surface?.timeline.region_activations) return null
    const row = surface.timeline.region_activations[surfaceTimestep]
    if (!row || row.length === 0) return null
    return row
      .slice()
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 3)
  }, [surface, surfaceTimestep])

  // Prefer the user's local preview URL while a custom video is selected so
  // playback works instantly even before the analysis completes.
  const videoSrc = previewUrl ?? result?.video_url ?? undefined

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setError(null)
    setUploadProgress(0)
    if (!selected) {
      setFile(null)
      setPreviewUrl(null)
      return
    }
    const supported = ['video/mp4', 'video/quicktime', 'video/webm']
    if (!supported.includes(selected.type) && !/\.(mp4|mov|webm)$/i.test(selected.name)) {
      setFile(null)
      setPreviewUrl(null)
      setError('Upload an .mp4, .mov, or .webm file.')
      return
    }
    const url = URL.createObjectURL(selected)
    previewUrlRef.current = url
    setFile(selected)
    setPreviewUrl(url)
    // Picking a custom file means we're no longer "in demo mode"; the demo
    // analysis result stays visible until the new analysis completes.
    setUsingDemo(false)
  }

  const resetToDemo = useCallback(async () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setFile(null)
    setPreviewUrl(null)
    setUploadProgress(0)
    await loadDemo()
  }, [loadDemo])

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, seconds)
    video.play().catch(() => {})
  }, [])

  const analyze = async () => {
    if (!file) {
      setError('Choose a video first.')
      return
    }

    setLoading(true)
    setUploadProgress(0)
    setError(null)
    setSurfaceError(null)
    setResult(null)
    setSurface(null)
    setUsingDemo(false)

    const postWithProgress = <T,>(url: string): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as T)
            return
          }
          reject(new Error(apiErrorMessage(xhr.responseText, xhr.statusText)))
        }
        xhr.onerror = () => reject(new Error('Connection failed. Is the FastAPI backend running on port 8000?'))
        const formData = new FormData()
        formData.append('file', file)
        xhr.send(formData)
      })

    try {
      // Run the heavy report and the brain-surface fetch in parallel; the
      // surface route uses the fast video-driven proxy (~seconds) so it almost
      // always finishes before the report.
      const [analyzeRes, surfaceRes] = await Promise.allSettled([
        postWithProgress<AnalyzeResponse>('/api/analyze?include_feedback=true'),
        postWithProgress<BrainSurfaceTimelineResponse>('/api/brain/surface_timeline'),
      ])

      if (analyzeRes.status === 'fulfilled') {
        setResult(analyzeRes.value)
      } else {
        throw analyzeRes.reason instanceof Error
          ? analyzeRes.reason
          : new Error(String(analyzeRes.reason))
      }

      if (surfaceRes.status === 'fulfilled') {
        try {
          const next = await fetchSurfaceFromTimeline(surfaceRes.value)
          setSurface(next)
        } catch (e) {
          setSurfaceError(e instanceof Error ? e.message : 'Failed to load brain surface mesh.')
          setSurface(null)
        }
      } else {
        setSurfaceError(
          surfaceRes.reason instanceof Error
            ? surfaceRes.reason.message
            : String(surfaceRes.reason),
        )
      }

      setUploadProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="studio-root">
      <section className="nw-hero">
        <nav className="nw-nav" aria-label="NeuroWatch navigation">
          <Link to="/" className="nw-brand">
            <span className="nw-brand-mark" aria-hidden="true">
              <Brain size={18} />
            </span>
            NeuroWatch
          </Link>
          <a href="#dashboard" className="nw-nav-link">
            dashboard
          </a>
        </nav>

        <div className="nw-hero-grid">
          <div>
            <p className="nw-kicker">pre-upload brain-response debugger</p>
            <h1>See where your content wakes the brain up, and where it goes stale.</h1>
            <p className="nw-lede">
              {usingDemo
                ? 'Demo clip pre-loaded. Press play and watch the brain respond — then upload your own video to compare.'
                : 'Upload a short video and get a creator report: hook score, stale sections, top moments, a suggested 15-second cut, and timestamped edit notes.'}
            </p>
            <div className="nw-hero-actions">
              <label className="nw-upload-button">
                <Upload size={18} />
                <span>{file ? file.name : 'Choose video'}</span>
                <input type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={onFile} />
              </label>
              <button
                type="button"
                className="nw-primary-button"
                disabled={loading || !file}
                onClick={analyze}
              >
                {loading ? 'Analyzing…' : 'Analyze video'}
              </button>
              {!usingDemo ? (
                <button
                  type="button"
                  className="nw-secondary-button"
                  disabled={loading || demoLoading}
                  onClick={() => {
                    void resetToDemo()
                  }}
                >
                  <RotateCcw size={16} />
                  <span>Reset to demo</span>
                </button>
              ) : null}
            </div>
            <p className="nw-file-note">
              {usingDemo
                ? 'Showing the bundled IMG_2225 demo (precomputed). MVP supports .mp4, .mov, and .webm clips from 10 to 90 seconds.'
                : 'MVP supports .mp4, .mov, and .webm clips from 10 to 90 seconds.'}
            </p>
          </div>

          <DemoBrain
            surface={surface}
            timestep={surfaceTimestep}
            topRegions={topRegions}
            fallbackCells={brainCells}
            score={report?.overall_score ?? 42}
            mode={demoLoading && usingDemo ? 'loading demo…' : modeLabel}
            surfaceError={surfaceError}
          />
        </div>
      </section>

      {loading ? <ProcessingState progress={uploadProgress} /> : null}
      {error ? <div className="nw-error">{error}</div> : null}
      {result?.fallback_error ? (
        <div className="nw-warning">
          <strong>Using fallback output.</strong>
          <span>{result.fallback_error}</span>
        </div>
      ) : null}

      <section id="dashboard" className="nw-dashboard">
        <div className="nw-video-card">
          <div className="nw-card-heading">
            <div>
              <p className="nw-kicker">source clip</p>
              <h2>Playback lab</h2>
            </div>
            {result ? <span className="nw-mode-pill">{modeLabel}</span> : null}
          </div>
          <div className="nw-video-frame">
            {videoSrc ? (
              <video ref={videoRef} src={videoSrc} controls onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)} />
            ) : (
              <div className="nw-empty-video">
                <FileVideo size={42} />
                <span>Upload a creator clip to start the report.</span>
              </div>
            )}
          </div>
          <div className="nw-time-row">
            <span>Current time</span>
            <strong>{formatTime(playhead)}</strong>
          </div>
        </div>

        <aside className="nw-report-card">
          <div className="nw-card-heading">
            <div>
              <p className="nw-kicker">creator report</p>
              <h2>{report ? 'Ready to edit' : 'Waiting for upload'}</h2>
            </div>
            <Sparkles size={22} />
          </div>

          {report ? (
            <>
              <div className="nw-runtime-status">
                <span>Inference source</span>
                <strong>{modeLabel}</strong>
              </div>
              <div className="nw-score-grid">
                <ScoreCard icon={<Activity size={18} />} label="overall" value={report.overall_score} />
                <ScoreCard icon={<Flame size={18} />} label="hook" value={report.hook_score} />
                <ScoreCard icon={<AlertTriangle size={18} />} label="risk" value={report.retention_risk} suffix="%" />
                <ScoreCard icon={<Zap size={18} />} label="peaks / 10s" value={report.peak_density} compact />
              </div>

              <section className="nw-insight-block">
                <h3>Top moments</h3>
                <SegmentList segments={report.peak_segments} emptyText="No peak moments yet." onSeek={seekTo} />
              </section>

              <section className="nw-insight-block">
                <h3>Stale sections</h3>
                <SegmentList segments={report.stale_segments} emptyText="No stale stretches detected." onSeek={seekTo} />
              </section>
            </>
          ) : (
            <div className="nw-empty-report">
              <Clock size={28} />
              <p>
                The dashboard will show hook score, retention risk, top moments, stale sections,
                and suggested cuts after analysis.
              </p>
            </div>
          )}
        </aside>
      </section>

      {report ? (
        <>
          <section className="nw-timeline-card">
            <div className="nw-card-heading">
              <div>
                <p className="nw-kicker">brain engagement timeline</p>
                <h2>Clickable predicted response over time</h2>
              </div>
              <span className="nw-legend"><span /> stale zones shaded</span>
            </div>
            <div className="nw-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 12, right: 20, left: 0, bottom: 8 }}
                  onClick={(state) => {
                    if (state?.activeLabel !== undefined) seekTo(Number(state.activeLabel))
                  }}
                >
                  <defs>
                    <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--nw-accent)" stopOpacity={0.42} />
                      <stop offset="95%" stopColor="var(--nw-accent)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(222, 231, 224, 0.08)" vertical={false} />
                  <XAxis dataKey="t" tickFormatter={formatTime} stroke="var(--nw-muted)" fontSize={12} />
                  <YAxis domain={[0, 100]} width={34} stroke="var(--nw-muted)" fontSize={12} />
                  <Tooltip content={<TimelineTooltip />} />
                  {report.stale_segments.map((segment) => (
                    <ReferenceArea
                      key={`${segment.start}-${segment.end}`}
                      x1={segment.start}
                      x2={segment.end}
                      fill="var(--nw-danger)"
                      fillOpacity={0.18}
                    />
                  ))}
                  <ReferenceLine x={playhead} stroke="var(--nw-warm)" strokeDasharray="4 4" />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="var(--nw-accent)"
                    strokeWidth={3}
                    fill="url(#scoreFill)"
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="nw-edit-grid">
            <article className="nw-edit-card">
              <div className="nw-card-heading">
                <div>
                  <p className="nw-kicker">suggested 15-second cut</p>
                  <h2>Timestamp recipe</h2>
                </div>
                <Scissors size={22} />
              </div>
              <SegmentList segments={report.suggested_cut} emptyText="No cut suggestion yet." onSeek={seekTo} />
            </article>

            <article className="nw-edit-card">
              <p className="nw-kicker">creator advice</p>
              <h2>Specific fixes</h2>
              <ul className="nw-advice-list">
                {report.suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            </article>
          </section>

          <p className="nw-disclaimer">{report.disclaimer}</p>
        </>
      ) : null}
    </main>
  )
}

function ScoreCard({
  icon,
  label,
  value,
  suffix = '/100',
  compact = false,
}: {
  icon: ReactNode
  label: string
  value: number
  suffix?: string
  compact?: boolean
}) {
  return (
    <div className={`nw-score-card ${scoreTone(value)}`}>
      <div className="nw-score-icon">{icon}</div>
      <span>{label}</span>
      <strong>
        {compact ? value : Math.round(value)}
        <small>{suffix}</small>
      </strong>
    </div>
  )
}

function SegmentList({
  segments,
  emptyText,
  onSeek,
}: {
  segments: CreatorSegment[]
  emptyText: string
  onSeek: (seconds: number) => void
}) {
  if (!segments.length) {
    return <p className="nw-muted">{emptyText}</p>
  }
  return (
    <ol className="nw-segment-list">
      {segments.map((segment, index) => (
        <li key={`${segment.start}-${segment.end}-${index}`}>
          <button type="button" onClick={() => onSeek(segment.start)}>
            <span>{formatTime(segment.start)}-{formatTime(segment.end)}</span>
            {typeof segment.score === 'number' ? <strong>{Math.round(segment.score)}</strong> : null}
          </button>
          {segment.reason ? <p>{segment.reason}</p> : null}
        </li>
      ))}
    </ol>
  )
}

function BrainHeatmap({ cells, score, mode }: { cells: { key: number; score: number }[]; score: number; mode: string }) {
  return (
    <aside className="nw-brain-card" aria-label="Animated brain response preview">
      <div className="nw-brain-topline">
        <span>neural response map</span>
        <strong>{mode}</strong>
      </div>
      <div className="nw-brain-orb">
        {cells.map((cell) => (
          <span key={cell.key} style={{ '--heat': `${Math.max(8, cell.score)}%` } as CSSProperties} />
        ))}
      </div>
      <div className="nw-brain-score">
        <span>predicted engagement</span>
        <strong>{Math.round(score)}/100</strong>
      </div>
    </aside>
  )
}

function DemoBrain({
  surface,
  timestep,
  topRegions,
  fallbackCells,
  score,
  mode,
  surfaceError,
}: {
  surface: SurfaceState | null
  timestep: number
  topRegions: RegionActivation[] | null
  fallbackCells: { key: number; score: number }[]
  score: number
  mode: string
  surfaceError: string | null
}) {
  if (!surface) {
    // Surface fetch is still in flight or errored: show the legacy 24-cell
    // heatmap so the page never goes blank. The demo orchestrator surfaces
    // the underlying error in a banner above the fold.
    return <BrainHeatmap cells={fallbackCells} score={score} mode={mode} />
  }
  return (
    <aside className="nw-brain-card" aria-label="Predicted brain surface response">
      <div className="nw-brain-topline">
        <span>cortical surface (fsaverage5)</span>
        <strong>{mode}</strong>
      </div>
      <div className="nw-brain-3d">
        <BrainSurfaceRenderer
          mesh={surface.mesh}
          activations={surface.activations}
          timestep={timestep}
          style={{ background: 'rgba(7, 16, 12, 1)' }}
        />
      </div>
      {topRegions && topRegions.length > 0 ? (
        <div className="nw-region-caption">
          {topRegions.map((r) => {
            const positive = r.z > 0
            return (
              <span key={r.name} className={positive ? 'nw-region-up' : 'nw-region-down'}>
                <span aria-hidden="true">{positive ? '↑' : '↓'}</span>
                <span>{r.name}</span>
                <span className="nw-region-z">
                  ({r.z >= 0 ? '+' : ''}
                  {r.z.toFixed(2)})
                </span>
              </span>
            )
          })}
        </div>
      ) : null}
      <div className="nw-brain-score">
        <span>predicted engagement</span>
        <strong>{Math.round(score)}/100</strong>
      </div>
      {surfaceError ? (
        <div className="nw-region-error" role="status">
          {surfaceError}
        </div>
      ) : null}
    </aside>
  )
}

function ProcessingState({ progress }: { progress: number }) {
  return (
    <section className="nw-processing" aria-live="polite">
      <div>
        <p className="nw-kicker">processing</p>
        <h2>Extracting frames, audio, and predicted response</h2>
      </div>
      <div className="nw-progress-track">
        <span style={{ width: `${Math.max(progress, 8)}%` }} />
      </div>
    </section>
  )
}

function TimelineTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="nw-tooltip">
      <span>{formatTime(Number(label))}</span>
      <strong>{Math.round(Number(payload[0].value))}/100</strong>
    </div>
  )
}
