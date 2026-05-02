import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Brain, Loader2, Upload } from 'lucide-react'
import BrainSurfaceRenderer, { decodeEncodedFloat32, type SurfaceMeshJson } from './BrainSurfaceRenderer'
import './studio.css'
import './App.css'

type BrainTimelineResponse = {
  job_id?: string | null
  video_url: string
  mode: string
  video_duration_sec: number
  tr_sec: number
  timestamps_start: number[]
  timestamps_end: number[]
  point_count: number
  positions_2d: number[][]
  activations: number[][]
}

type EncodedFloatArray = {
  dtype: 'float32'
  shape: number[]
  compression: 'zlib'
  data_b64: string
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
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function colorFor(z: number): string {
  // z in [-3, 3] -> teal/green heat
  const t = (clamp(z, -3, 3) + 3) / 6
  const hue = 160 - t * 55 // 160->105
  const sat = 75
  const light = 30 + t * 30
  return `hsl(${hue} ${sat}% ${light}%)`
}

function drawBrain(
  canvas: HTMLCanvasElement,
  positions: number[][],
  activations: number[],
  selectedIndex: number | null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, Math.floor(rect.width * dpr))
  const h = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(7, 16, 12, 1)'
  ctx.fillRect(0, 0, w, h)

  // soft vignette
  const grd = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.65)
  grd.addColorStop(0, 'rgba(157,230,186,0.10)')
  grd.addColorStop(1, 'rgba(7,16,12,0.95)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, w, h)

  const cx = w * 0.5
  const cy = h * 0.52
  const radius = Math.min(w, h) * 0.36

  // outline
  ctx.strokeStyle = 'rgba(222, 231, 224, 0.12)'
  ctx.lineWidth = 2 * dpr
  ctx.beginPath()
  ctx.ellipse(cx, cy, radius * 1.06, radius * 0.92, 0, 0, Math.PI * 2)
  ctx.stroke()

  // points
  const dot = 1.4 * dpr
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i]
    const x = cx + p[0] * radius
    const y = cy + p[1] * radius * 0.92
    const z = activations[i] ?? 0
    ctx.fillStyle = colorFor(z)
    ctx.beginPath()
    ctx.arc(x, y, dot, 0, Math.PI * 2)
    ctx.fill()
  }

  if (selectedIndex !== null) {
    ctx.fillStyle = 'rgba(157,230,186,0.9)'
    ctx.font = `${14 * dpr}px ui-sans-serif, system-ui, -apple-system`
    ctx.fillText(`timestep ${selectedIndex + 1}`, 16 * dpr, 26 * dpr)
  }
}

export default function BrainTimelineViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [data, setData] = useState<BrainTimelineResponse | null>(null)
  const [surface, setSurface] = useState<{
    timeline: BrainSurfaceTimelineResponse
    mesh: SurfaceMeshJson
    activations: Float32Array
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Auto-load the hardcoded surface on mount. The backend serves this in ~300ms
  // via fast mode (real video-derived activations on fsaverage5), so there's no
  // reason to make it opt-in.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/hardcoded/brain_surface')
        if (!res.ok) throw new Error((await res.text()) || res.statusText)
        const surfaceResp = (await res.json()) as BrainSurfaceTimelineResponse
        const meshRes = await fetch(surfaceResp.mesh.url)
        if (!meshRes.ok) throw new Error((await meshRes.text()) || meshRes.statusText)
        const mesh = (await meshRes.json()) as SurfaceMeshJson
        const flat = await decodeEncodedFloat32(surfaceResp.activations)
        if (cancelled) return
        setSurface({ timeline: surfaceResp, mesh, activations: flat })
        setData(null)
        setActiveIndex(0)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load hardcoded brain surface.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    setFile(selected)
  }

  const analyzeHardcoded = async () => {
    setLoading(true)
    setUploadProgress(0)
    setError(null)
    try {
      const res = await fetch('/api/hardcoded/video')
      if (!res.ok) throw new Error((await res.text()) || res.statusText)
      const blob = await res.blob()
      const hardcoded = new File([blob], 'hardcoded.mp4', { type: blob.type || 'video/mp4' })
      setFile(hardcoded)

      // Reuse the same inference path as uploads (non-hardcoded backend path).
      const surfaceResp = await new Promise<BrainSurfaceTimelineResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/brain/surface_timeline')
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as BrainSurfaceTimelineResponse)
            return
          }
          reject(new Error(xhr.responseText || xhr.statusText))
        }
        xhr.onerror = () => reject(new Error('Connection failed. Is the FastAPI backend running on port 8000?'))
        const formData = new FormData()
        formData.append('file', hardcoded)
        xhr.send(formData)
      })

      const meshRes = await fetch(surfaceResp.mesh.url)
      if (!meshRes.ok) throw new Error((await meshRes.text()) || meshRes.statusText)
      const mesh = (await meshRes.json()) as SurfaceMeshJson
      const flat = await decodeEncodedFloat32(surfaceResp.activations)
      setSurface({ timeline: surfaceResp, mesh, activations: flat })
      setData(null)
      setActiveIndex(0)
      setUploadProgress(100)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze hardcoded clip.')
    } finally {
      setLoading(false)
    }
  }

  const uploadAndAnalyze = async () => {
    if (!file) {
      setError('Choose a video first.')
      return
    }
    setLoading(true)
    setUploadProgress(0)
    setError(null)
    try {
      // Prefer surface timeline; fall back to point-cloud.
      const surfaceResp = await new Promise<BrainSurfaceTimelineResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/brain/surface_timeline')
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as BrainSurfaceTimelineResponse)
            return
          }
          reject(new Error(xhr.responseText || xhr.statusText))
        }
        xhr.onerror = () => reject(new Error('Connection failed. Is the FastAPI backend running on port 8000?'))
        const formData = new FormData()
        formData.append('file', file)
        xhr.send(formData)
      })
      const meshRes = await fetch(surfaceResp.mesh.url)
      if (!meshRes.ok) throw new Error((await meshRes.text()) || meshRes.statusText)
      const mesh = (await meshRes.json()) as SurfaceMeshJson
      const flat = await decodeEncodedFloat32(surfaceResp.activations)
      setSurface({ timeline: surfaceResp, mesh, activations: flat })
      setData(null)
      setActiveIndex(0)
      setUploadProgress(100)
    } catch (e) {
      try {
        const point = await new Promise<BrainTimelineResponse>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', '/api/brain')
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100))
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText) as BrainTimelineResponse)
              return
            }
            reject(new Error(xhr.responseText || xhr.statusText))
          }
          xhr.onerror = () => reject(new Error('Connection failed. Is the FastAPI backend running on port 8000?'))
          const formData = new FormData()
          formData.append('file', file)
          xhr.send(formData)
        })
        setData(point)
        setSurface(null)
        setActiveIndex(0)
        setUploadProgress(100)
      } catch (e2) {
        setError(e2 instanceof Error ? e2.message : e instanceof Error ? e.message : 'Upload failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  const active = useMemo(() => {
    if (surface) {
      const idx = clamp(activeIndex, 0, surface.timeline.timestamps_start.length - 1)
      return {
        kind: 'surface' as const,
        idx,
        start: surface.timeline.timestamps_start[idx] ?? 0,
        end: surface.timeline.timestamps_end[idx] ?? (surface.timeline.timestamps_start[idx] ?? 0) + surface.timeline.tr_sec,
      }
    }
    if (data) {
      const idx = clamp(activeIndex, 0, data.activations.length - 1)
      return {
        kind: 'point' as const,
        idx,
        start: data.timestamps_start[idx] ?? 0,
        end: data.timestamps_end[idx] ?? (data.timestamps_start[idx] ?? 0) + data.tr_sec,
        values: data.activations[idx] ?? [],
      }
    }
    return null
  }, [data, surface, activeIndex])

  useEffect(() => {
    if (!data || !active || active.kind !== 'point') return
    const canvas = canvasRef.current
    if (!canvas) return
    drawBrain(canvas, data.positions_2d, active.values, active.idx)
  }, [data, active])

  // Sync the active brain timestep to <video> playback so the brain advances as you watch.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const starts = surface
      ? surface.timeline.timestamps_start
      : data
      ? data.timestamps_start
      : null
    if (!starts || starts.length === 0) return

    const findIndex = (t: number): number => {
      // Binary search for the largest start <= t.
      let lo = 0
      let hi = starts.length - 1
      let best = 0
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (starts[mid] <= t) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      return best
    }

    let raf = 0
    const tick = () => {
      const idx = findIndex(video.currentTime)
      setActiveIndex((prev) => (prev === idx ? prev : idx))
      raf = window.requestAnimationFrame(tick)
    }
    const onPlay = () => {
      if (raf) window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(tick)
    }
    const onPauseOrSeek = () => {
      if (raf) {
        window.cancelAnimationFrame(raf)
        raf = 0
      }
      const idx = findIndex(video.currentTime)
      setActiveIndex((prev) => (prev === idx ? prev : idx))
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPauseOrSeek)
    video.addEventListener('seeked', onPauseOrSeek)
    video.addEventListener('timeupdate', onPauseOrSeek)
    onPauseOrSeek()
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPauseOrSeek)
      video.removeEventListener('seeked', onPauseOrSeek)
      video.removeEventListener('timeupdate', onPauseOrSeek)
    }
  }, [surface, data])

  return (
    <main className="studio-root">
      <section className="nw-hero">
        <nav className="nw-nav" aria-label="NeuroWatch navigation">
          <Link to="/studio" className="nw-brand">
            <span className="nw-brand-mark" aria-hidden="true">
              <ArrowLeft size={18} />
            </span>
            Back to studio
          </Link>
          <span className="nw-nav-link">hardcoded viewer</span>
        </nav>

        <div className="nw-hero-grid">
          <div>
            <p className="nw-kicker">tribev2 vertex timeline</p>
            <h1>Scroll the timeline to scrub predicted brain activity.</h1>
            <p className="nw-lede">
              Click “Analyze hardcoded” to run TRIBE v2 on the bundled clip, or upload your own video. The surface view renders
              fsaverage5 pial vertices (~20k).
            </p>

            <div className="nw-hero-actions">
              <button type="button" className="nw-primary-button" disabled={loading} onClick={analyzeHardcoded}>
                {loading ? 'Analyzing…' : 'Analyze hardcoded'}
              </button>
              <label className="nw-upload-button">
                <Upload size={18} />
                <span>{file ? file.name : 'Choose video'}</span>
                <input type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={onFile} />
              </label>
              <button type="button" className="nw-primary-button" disabled={loading} onClick={uploadAndAnalyze}>
                {loading ? 'Analyzing…' : 'Analyze upload'}
              </button>
            </div>
            {loading ? (
              <div className="nw-processing" aria-live="polite" style={{ marginTop: 12 }}>
                <div className="nw-progress-track">
                  <span style={{ width: `${Math.max(uploadProgress, 8)}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <aside className="nw-brain-card" aria-label="Brain visualization">
            <div className="nw-brain-topline">
              <span>brain response</span>
              <strong>{surface ? surface.timeline.mode : data ? data.mode : loading ? 'loading' : 'idle'}</strong>
            </div>
            <div style={{ height: 320, borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              {surface ? (
                <BrainSurfaceRenderer
                  mesh={surface.mesh}
                  activations={surface.activations}
                  timestep={activeIndex}
                  style={{ background: 'rgba(7, 16, 12, 1)' }}
                />
              ) : (
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              )}
            </div>
            <div className="nw-brain-score">
              <span>window</span>
              <strong>{active ? `${formatTime(active.start)}-${formatTime(active.end)}` : '--'}</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="nw-dashboard" style={{ marginTop: -16 }}>
        <div className="nw-video-card">
          <div className="nw-card-heading">
            <div>
              <p className="nw-kicker">hardcoded clip</p>
              <h2>Playback</h2>
            </div>
            <span className="nw-mode-pill">
              <Brain size={16} style={{ marginRight: 8 }} />
              {surface ? `${surface.timeline.vertex_count} vertices` : data ? `${data.point_count} points` : '—'}
            </span>
          </div>
          <div className="nw-video-frame">
            <video
              ref={videoRef}
              src={surface ? surface.timeline.video_url : data ? data.video_url : '/api/hardcoded/video'}
              controls
              playsInline
            />
          </div>
        </div>

        <aside className="nw-report-card">
          <div className="nw-card-heading">
            <div>
              <p className="nw-kicker">timeline</p>
              <h2>Scroll + click</h2>
            </div>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          </div>

          {error ? <div className="nw-error">{error}</div> : null}

          {data ? (
            <div
              style={{
                display: 'grid',
                gap: 10,
                maxHeight: 520,
                overflow: 'auto',
                paddingRight: 4,
              }}
            >
              {data.timestamps_start.map((start, i) => (
                <button
                  key={`${start}-${i}`}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 14,
                    padding: '10px 12px',
                    border: i === activeIndex ? '1px solid rgba(157,230,186,0.55)' : '1px solid rgba(255,255,255,0.08)',
                    background: i === activeIndex ? 'rgba(157,230,186,0.10)' : 'rgba(255,255,255,0.03)',
                    color: 'rgba(255,255,255,0.86)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontWeight: 650 }}>{formatTime(start)}</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {formatTime(data.timestamps_end[i] ?? start + data.tr_sec)}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.round(((i + 1) / data.timestamps_start.length) * 100)}%`,
                        borderRadius: 999,
                        background: 'rgba(157,230,186,0.55)',
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : surface ? (
            <div
              style={{
                display: 'grid',
                gap: 10,
                maxHeight: 520,
                overflow: 'auto',
                paddingRight: 4,
              }}
            >
              {surface.timeline.timestamps_start.map((start, i) => (
                <button
                  key={`${start}-${i}`}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 14,
                    padding: '10px 12px',
                    border: i === activeIndex ? '1px solid rgba(157,230,186,0.55)' : '1px solid rgba(255,255,255,0.08)',
                    background: i === activeIndex ? 'rgba(157,230,186,0.10)' : 'rgba(255,255,255,0.03)',
                    color: 'rgba(255,255,255,0.86)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontWeight: 650 }}>{formatTime(start)}</span>
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {formatTime(surface.timeline.timestamps_end[i] ?? start + surface.timeline.tr_sec)}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.round(((i + 1) / surface.timeline.timestamps_start.length) * 100)}%`,
                        borderRadius: 999,
                        background: 'rgba(157,230,186,0.55)',
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="nw-empty-report">{loading ? 'Loading timeline…' : 'No data yet.'}</div>
          )}
        </aside>
      </section>
    </main>
  )
}

