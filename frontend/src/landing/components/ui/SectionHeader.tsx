import type { ReactNode } from "react";
import FadeInOnView from "./FadeInOnView";

interface SectionHeaderProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  /** When true, the eyebrow + title align to the left edge. Default false (center). */
  align?: "left" | "center";
  className?: string;
}

export default function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  className = "",
}: SectionHeaderProps) {
  const alignment =
    align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <FadeInOnView className={`flex flex-col ${alignment} ${className}`}>
      <span className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-3 py-1 text-xs uppercase tracking-tight text-white/70">
        <span
          aria-hidden
          className="block h-1.5 w-1.5 rounded-full bg-[#64CEFB]"
        />
        {eyebrow}
      </span>

      <h2
        className="mt-5 max-w-3xl text-balance text-4xl font-medium tracking-tighter text-white sm:text-5xl md:text-6xl"
        style={{ lineHeight: 0.95 }}
      >
        {title}
      </h2>

      {description ? (
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
          {description}
        </p>
      ) : null}
    </FadeInOnView>
  );
}
