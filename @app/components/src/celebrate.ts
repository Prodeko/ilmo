import { useFeature } from "./Feature"

/**
 * Shoots confetti from both bottom corners of the screen, e.g. after an
 * event or a registration has been created. The confetti is drawn on its
 * own canvas over the page, so it keeps going through a page change.
 * Nothing is shown to users who prefer reduced motion.
 */
async function celebrate() {
  // Loaded on demand: the library needs the browser and is only used here
  const { default: confetti } = await import("canvas-confetti")
  const shared = {
    particleCount: 80,
    spread: 70,
    startVelocity: 55,
    disableForReducedMotion: true,
  }
  confetti({ ...shared, angle: 60, origin: { x: 0, y: 1 } })
  confetti({ ...shared, angle: 120, origin: { x: 1, y: 1 } })
}

async function noCelebration() {}

/**
 * Returns the function to call after a new event or registration has been
 * saved (also from the registration form preview).
 */
export function useCelebrate() {
  const withConfetti = useFeature("confetti")
  return withConfetti ? celebrate : noCelebration
}
