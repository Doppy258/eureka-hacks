import FadeInOnView from "./ui/FadeInOnView";
import SectionHeader from "./ui/SectionHeader";

interface Instructor {
  name: string;
  role: string;
  company: string;
  bio: string;
  /** A deterministic pravatar seed so the portrait is stable per instructor. */
  avatarSeed: string;
}

const INSTRUCTORS: Instructor[] = [
  {
    name: "Maya Reyes",
    role: "Director of Product Design",
    company: "Linear",
    bio: "Built the design org from cofounder to forty. Teaches systems thinking and design leadership.",
    avatarSeed: "maya-reyes",
  },
  {
    name: "Aiden Park",
    role: "Principal Designer",
    company: "Stripe",
    bio: "Twelve years across fintech and developer tools. Leads the prototyping and craft chapters.",
    avatarSeed: "aiden-park",
  },
  {
    name: "Jordan Voss",
    role: "VP Design",
    company: "Notion",
    bio: "Former IDEO. Wrote the playbook on how to ship complex products without losing the soul.",
    avatarSeed: "jordan-voss",
  },
  {
    name: "Priya Shah",
    role: "Head of Design Systems",
    company: "Figma",
    bio: "Maintains the systems other systems are built on. Teaches tokens, governance, and scale.",
    avatarSeed: "priya-shah",
  },
  {
    name: "Lukas Berg",
    role: "Lead Product Designer",
    company: "Anthropic",
    bio: "Designs interfaces for tools nobody knows how to use yet. Leads the discovery chapter.",
    avatarSeed: "lukas-berg",
  },
  {
    name: "Camille Okafor",
    role: "Design Lead",
    company: "Airbnb",
    bio: "Twenty years, three companies, more redesigns than she'll admit. Leads the leadership chapter.",
    avatarSeed: "camille-okafor",
  },
];

export default function Instructors() {
  return (
    <section className="relative bg-black py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <SectionHeader
          eyebrow="Faculty"
          title="Taught by people still shipping it."
          description="Every chapter is led by an active practitioner — not an ex-anything. The people teaching you are the same people whose work you've been studying on Mobbin and Twitter."
        />

        <ul className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3">
          {INSTRUCTORS.map((instructor, i) => (
            <FadeInOnView
              key={instructor.name}
              as="li"
              delay={(i % 3) * 0.08}
              className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-white/5">
                <img
                  src={`https://i.pravatar.cc/600?u=${instructor.avatarSeed}`}
                  alt={`Portrait of ${instructor.name}`}
                  loading="lazy"
                  className="h-full w-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
                    {instructor.company}
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-6 md:p-7">
                <h3 className="text-xl font-medium tracking-tight text-white md:text-2xl">
                  {instructor.name}
                </h3>
                <p className="mt-1 text-sm text-white/55">{instructor.role}</p>
                <p className="mt-4 text-sm leading-relaxed text-white/70">
                  {instructor.bio}
                </p>
              </div>
            </FadeInOnView>
          ))}
        </ul>
      </div>
    </section>
  );
}
