/** Pure rest-timing helpers for the guided workout flow. */

/**
 * Transition rests (moving from one exercise to the next) are capped here.
 * The full inter-set rest of a heavy lift shouldn't carry over when the next
 * move is lighter — you only need enough recovery for what's coming up.
 */
export const TRANSITION_REST_CAP_SEC = 90

/**
 * How long past its end a persisted rest can still be resumed. A rest counts
 * into overtime indefinitely while the app is open, but reopening the app a day
 * later shouldn't drop you onto a rest screen reading "+14:52:07".
 */
export const RESUMABLE_REST_GRACE_SEC = 30 * 60

/**
 * Whether a rest saved before a reload/app-close should reopen. Rests are
 * wall-clock based, so time spent away still counts — but only up to
 * {@link RESUMABLE_REST_GRACE_SEC} of overtime, past which the rest is stale
 * and the caller should move straight on to the next set.
 */
export function canResumeRest(endsAt: number, now: number): boolean {
  return now - endsAt <= RESUMABLE_REST_GRACE_SEC * 1000
}

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
