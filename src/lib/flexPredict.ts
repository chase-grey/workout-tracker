/**
 * The flexibility goal ladders — the side-split and tailor's-pose angles worth
 * aiming at, ascending.
 *
 * Shared by the goals panel (which builds and projects them through the common
 * goal machinery, see lib/goals), the celebration detector (lib/flexCelebration),
 * and the on-photo angle context (lib/angleContext), so all three agree on what
 * the milestones are.
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
