import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router";
import type { ReactNode } from "react";

/**
 * Fades the incoming storefront route in without delaying navigation.
 *
 * Deliberately not an exit animation: waiting for the old page to leave would
 * make route changes feel slower and can fight scroll restoration. The wrapper
 * is keyed by pathname, so React remounts it and play the enter transition.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
