/**
 * Grading a single completed set against the target it was prefilled with.
 *
 * The workout flow puts one target on screen per set (see progression.ts) and
 * asks you to walk back to the bar and hit it. Landing exactly on it earns a
 * quiet flourish; going past it earns a brighter one (see SetCheer). This module
 * only decides which — no React/DOM — so it stays unit-testable.
 *
 * Deliberately literal: it compares what you logged to the numbers that were
 * displayed, rather than scoring estimated 1RM. A set that trades reps for
 * weight (heavier than asked, but short on reps) is left ungraded — it may well
 * be the harder set, but it isn't the set the screen asked for, and inventing a
 * cheer for it would make the flourish stop meaning anything.
 */

import type { Target } from './progression'

/** `met` landed exactly on the target; `beat` went past it in either dimension. */
export type SetGrade = 'met' | 'beat'

/** Plates come in halves at finest, so float slop must never read as a miss. */
const EPS = 1e-6

/**
 * Grade a completed set, or null when there's nothing to cheer — no target on
 * screen, no reps logged, or the target simply wasn't reached.
 *
 * A target with no weight (a reps-only move, or a lift with no history to price
 * yet) is judged on reps alone: `null` there means "no load prescribed", not
 * zero, so added weight isn't scored against a number nobody asked for.
 */
export function gradeSet(
  weightLbs: number | null,
  reps: number,
  target: Target | undefined,
): SetGrade | null {
  if (!target || reps <= 0) return null

  if (target.weightLbs == null) {
    if (reps < target.reps) return null
    return reps > target.reps ? 'beat' : 'met'
  }

  if (weightLbs == null) return null
  if (weightLbs + EPS < target.weightLbs || reps < target.reps) return null
  const heavier = weightLbs > target.weightLbs + EPS
  return heavier || reps > target.reps ? 'beat' : 'met'
}
