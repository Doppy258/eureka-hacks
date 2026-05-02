import FadeInOnView from "./ui/FadeInOnView";
import SectionHeader from "./ui/SectionHeader";
import ShinyText from "./ShinyText";

interface Stat {
  value: string;
  shinyValue?: string;
  label: string;
  detail: string;
}

const STATS: Stat[] = [
  {
    value: "8,000+",
    label: "Designers launched",
    detail: "Alumni now shipping at the studios you'd most want to work at.",
  },
  {
    value: "$185K",
    shinyValue: "$185K",
    label: "Median outcome salary",
    detail: "Within twelve months of graduating, across IC and lead roles.",
  },
  {
    value: "94%",
    label: "Hiring rate in six months",
    detail: "Backed by an in-house placement team and 50+ partner studios.",
  },
  {
    value: "12 weeks",
    label: "From first crit to first offer",
    detail: "Average time from intro week to a signed offer letter, cohort-wide.",
  },
];

export default function Stats() {
  return (
    <section className="relative bg-black py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <SectionHeader
          eyebrow="By the numbers"
          title={
            <>
              Outcomes that <em className="not-italic text-white/60">move</em>{" "}
              careers, not slide decks.
            </>
          }
          description="Eureka Hacks is graded on hiring outcomes. Our cohorts publish their numbers because they hold up — and because designers are tired of programs that won't."
        />

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4 lg:mt-20">
          {STATS.map((stat, i) => (
            <FadeInOnView
              key={stat.label}
              delay={i * 0.08}
              className="flex flex-col bg-black p-8 md:p-10"
            >
              <div className="text-4xl font-medium tracking-tighter text-white md:text-5xl lg:text-6xl">
                {stat.shinyValue ? (
                  <ShinyText text={stat.shinyValue} speed={4} />
                ) : (
                  stat.value
                )}
              </div>
              <div className="mt-5 text-sm font-medium uppercase tracking-tight text-white/80 md:text-base">
                {stat.label}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/55">
                {stat.detail}
              </p>
            </FadeInOnView>
          ))}
        </div>
      </div>
    </section>
  );
}
