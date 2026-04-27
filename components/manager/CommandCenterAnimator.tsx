"use client";

import { AnimatePresence, motion } from "framer-motion";

interface CommandCenterAnimatorProps {
  children: React.ReactNode;
  /** The current period key — changing this triggers the swap animation. */
  period: string;
}

// ── Animation variants ────────────────────────────────────────
// "Fade down on exit, breathe up on enter" — the brief's soft
// spring physics for dataset transitions.

const variants = {
  enter: {
    opacity: 0,
    y: 10,
    scale: 0.99,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.55,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.99,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 1, 1] as [number, number, number, number],
    },
  },
};

export function CommandCenterAnimator({
  children,
  period,
}: CommandCenterAnimatorProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={period}
        variants={variants}
        initial="enter"
        animate="visible"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
