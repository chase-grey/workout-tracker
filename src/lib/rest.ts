/** Pure rest-timing helpers for the guided workout flow. */

/**
 * Transition rests (moving from one exercise to the next) are capped here.
 * The full inter-set rest of a heavy lift shouldn't carry over when the next
 * move is lighter — you only need enough recovery for what's coming up.
 */
export const TRANSITION_REST_CAP_SEC = 90

/**
 * How long to rest after completing a set.
 *
 * - Between sets of the SAME exercise: the exercise's own prescribed `restSec`.
 * - Transitioning to a DIFFERENT exercise: only what the NEXT exercise needs
 *   (its `restSec`), capped at {@link TRANSITION_REST_CAP_SEC}.
 * - No next set (final set of the whole workout): `0` — the caller finishes
 *   instead of resting.
 */
export function restBeforeNextSet(params: {
  currentRestSec: number
  sameExercise: boolean
  nextRestSec: number | null
}): number {
  const { currentRestSec, sameExercise, nextRestSec } = params
  if (sameExercise) return currentRestSec
  if (nextRestSec == null) return 0
  return Math.min(nextRestSec, TRANSITION_REST_CAP_SEC)
}
