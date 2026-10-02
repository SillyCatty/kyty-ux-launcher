import type { Transition, Variants } from "motion/react";

/** One place for every spring so all menus share the same bouncy feel. */
export const springBouncy: Transition = { type: "spring", stiffness: 380, damping: 22, mass: 0.9 };
export const spring: Transition = { type: "spring", stiffness: 420, damping: 30, mass: 0.8 };
export const springSnappy: Transition = { type: "spring", stiffness: 640, damping: 34, mass: 0.6 };
export const springSoft: Transition = { type: "spring", stiffness: 220, damping: 24, mass: 1 };

const fade: Transition = { duration: 0.16, ease: "easeOut" };

/** Fluid, non-bouncy glide for elements travelling back to their place (e.g. a game card closing). */
export const smooth: Transition = { type: "tween", duration: 0.42, ease: [0.32, 0.72, 0, 1] };

/** Page changes must feel instant: a very short exit, an immediate enter and a light stagger. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1, y: 0,
    transition: { opacity: { duration: 0.14 }, y: { type: "spring", stiffness: 560, damping: 40 }, staggerChildren: 0.015 },
  },
  exit: { opacity: 0, transition: { duration: 0.04 } },
};

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { opacity: fade, y: spring, scale: springBouncy } },
  // Kept near-instant: the outgoing page's children must finish before the next page can mount.
  exit: { opacity: 0, transition: { duration: 0.03 } },
};

export const gridVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

export const popoverVariants: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.94 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { opacity: { duration: 0.12 }, y: springSnappy, scale: springBouncy } },
  exit: { opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.1 } },
};

export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalVariants: Variants = {
  initial: { opacity: 0, y: 36, scale: 0.92 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { opacity: fade, y: springBouncy, scale: springBouncy, staggerChildren: 0.05, delayChildren: 0.08 } },
  exit: { opacity: 0, y: 20, scale: 0.96, transition: { duration: 0.14 } },
};

export const toastVariants: Variants = {
  initial: { opacity: 0, x: 60, scale: 0.9 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { opacity: fade, x: springBouncy, scale: springBouncy } },
  exit: { opacity: 0, x: 40, scale: 0.94, transition: { duration: 0.15 } },
};

export const tap = { scale: 0.95 };
export const hoverLift = { y: -4, scale: 1.02 };
