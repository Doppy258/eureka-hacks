import { motion } from "framer-motion";

interface ShinyTextProps {
  text: string;
  /** Base color of the text — visible everywhere except where the shine sweeps. */
  baseColor?: string;
  /** Highlight color that travels across the text. */
  shineColor?: string;
  /** Full sweep duration in seconds. */
  speed?: number;
  /** Gradient angle in degrees (controls the diagonal slant of the shine). */
  spread?: number;
  className?: string;
}

/**
 * Animated shiny text. Renders text using `background-clip: text` so a
 * gradient (with a moving white highlight) becomes the text fill, then uses
 * framer-motion to animate `background-position` left → right continuously.
 */
export default function ShinyText({
  text,
  baseColor = "#64CEFB",
  shineColor = "#ffffff",
  speed = 3,
  spread = 100,
  className = "",
}: ShinyTextProps) {
  // The gradient holds a single bright shine band centered at 50%.
  // Background-size 200% means the visible window only sees half of the
  // gradient at a time, so animating the position by 200% shifts the shine
  // fully across the text and lets the next cycle enter cleanly.
  const gradient = `linear-gradient(${spread}deg, ${baseColor} 0%, ${baseColor} 40%, ${shineColor} 50%, ${baseColor} 60%, ${baseColor} 100%)`;

  return (
    <motion.span
      className={className}
      style={{
        backgroundImage: gradient,
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        display: "inline-block",
      }}
      animate={{ backgroundPosition: ["200% 50%", "-200% 50%"] }}
      transition={{
        duration: speed,
        repeat: Infinity,
        ease: "linear",
        repeatType: "loop",
      }}
    >
      {text}
    </motion.span>
  );
}
