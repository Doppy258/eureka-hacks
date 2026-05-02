import { Quote } from "lucide-react";
import FadeInOnView from "./ui/FadeInOnView";
import SectionHeader from "./ui/SectionHeader";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  avatarSeed: string;
}

const FEATURED: Testimonial = {
  quote:
    "Eureka Hacks is the only program I've seen that takes you from craft to leadership without skipping the unglamorous middle. I went from senior IC to head of design at a Series B in eight months — and the offer happened in week eighteen of the cohort.",
  name: "Eli Tanaka",
  role: "Head of Design, Recurse Studio",
  avatarSeed: "eli-tanaka",
};

const SUPPORTING: Testimonial[] = [
  {
    quote:
      "I came in confident I could ship pixels. I left understanding what to ship and why. My salary doubled, my stress halved.",
    name: "Camila Voss",
    role: "Senior Product Designer, Replit",
    avatarSeed: "camila-voss",
  },
  {
    quote:
      "The mentor pairing alone was worth tuition. Maya pushed me to apply for roles I'd never considered. Six months later, I'm at Linear.",
    name: "Avery Kim",
    role: "Product Designer, Linear",
    avatarSeed: "avery-kim",
  },
];

export default function Testimonials() {
  return (
    <section className="relative bg-black py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <SectionHeader
          eyebrow="Voices"
          title={
            <>
              Six months in,
              <br className="hidden md:inline" /> your career looks different.
            </>
          }
        />

        <div className="mt-16 grid grid-cols-1 gap-6 lg:mt-20 lg:grid-cols-3">
          <FadeInOnView className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-10 md:p-12 lg:col-span-2">
            <Quote
              className="h-8 w-8 text-[#64CEFB]/70"
              strokeWidth={1.5}
              aria-hidden
            />

            <p className="mt-8 text-balance text-2xl font-medium tracking-tight text-white md:text-3xl lg:text-4xl">
              {FEATURED.quote}
            </p>

            <div className="mt-10 flex items-center gap-4">
              <img
                src={`https://i.pravatar.cc/200?u=${FEATURED.avatarSeed}`}
                alt={FEATURED.name}
                loading="lazy"
                className="h-12 w-12 rounded-full object-cover ring-1 ring-white/15"
              />
              <div>
                <div className="text-sm font-medium text-white">
                  {FEATURED.name}
                </div>
                <div className="text-sm text-white/60">{FEATURED.role}</div>
              </div>
            </div>
          </FadeInOnView>

          <div className="flex flex-col gap-6">
            {SUPPORTING.map((testimonial, i) => (
              <FadeInOnView
                key={testimonial.name}
                delay={0.1 + i * 0.1}
                className="flex flex-1 flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.02] p-8"
              >
                <p className="text-base leading-relaxed text-white/85 md:text-lg">
                  &ldquo;{testimonial.quote}&rdquo;
                </p>

                <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-6">
                  <img
                    src={`https://i.pravatar.cc/200?u=${testimonial.avatarSeed}`}
                    alt={testimonial.name}
                    loading="lazy"
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-white/15"
                  />
                  <div>
                    <div className="text-sm font-medium text-white">
                      {testimonial.name}
                    </div>
                    <div className="text-xs text-white/55">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </FadeInOnView>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
