/**
 * The flexibility goal ladders — the angles worth aiming at on each of the four
 * measured poses, easiest rung first.
 *
 * Shared by the goals panel (which builds and projects them through the common
 * goal machinery, see lib/goals), the celebration detector (lib/flexCelebration),
 * and the on-photo angle context (lib/angleContext), so all three agree on what
 * the milestones are.
 *
 * "Easiest first" rather than "ascending", because three of the four ladders climb
 * and the toe touch's descends: its reading is a hip angle that closes as the fold
 * deepens (see lib/flexMetrics). Every consumer walks these in order and asks the
 * metric's own comparator which way better runs, so the order is the difficulty
 * and the numbers are only the numbers.
 */

/**
 * Side-split goal angles (degrees), ascending.
 *
 * 110 sits between the first rung and 120 because that stretch of the ladder is
 * where the log actually is, and a twenty-degree gap there is a long time with
 * nothing to cross. The rungs widen as they get harder — the degrees past 135
 * come slowly enough that spacing them fifteen apart still leaves each one a
 * season's work.
 */
export const SPLIT_GOALS = [100, 110, 120, 135, 150, 165, 180] as const

/** Tailor's-pose goal angles (degrees), ascending. */
export const TAILORS_GOALS = [60, 70, 80, 90] as const

/**
 * Toe-touch goal angles (degrees), easiest first — which here means *descending*,
 * because the reading is the hip angle of a standing fold and it closes as the
 * fold deepens (see lib/flexMetrics). 90° is hands to the floor with the hips
 * square, 70° is a chest that has started to come down onto the thighs, and every
 * ladder consumer reads the order rather than the arithmetic, so the array itself
 * carries the difficulty.
 *
 * The ladder starts at 90 rather than above it: a fold to mid-shin is where the
 * log already was, and a rung already standing behind you is a rung that never
 * gets crossed. Ten degrees a rung from there. The fold is mostly waiting on
 * hamstring length, which gives up range faster than the adductors the split
 * needs, so a rung this size is a season rather than a year — and unlike the
 * split there is a floor in sight, so the rungs have no reason to widen as they
 * go.
 */
export const TOE_TOUCH_GOALS = [90, 80, 70] as const

/**
 * Leg-lift goal angles (degrees), ascending.
 *
 * The ladder tightens as it climbs: ten degrees a rung to 85, then five to 90. A
 * leg held at 90° is straight up with the hips still level, and the last stretch
 * of that is where a supine lift stops being hamstring length and starts being
 * whether the other hip will stay down — so the final rung is half the height of
 * the ones before it and still the hardest of them.
 */
export const LEG_LIFT_GOALS = [65, 75, 85, 90] as const
