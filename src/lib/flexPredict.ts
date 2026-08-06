/**
 * The flexibility goal ladders — the side-split and tailor's-pose angles worth
 * aiming at, ascending.
 *
 * Shared by the goals panel (which builds and projects them through the common
 * goal machinery, see lib/goals), the celebration detector (lib/flexCelebration),
 * and the on-photo angle context (lib/angleContext), so all three agree on what
 * the milestones are.
 */

/** Side-split goal angles (degrees), ascending. */
export const SPLIT_GOALS = [100, 120, 150, 180] as const

/** Tailor's-pose goal angles (degrees), ascending. */
export const TAILORS_GOALS = [70, 80, 90] as const
