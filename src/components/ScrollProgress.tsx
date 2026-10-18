import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";

/** Thin reading-progress accent pinned above the fixed header. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px] bg-blush/20"
      aria-hidden="true"
    >
      <motion.div
        className="h-full origin-left bg-gradient-to-r from-burgundy via-burgundy-light to-blush-dark"
        style={{ scaleX: reduce ? scrollYProgress : scaleX }}
      />
    </div>
  );
}
