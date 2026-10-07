/** Motion tokens. Anticipation → action → overshoot (~6%) → settle. Transform & opacity only. */
export const dur = { instant: 0.09, fast: 0.14, base: 0.22, slow: 0.36, cinematic: 0.7 } as const;

export const ease = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const spring = {
  ui: { type: 'spring', stiffness: 380, damping: 32, mass: 1 },
  panel: { type: 'spring', stiffness: 260, damping: 30, mass: 1 },
  hover: { type: 'spring', stiffness: 60, damping: 9, mass: 1 },
  dart: { type: 'spring', stiffness: 220, damping: 22, mass: 1 },
  settle: { type: 'spring', stiffness: 120, damping: 14, mass: 1 },
} as const;

export const stagger = { min: 0.03, max: 0.05 } as const;

/** Variants shared across components so everything speaks one motion language. */
export const variants = {
  fadeUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.standard } },
    exit: { opacity: 0, y: 4, transition: { duration: dur.fast, ease: ease.exit } },
  },
  pop: {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1, transition: { duration: dur.slow, ease: ease.emphasized } },
    exit: { opacity: 0, scale: 0.98, transition: { duration: dur.fast, ease: ease.exit } },
  },
  panel: {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0, transition: spring.panel },
    exit: { opacity: 0, x: 6, transition: { duration: dur.fast, ease: ease.exit } },
  },
  /** reduced-motion fallback: opacity only, nearly instant */
  reduced: {
    initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: dur.instant } }, exit: { opacity: 0, transition: { duration: dur.instant } },
  },
} as const;

export const press = { whileTap: { scale: 0.98, transition: { duration: dur.instant } } } as const;
export const lift = { whileHover: { y: -1.5, transition: { duration: dur.fast, ease: ease.standard } } } as const;
