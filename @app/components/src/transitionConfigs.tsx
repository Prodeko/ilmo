const baseEase = [0.48, 0.15, 0.25, 0.96]

const baseExit = {
  opacity: 0,
  transition: { duration: 0.2, ease: baseEase },
}

const baseEnter = {
  opacity: 1,
  y: 0,
  x: 0,
  transition: {
    duration: 0.4,
    ease: baseEase,
    staggerChildren: 0.05,
  },
}

/**
 * Transition for a generic container whose children should animate too
 */
export const containerTransitions = {
  initial: { opacity: 0 },
  enter: baseEnter,
  exit: baseExit,
}

/**
 * Transition for a generic item animating into view upwards
 */
export const itemTransitionUp = {
  initial: { y: 15, opacity: 1 },
  enter: baseEnter,
  exit: baseExit,
}

/**
 * Transition for a generic item animating into view downwards
 */
export const itemTransitionDown = {
  initial: { y: -15, opacity: 0 },
  enter: baseEnter,
  exit: baseExit,
}

/**
 * Transition for a generic item animating into view fron right
 */
export const itemTransitionLeft = {
  initial: { x: 15, opacity: 0 },
  enter: baseEnter,
  exit: baseExit,
}
