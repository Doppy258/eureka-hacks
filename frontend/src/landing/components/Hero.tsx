import { ArrowRight, ArrowUpRight, Menu } from "lucide-react";
import { Link } from "react-router-dom";
import ShinyText from "./ShinyText";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_105406_16f4600d-7a92-4292-b96e-b19156c7830a.mp4";

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "About Us", href: "#about" },
  { label: "Courses", href: "#courses" },
  { label: "Instructors", href: "#instructors" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Blog", href: "#blog" },
] as const;

export default function Hero() {
  return (
    <section className="relative h-screen w-full overflow-hidden bg-black">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
      />

      <div className="relative z-10 flex h-full flex-col">
        <NavBar />
        <IntroRow />
        <HeroBlock />
      </div>
    </section>
  );
}

function NavBar() {
  return (
    <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 md:px-8">
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

      <ul className="hidden items-center gap-0.5 rounded-full border border-gray-700 px-2 py-1.5 text-sm lg:flex">
        {NAV_LINKS.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="block rounded-full px-3 py-1.5 text-white/80 transition-colors duration-200 hover:text-white"
            >
              {link.label}
            </a>
          </li>
        ))}
        <li>
          <Link
            to="/studio"
            className="block rounded-full px-3 py-1.5 font-medium text-[color:var(--color-accent)] transition-colors duration-200 hover:text-white"
          >
            TRIBE Studio
          </Link>
        </li>
        <li>
          <a
            href="#contact"
            className="ml-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-white/80 transition-colors duration-200 hover:text-white"
          >
            Contact us
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        </li>
      </ul>

      <button
        type="button"
        aria-label="Open menu"
        className="rounded-full border border-gray-700 p-2 text-white/80 transition-colors duration-200 hover:text-white lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
    </nav>
  );
}

function IntroRow() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-2 pt-2 md:px-8 lg:pb-4 lg:pt-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-12">
        <p className="max-w-md text-sm leading-relaxed text-white/80 md:text-base">
          Build bold products and explore what captures attention — including
          optional TRIBE v2 brain-response timelines for your creative cuts.
        </p>
        <p className="text-sm leading-relaxed text-white/80 md:text-base lg:text-right">
          Landing · programs · open studio tools in one place.
        </p>
      </div>
    </div>
  );
}

function HeroBlock() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-6 pb-10 text-center md:px-8">
      <p className="mb-4 text-xs uppercase tracking-tight text-white/80 md:mb-6 md:text-sm">
        Seats for Next Program Opening Soon
      </p>

      <h1
        className="font-medium tracking-tighter text-white text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl"
        style={{ lineHeight: 0.85 }}
      >
        <span className="block">Become</span>
        <span className="block">
          <ShinyText text="Product Leader." />
        </span>
      </h1>

      <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row md:mt-12">
        <a
          href="#apply"
          className="group inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-gray-900 md:px-8 md:py-4 md:text-base"
        >
          Apply for Next Enrollment
          <ArrowRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 md:h-5 md:w-5"
            strokeWidth={2}
          />
        </a>
        <Link
          to="/studio"
          className="group inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-medium text-white backdrop-blur-sm transition-colors duration-200 hover:border-white/40 hover:bg-white/10 md:px-8 md:py-4 md:text-base"
        >
          Open TRIBE Studio
          <ArrowRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 md:h-5 md:w-5"
            strokeWidth={2}
          />
        </Link>
      </div>
    </div>
  );
}
