import FadeInOnView from "./ui/FadeInOnView";
import SectionHeader from "./ui/SectionHeader";

interface Module {
  number: string;
  title: string;
  description: string;
  topics: string[];
}

const MODULES: Module[] = [
  {
    number: "01",
    title: "Foundations of Craft",
    description:
      "The visual fluency every senior designer takes for granted. Typography, color theory, composition, and an unforgiving eye for detail.",
    topics: ["Typography systems", "Color & tone", "Grids & rhythm", "Critique"],
  },
  {
    number: "02",
    title: "Systems Thinking",
    description:
      "Build, document, and scale design systems that actually survive product growth and a rotating cast of contributors.",
    topics: ["Tokens & primitives", "Component APIs", "Versioning", "Governance"],
  },
  {
    number: "03",
    title: "Product Discovery",
    description:
      "The discipline of finding the right thing to build before you fall in love with how it looks. Research, framing, and stop-doing lists.",
    topics: ["Generative research", "Problem framing", "Evidence", "Prioritization"],
  },
  {
    number: "04",
    title: "Prototyping at Scale",
    description:
      "From paper sketch to ship-ready prototype. Tooling, motion, hand-off, and the messy middle where most designers stall.",
    topics: ["Figma to code", "Interaction & motion", "Hand-off", "Polish"],
  },
  {
    number: "05",
    title: "Strategy & Story",
    description:
      "Articulate vision. Sell ideas. Write the kind of memo that moves an executive team and aligns six teams behind one direction.",
    topics: ["Narrative design", "Memo writing", "Roadmap framing", "Reviews"],
  },
  {
    number: "06",
    title: "Cross-functional Leadership",
    description:
      "Work alongside PM, eng, and exec teams. Run reviews that produce decisions. Influence without authority. Lead a team without losing your craft.",
    topics: ["Working with PM", "Eng partnership", "Hiring", "Coaching"],
  },
];

export default function Curriculum() {
  return (
    <section className="relative bg-black py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <SectionHeader
          eyebrow="Curriculum"
          title={
            <>
              Six chapters from craft
              <br className="hidden md:inline" /> to leadership.
            </>
          }
          description="Each chapter ships with weekly briefs, live critique, and a portfolio piece you'll actually want to publish. No filler. No watch-along videos. Real work, reviewed by people doing it."
        />

        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3">
          {MODULES.map((module, i) => (
            <FadeInOnView
              key={module.number}
              delay={(i % 3) * 0.08}
              className="group relative flex flex-col bg-black p-8 transition-colors duration-300 hover:bg-white/[0.02] md:p-10"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium tracking-tight text-[#64CEFB]">
                  {module.number}
                </span>
                <span className="h-px w-12 bg-white/10" />
              </div>

              <h3 className="mt-6 text-2xl font-medium tracking-tight text-white md:text-3xl">
                {module.title}
              </h3>

              <p className="mt-4 text-sm leading-relaxed text-white/60 md:text-base">
                {module.description}
              </p>

              <ul className="mt-8 flex flex-wrap gap-2">
                {module.topics.map((topic) => (
                  <li
                    key={topic}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </FadeInOnView>
          ))}
        </div>
      </div>
    </section>
  );
}
