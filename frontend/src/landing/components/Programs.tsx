import { Check, ArrowRight } from "lucide-react";
import FadeInOnView from "./ui/FadeInOnView";
import SectionHeader from "./ui/SectionHeader";

interface Program {
  name: string;
  duration: string;
  audience: string;
  blurb: string;
  price: string;
  features: string[];
  highlight?: boolean;
  cta: string;
}

const PROGRAMS: Program[] = [
  {
    name: "Foundations",
    duration: "12 weeks",
    audience: "0–2 years of design experience",
    blurb:
      "Build the craft layer most early designers never get taught. Daily exercises, weekly critique, capstone portfolio piece.",
    price: "$4,800",
    features: [
      "Daily craft exercises",
      "Weekly group critique",
      "1:1 mentor sessions",
      "Capstone portfolio piece",
      "Lifetime access to materials",
    ],
    cta: "Apply for Foundations",
  },
  {
    name: "Accelerator",
    duration: "24 weeks",
    audience: "Mid-level ICs targeting senior or lead",
    blurb:
      "The flagship cohort. Real client briefs, named mentor pairing, and an in-house placement team that does the unglamorous work of getting you hired.",
    price: "$9,800",
    features: [
      "Everything in Foundations",
      "Named senior mentor pairing",
      "Live client briefs",
      "Hiring placement team",
      "Cohort of 24 designers",
      "Two-day in-person summit",
    ],
    highlight: true,
    cta: "Apply for Accelerator",
  },
  {
    name: "Mastery",
    duration: "36 weeks",
    audience: "Senior designers transitioning to staff/principal",
    blurb:
      "For designers who already ship and now have to lead. Strategic projects, executive coaching, and the soft skills nobody teaches.",
    price: "$14,800",
    features: [
      "Everything in Accelerator",
      "Executive coaching",
      "Strategic capstone project",
      "Cohort of 12 designers",
      "Quarterly leadership retreats",
      "Exclusive faculty network",
    ],
    cta: "Apply for Mastery",
  },
];

export default function Programs() {
  return (
    <section className="relative bg-black py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <SectionHeader
          eyebrow="Programs"
          title="Pick the trajectory that fits where you are."
          description="Three cohorts, one philosophy. Start where your craft actually is, not where the marketing copy says you should be."
        />

        <div className="mt-16 grid grid-cols-1 gap-6 lg:mt-20 lg:grid-cols-3 lg:items-stretch">
          {PROGRAMS.map((program, i) => (
            <FadeInOnView
              key={program.name}
              delay={i * 0.1}
              className={[
                "relative flex flex-col rounded-3xl border p-8 md:p-10",
                program.highlight
                  ? "border-[#64CEFB]/40 bg-gradient-to-b from-[#64CEFB]/[0.06] to-transparent lg:-mt-4 lg:mb-0"
                  : "border-white/10 bg-white/[0.02]",
              ].join(" ")}
            >
              {program.highlight ? (
                <span className="absolute -top-3 left-8 inline-flex items-center gap-1.5 rounded-full border border-[#64CEFB]/40 bg-black px-3 py-1 text-xs font-medium uppercase tracking-tight text-[#64CEFB]">
                  <span className="block h-1.5 w-1.5 rounded-full bg-[#64CEFB]" />
                  Most chosen
                </span>
              ) : null}

              <div className="flex items-baseline justify-between">
                <h3 className="text-2xl font-medium tracking-tight text-white md:text-3xl">
                  {program.name}
                </h3>
                <span className="text-sm font-medium uppercase tracking-tight text-white/60">
                  {program.duration}
                </span>
              </div>

              <p className="mt-2 text-sm text-white/50">{program.audience}</p>

              <p className="mt-6 text-sm leading-relaxed text-white/70 md:text-base">
                {program.blurb}
              </p>

              <div className="mt-8 flex items-baseline gap-2">
                <span className="text-4xl font-medium tracking-tighter text-white md:text-5xl">
                  {program.price}
                </span>
                <span className="text-sm text-white/50">total tuition</span>
              </div>

              <ul className="mt-8 space-y-3 border-t border-white/10 pt-8">
                {program.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-sm text-white/75"
                  >
                    <Check
                      className={[
                        "mt-0.5 h-4 w-4 shrink-0",
                        program.highlight ? "text-[#64CEFB]" : "text-white/40",
                      ].join(" ")}
                      strokeWidth={2.25}
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#apply"
                className={[
                  "group mt-10 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition-colors duration-200",
                  program.highlight
                    ? "bg-white text-black hover:bg-white/90"
                    : "border border-white/15 bg-transparent text-white hover:bg-white/5",
                ].join(" ")}
              >
                {program.cta}
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  strokeWidth={2}
                />
              </a>
            </FadeInOnView>
          ))}
        </div>
      </div>
    </section>
  );
}
