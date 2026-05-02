const ALUMNI_COMPANIES = [
  "Linear",
  "Stripe",
  "Notion",
  "Figma",
  "Airbnb",
  "Anthropic",
  "Vercel",
  "Arc",
  "Cash App",
  "Loom",
  "Webflow",
  "Spotify",
];

export default function TrustStrip() {
  return (
    <section className="relative border-y border-white/10 bg-black py-10 md:py-14">
      <div className="mx-auto mb-6 max-w-7xl px-6 md:px-8">
        <p className="text-xs uppercase tracking-tight text-white/50 md:text-sm">
          Where our alumni now shape product
        </p>
      </div>

      <div
        className="relative overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        }}
      >
        <div className="flex w-max animate-marquee gap-12 md:gap-20">
          {[...ALUMNI_COMPANIES, ...ALUMNI_COMPANIES].map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="shrink-0 text-2xl font-medium tracking-tight text-white/40 md:text-3xl lg:text-4xl"
              aria-hidden={i >= ALUMNI_COMPANIES.length}
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
