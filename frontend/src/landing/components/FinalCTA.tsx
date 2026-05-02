import { ArrowRight } from "lucide-react";
import FadeInOnView from "./ui/FadeInOnView";
import ShinyText from "./ShinyText";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_105406_16f4600d-7a92-4292-b96e-b19156c7830a.mp4";

export default function FinalCTA() {
  return (
    <section className="relative isolate overflow-hidden bg-black py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/10">
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-60"
            src={VIDEO_SRC}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden
          />

          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0.95) 100%)",
            }}
          />

          <FadeInOnView className="relative flex flex-col items-center px-6 py-24 text-center md:px-12 md:py-32 lg:py-40">
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-black/40 px-3 py-1 text-xs uppercase tracking-tight text-white/80 backdrop-blur-sm">
              <span
                aria-hidden
                className="block h-1.5 w-1.5 rounded-full bg-[#64CEFB]"
              />
              Applications open
            </span>

            <h2
              className="mt-6 text-balance text-5xl font-medium tracking-tighter text-white sm:text-6xl md:text-7xl lg:text-8xl"
              style={{ lineHeight: 0.9 }}
            >
              <span className="block">Ready when</span>
              <span className="block">
                <ShinyText text="you are." speed={3.5} />
              </span>
            </h2>

            <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-white/75 md:text-lg">
              Cohorts close fast. Apply in fifteen minutes — three case studies, one
              short brief, no fluff. We read every application.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
              <a
                href="#apply"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors duration-200 hover:bg-white/90 md:px-8 md:py-4 md:text-base"
              >
                Apply for Next Enrollment
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 md:h-5 md:w-5"
                  strokeWidth={2}
                />
              </a>
              <a
                href="#schedule"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/5 md:px-8 md:py-4 md:text-base"
              >
                Talk to admissions
              </a>
            </div>

            <p className="mt-8 text-xs uppercase tracking-tight text-white/50 md:text-sm">
              Next cohort begins September 16 · Seats remaining: 14 of 24
            </p>
          </FadeInOnView>
        </div>
      </div>
    </section>
  );
}
