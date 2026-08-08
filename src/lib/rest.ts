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
 * The load/reps line a rest screen shows for the set it leads into, or `null`
 * when that rest shouldn't carry one. `target` is the already-formatted line
 * ("135 × 8", "12 reps") and `setIndex` is the 0-based position of the coming
 * set within its exercise.
 *
 * Only the rest before an exercise's *first* set gets the numbers. That's the
 * moment they're worth reading: the move is new, nothing about it is on screen
 * yet, and you're walking over to load it. From the second set on, the set
 * screen prefills what you actually just lifted rather than the progression
 * target, so a target shown here describes a set you aren't about to do.
 */
export function upNextTargetLabel(setIndex: number, target: string | null): string | null {
  return setIndex === 0 ? target : null
}

/**
 * The load/reps line a rest screen shows for the set it leads into, or `null`
 * when that rest shouldn't carry one. `target` is the already-formatted line
 * ("135 × 8", "12 reps") and `setIndex` is the 0-based position of the coming
 * set within its exercise.
 *
 * Only the rest before an exercise's *first* set gets the numbers. That's the
 * moment they're worth reading: the move is new, nothing about it is on screen
 * yet, and you're walking over to load it. From the second set on, the set
 * screen prefills what you actually just lifted rather than the progression
 * target, so a target shown here describes a set you aren't about to do.
 */
export function upNextTargetLabel(setIndex: number, target: string | null): string | null {
  return setIndex === 0 ? target : null
}

/**
 * Moving between stations of a circuit: just long enough to walk over and set
 * up. The point of a circuit is that the muscle you just worked recovers while
 * you work the others, so a full rest here would throw that away.
 */
export const CIRCUIT_STATION_REST_SEC = 30

/**
 * How long to rest after completing a set.
 *
 * - Between sets of the SAME exercise: the exercise's own prescribed `restSec`.
 * - Moving to the next STATION of a circuit: {@link CIRCUIT_STATION_REST_SEC}.
 * - Starting a new ROUND of a circuit (back to the first station): the next
 *   exercise's own `restSec`, capped — you've now worked every station once.
 * - Transitioning to a DIFFERENT exercise: only what the NEXT exercise needs
 *   (its `restSec`), capped at {@link TRANSITION_REST_CAP_SEC}.
 * - No next set (final set of the whole workout): `0` — the caller finishes
 *   instead of resting.
 */
export function restBeforeNextSet(params: {
  currentRestSec: number
  sameExercise: boolean
  nextRestSec: number | null
  /** Next set is another station of the circuit the current set belongs to. */
  sameCircuit?: boolean
  /** That station starts a new round rather than continuing the current one. */
  newCircuitRound?: boolean
}): number {
  const { currentRestSec, sameExercise, nextRestSec, sameCircuit, newCircuitRound } = params
  if (sameExercise) return currentRestSec
  if (nextRestSec == null) return 0
  if (sameCircuit && !newCircuitRound) return CIRCUIT_STATION_REST_SEC
  return Math.min(nextRestSec, TRANSITION_REST_CAP_SEC)
}
