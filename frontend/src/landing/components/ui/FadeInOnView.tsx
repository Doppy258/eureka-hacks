import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

interface FadeInOnViewProps {
  children: ReactNode;
  /** Delay before the child fades in, in seconds. */
  delay?: number;
  /** How far (px) the child rises from below as it fades in. */
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}

const buildVariants = (y: number): Variants => ({
  hidden: { opacity: 0, y },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
});

/**
 * Lightweight wrapper that fades children in once they enter the viewport.
 * Uses `whileInView` with `once: true` so the animation never replays on
 * scroll-back, which would otherwise feel busy on a long landing page.
 */
export default function FadeInOnView({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
}: FadeInOnViewProps) {
  const Component = motion[as];
  const variants = buildVariants(y);

  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={variants}
      transition={{ delay }}
    >
      {children}
    </Component>
  );
}
