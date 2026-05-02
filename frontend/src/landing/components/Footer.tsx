import { Twitter, Instagram, Linkedin, Github } from "lucide-react";

const COLUMNS = [
  {
    title: "Programs",
    links: [
      { label: "Foundations", href: "#foundations" },
      { label: "Accelerator", href: "#accelerator" },
      { label: "Mastery", href: "#mastery" },
      { label: "Scholarships", href: "#scholarships" },
    ],
  },
  {
    title: "Studio",
    links: [
      { label: "TRIBE Studio", href: "/studio" },
      { label: "About", href: "#about" },
      { label: "Faculty", href: "#faculty" },
      { label: "Hiring partners", href: "#partners" },
      { label: "Press", href: "#press" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "#blog" },
      { label: "Field notes", href: "#notes" },
      { label: "Reading list", href: "#reading" },
      { label: "Office hours", href: "#office-hours" },
    ],
  },
  {
    title: "Contact",
    links: [
      { label: "Admissions", href: "mailto:hello@eurekahacks.local" },
      { label: "Careers", href: "#careers" },
      { label: "Press inquiries", href: "#press-contact" },
      { label: "Partner with us", href: "#partner" },
    ],
  },
];

const SOCIALS = [
  { label: "Twitter", icon: Twitter, href: "https://twitter.com" },
  { label: "Instagram", icon: Instagram, href: "https://instagram.com" },
  { label: "LinkedIn", icon: Linkedin, href: "https://linkedin.com" },
  { label: "GitHub", icon: Github, href: "https://github.com" },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-black pt-20 md:pt-24 lg:pt-28">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <a href="#" className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white"
              >
                <span className="block h-2.5 w-2.5 rounded-full bg-white" />
              </span>
              <span className="text-base font-medium tracking-tight text-white">
                Eureka Hacks
              </span>
            </a>

            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60 md:text-base">
              A high-bar program for product designers who want craft, clarity,
              and a job that asks more of them.
            </p>

            <div className="mt-8 flex items-center gap-3">
              {SOCIALS.map(({ label, icon: Icon, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors duration-200 hover:border-white/30 hover:text-white"
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-7">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-xs font-medium uppercase tracking-tight text-white/50">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-white/80 transition-colors duration-200 hover:text-white"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 flex flex-col items-start justify-between gap-6 border-t border-white/10 py-8 sm:flex-row sm:items-center md:mt-24">
          <p className="text-xs text-white/50 md:text-sm">
            © {new Date().getFullYear()} Eureka Hacks. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/50 md:text-sm">
            <a href="#privacy" className="hover:text-white/80">
              Privacy
            </a>
            <a href="#terms" className="hover:text-white/80">
              Terms
            </a>
            <a href="#code" className="hover:text-white/80">
              Code of Conduct
            </a>
          </div>
        </div>
      </div>

      {/* Massive faint wordmark — premium sites do this for closure. */}
      <div
        aria-hidden
        className="pointer-events-none mt-12 select-none overflow-hidden text-center"
      >
        <span className="block bg-gradient-to-b from-white/[0.06] to-transparent bg-clip-text text-[20vw] font-medium leading-none tracking-tighter text-transparent">
          Eureka Hacks
        </span>
      </div>
    </footer>
  );
}
