import { useCallback, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import './studio.css'
import './App.css'

type AnalyzeResponse = {
  job_id: string
  video_url: string
  mode: string
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
  } | null
  fallback_error?: string | null
}

function heatColor(value: number, vmin: number, vmax: number): string {
  if (vmax <= vmin) return 'hsl(230,55%,45%)'
  const t = (value - vmin) / (vmax - vmin)
  const h = 255 - t * 95
  const l = 28 + t * 42
  return `hsl(${h}, 72%, ${l}%)`
}

export default function StudioApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [includeFeedback, setIncludeFeedback] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [playhead, setPlayhead] = useState(0)

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setError(null)
  }

  const analyze = async () => {
    if (!file) {
      setError('Choose a video file first.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const q = includeFeedback ? 'true' : 'false'
      const res = await fetch(`/api/analyze?include_feedback=${q}`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      const data = (await res.json()) as AnalyzeResponse
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const seekToMid = useCallback(
    (i: number) => {
      if (!result) return
      const a = result.timestamps_start[i]
      const b = result.timestamps_end[i]
      const t = (a + b) / 2
      const v = videoRef.current
      if (v) {
        v.currentTime = Math.min(Math.max(t, 0), result.video_duration_sec)
        v.play().catch(() => {})
      }
    },
    [result],
  )

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (v) setPlayhead(v.currentTime)
  }

  const heatmapRows = useMemo(() => {
    if (!result) {
      return {
        heatmapMin: 0,
        heatmapMax: 1,
        gridTemplateColumns: 'repeat(1, minmax(6px, 1fr))',
        rows: [] as {
          label: string
          cells: { key: string; style: React.CSSProperties; ti: number }[]
        }[],
      }
    }
    const T = result.timestamps_start.length
    const R = result.region_labels.length
    const flat = result.region_timeseries.flat()
    const heatmapMin = flat.length ? Math.min(...flat) : 0
    const heatmapMax = flat.length ? Math.max(...flat) : 1
    const gridTemplateColumns = `repeat(${Math.max(T, 1)}, minmax(5px, 1fr))`
    const rows: {
      label: string
      cells: { key: string; style: React.CSSProperties; ti: number }[]
    }[] = []
    for (let ri = 0; ri < R; ri++) {
      const cells: { key: string; style: React.CSSProperties; ti: number }[] = []
      for (let ti = 0; ti < T; ti++) {
        const v = result.region_timeseries[ti]?.[ri] ?? 0
        cells.push({
          key: `${ri}-${ti}`,
          style: { backgroundColor: heatColor(v, heatmapMin, heatmapMax) },
          ti,
        })
      }
      rows.push({
        label: result.region_labels[ri]?.replace(' (surface vertices)', '') ?? `R${ri}`,
        cells,
      })
    }
    return { heatmapMin, heatmapMax, gridTemplateColumns, rows }
  }, [result])

  const chartData = useMemo(() => {
    if (!result) return []
    return result.timestamps_start.map((t0, i) => ({
      t: (t0 + result.timestamps_end[i]) / 2,
      engagement: result.engagement[i] ?? 0,
    }))
  }, [result])

  return (
    <div className="studio-root">
      <header className="app-header">
        <p className="studio-back">
          <Link to="/">← Eureka Hacks</Link>
        </p>
        <h1>TRIBE Studio</h1>
        <p className="lede">
          Upload a short video to run Meta’s{' '}
          <a href="https://huggingface.co/facebook/tribev2" target="_blank" rel="noreferrer">
            TRIBE v2
          </a>{' '}
          encoding model (when installed), then explore predicted cortical drive over time and
          optional edit-oriented notes.
        </p>
      </header>

      <section className="panel">
        <div className="upload-row">
          <input className="file-input" type="file" accept="video/*" onChange={onFile} />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={includeFeedback}
              onChange={(e) => setIncludeFeedback(e.target.checked)}
            />
            Include feedback
          </label>
          <button type="button" className="btn" disabled={loading} onClick={analyze}>
            {loading ? 'Running…' : 'Analyze video'}
          </button>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {result ? (
        <>
          <section className="panel">
            <div className="meta-row">
              <span className="badge">{result.mode === 'tribe' ? 'TRIBE v2' : 'Demo timeline'}</span>
              <span>Duration ~{result.video_duration_sec.toFixed(1)}s</span>
              <span>Bin ~{result.tr_sec.toFixed(2)}s</span>
            </div>
            {result.fallback_error ? (
              <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                Model unavailable; showing demo data.{' '}
                <code style={{ fontSize: '0.8rem' }}>{result.fallback_error}</code>
              </p>
            ) : null}
            <div className="video-wrap">
              <video
                ref={videoRef}
                src={result.video_url}
                controls
                onTimeUpdate={onTimeUpdate}
              />
            </div>
            <p className="section-title">Predicted response by cortical sector (coarse vertex groups)</p>
            <div className="heatmap-wrap">
              {heatmapRows.rows.map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '8px',
                    marginBottom: '4px',
                  }}
                >
                  <div
                    className="row-label"
                    style={{
                      width: '128px',
                      flexShrink: 0,
                      fontSize: '0.68rem',
                      lineHeight: 1.25,
                      textAlign: 'right',
                      paddingTop: '2px',
                    }}
                  >
                    {row.label}
                  </div>
                  <div
                    className="heatmap"
                    style={{
                      flex: 1,
                      display: 'grid',
                      gridTemplateColumns: heatmapRows.gridTemplateColumns,
                      gap: '2px',
                      minHeight: '18px',
                    }}
                  >
                    {row.cells.map((c) => (
                      <button
                        type="button"
                        key={c.key}
                        className="heatmap-cell"
                        style={c.style}
                        title={`t≈${((result.timestamps_start[c.ti] + result.timestamps_end[c.ti]) / 2).toFixed(2)}s`}
                        onClick={() => seekToMid(c.ti)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="section-title">Aggregate predicted drive (mean |vertices| per bin)</p>
            <div className="chart-block">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="t" tickFormatter={(v) => `${v}s`} fontSize={11} />
                  <YAxis fontSize={11} width={36} />
                  <Tooltip
                    formatter={(val) => [
                      typeof val === 'number' ? val.toFixed(4) : String(val ?? ''),
                      'drive',
                    ]}
                    labelFormatter={(l) => `${Number(l).toFixed(2)}s`}
                  />
                  <Line type="monotone" dataKey="engagement" stroke="var(--accent)" strokeWidth={2} dot={false} />
                  <ReferenceLine x={playhead} stroke="#f97316" strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p style={{ fontSize: '0.78rem', marginTop: '0.35rem', opacity: 0.85 }}>
              Orange dashed line tracks playback time. Click heatmap cells to jump the playhead.
            </p>
          </section>

          {result.feedback ? (
            <section className="panel">
              <h2>Feedback on predicted brain response</h2>
              <div className="feedback-grid">
                <div className="feedback-block fb-positive">
                  <h3>Positives</h3>
                  <ul className="feedback-list">
                    {result.feedback.positives.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div className="feedback-block fb-negative">
                  <h3>Negatives / risks</h3>
                  <ul className="feedback-list">
                    {result.feedback.negatives.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div className="feedback-block fb-tips" style={{ gridColumn: '1 / -1' }}>
                  <h3>Ways to increase predicted stimulation</h3>
                  <ul className="feedback-list">
                    {result.feedback.stimulation_tips.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="disclaimer">{result.feedback.disclaimer}</p>
            </section>
          ) : null}
        </>
      ) : null}

      <p className="ref-link">
        Model card &amp; install:{' '}
        <a href="https://huggingface.co/facebook/tribev2" target="_blank" rel="noreferrer">
          huggingface.co/facebook/tribev2
        </a>
      </p>
    </div>
  )
}
