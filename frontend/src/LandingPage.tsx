import { Link } from 'react-router-dom'
import { ArrowRight, Brain, Clock, Film, LineChart, Scissors, Sparkles } from 'lucide-react'
import ShinyText from './landing/components/ShinyText'

const FEATURES = [
  {
    icon: LineChart,
    title: 'Engagement timeline',
    text: 'See predicted brain-response peaks and stale valleys before you publish.',
  },
  {
    icon: Clock,
    title: 'Hook score',
    text: 'Grade the first 3 seconds and learn whether your opening earns attention fast enough.',
  },
  {
    icon: Scissors,
    title: '15-second cut',
    text: 'Get a timestamp recipe for a tighter Shorts, Reels, or TikTok version.',
  },
]

const STEPS = ['Upload a 10-90 second clip', 'Run TRIBE v2 or demo-safe proxy analysis', 'Click peaks and stale zones', 'Export timestamped edit notes']

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07100c] text-white">
      <section className="relative isolate min-h-screen px-6 py-6 md:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_10%,rgba(157,230,186,0.18),transparent_28rem),radial-gradient(circle_at_82%_18%,rgba(110,223,199,0.12),transparent_24rem)]" />
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#9de6ba]/30 bg-[#9de6ba]/10 text-[#9de6ba]">
              <Brain className="h-4 w-4" />
            </span>
            NeuroWatch
          </Link>
          <Link
            to="/studio"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-[#9de6ba]/50 hover:text-white"
          >
            Open studio
          </Link>
          <Link
            to="/viewer"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-[#9de6ba]/50 hover:text-white"
          >
            Open viewer
          </Link>
        </div>

        <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-7xl items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.24em] text-[#9de6ba]">
              pre-upload editing signal
            </p>
            <h1 className="max-w-4xl text-[clamp(4rem,10vw,10rem)] font-medium leading-[0.82] tracking-[-0.075em] text-white">
              See where your content wakes the{' '}
              <span className="block">
                <ShinyText text="brain up." speed={3.5} />
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-balance text-lg leading-8 text-white/68 md:text-xl">
              NeuroWatch helps creators upload a video and find the moments likely to feel engaging,
              stale, visually intense, language-heavy, or worth moving earlier.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/studio"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#9de6ba] px-7 py-4 text-sm font-bold text-[#07100c] transition hover:-translate-y-0.5 hover:bg-[#b8f0ce]"
              >
                Analyze a video
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-7 py-4 text-sm font-semibold text-white/78 transition hover:-translate-y-0.5 hover:border-white/35 hover:text-white"
              >
                How it works
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="rounded-[1.5rem] border border-white/10 bg-[#0d1913] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white/72">creator report</span>
                  <span className="rounded-full bg-[#9de6ba]/10 px-3 py-1 text-xs font-bold text-[#9de6ba]">demo ready</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric value="78" label="overall" />
                  <Metric value="61" label="hook" />
                  <Metric value="24%" label="risk" />
                  <Metric value="3.2" label="peaks / 10s" />
                </div>
                <div className="mt-5 h-36 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(157,230,186,0.16),rgba(157,230,186,0.02))] p-4">
                  <div className="flex h-full items-end gap-2">
                    {[34, 48, 42, 76, 84, 55, 28, 24, 31, 68, 91, 73, 52].map((height, index) => (
                      <span
                        key={`${height}-${index}`}
                        className="flex-1 rounded-t-full bg-[#9de6ba]"
                        style={{ height: `${height}%`, opacity: 0.35 + height / 160 }}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-[#f46d75]/20 bg-[#f46d75]/10 p-4 text-sm text-white/78">
                  Stale risk at <strong className="text-white">0:06-0:11</strong>. Cut this or add a caption, zoom, or sound shift.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-6 py-24 md:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#9de6ba]">mvp workflow</p>
            <h2 className="max-w-lg text-4xl font-medium leading-none tracking-[-0.055em] text-white md:text-6xl">
              A brain-response debugger for creators.
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
                <Icon className="mb-8 h-6 w-6 text-[#9de6ba]" />
                <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 leading-7 text-white/60">{text}</p>
              </article>
            ))}
            <article className="rounded-3xl border border-[#9de6ba]/20 bg-[#9de6ba]/10 p-6">
              <Sparkles className="mb-8 h-6 w-6 text-[#9de6ba]" />
              <h3 className="text-xl font-semibold tracking-tight">Specific advice</h3>
              <p className="mt-3 leading-7 text-white/70">
                No generic “make it punchier.” NeuroWatch references exact timestamps and editing actions.
              </p>
            </article>
          </div>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-4">
          {STEPS.map((step, index) => (
            <div key={step} className="bg-[#07100c] p-6">
              <span className="text-sm font-bold text-[#9de6ba]">0{index + 1}</span>
              <p className="mt-5 text-lg font-medium tracking-tight text-white">{step}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 md:p-12">
          <Film className="mb-8 h-8 w-8 text-[#9de6ba]" />
          <h2 className="max-w-3xl text-4xl font-medium leading-none tracking-[-0.055em] md:text-6xl">
            Not mind reading. Not virality prediction. A useful editing signal before posting.
          </h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
            NeuroWatch predicts average brain-response patterns to media and translates that into
            creator-friendly feedback: strong moments, stale stretches, hook risk, and suggested cuts.
          </p>
          <Link
            to="/studio"
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-sm font-bold text-black transition hover:bg-white/90"
          >
            Open NeuroWatch Studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
      <strong className="block text-3xl font-medium tracking-[-0.04em] text-white">{value}</strong>
      <span className="text-sm text-white/48">{label}</span>
    </div>
  )
}
