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
 * Where the coming set sits in its exercise, as the rest screen says it ("set 2
 * of 4"). `setIndex` is 0-based, so it counts up for display.
 *
 * Shown on every rest, first set included: resting is when you lose track of the
 * count, and the number answers both "how much of this move is left" and "which
 * set am I walking back to". Spelled out rather than "2/4" — this is read at
 * arm's length, from the shape's distance rather than the set screen's.
 *
 * `null` for an exercise with no sets to count, which has nothing to say.
 */
export function upNextSetLabel(setIndex: number, setCount: number): string | null {
  if (setCount <= 0) return null
  return `set ${setIndex + 1} of ${setCount}`
}

/**
 * A session's rest accounting so far: seconds actually spent on the rest screen,
 * the rest those intervals prescribed, and how many were taken. Prescribed and
 * count ride along with the time taken because the estimator learns the *ratio*
 * between the two (see lib/estimate) — measure one without the other and the
 * ratio is against the wrong denominator.
 *
 * `sessionId` is the session it was measured in, so a tally left behind by a
 * finished or discarded workout can't be credited to the next one.
 */
export type RestTally = {
  sessionId: string
  takenSec: number
  prescribedSec: number
  count: number
}

export function emptyRestTally(sessionId: string): RestTally {
  return { sessionId, takenSec: 0, prescribedSec: 0, count: 0 }
}

/**
 * The tally a session resumes with. A workout's total length is derived from its
 * persisted `startedAt`, so this has to be persisted too: a reload that started
 * the rest count over kept the full total and lost the rest, charging every rest
 * taken before it to working time. Anything stored under a different session is
 * ignored rather than carried over.
 */
export function resumeRestTally(saved: RestTally | null, sessionId: string): RestTally {
  if (!saved || saved.sessionId !== sessionId) return emptyRestTally(sessionId)
  return {
    sessionId,
    takenSec: Math.max(0, saved.takenSec || 0),
    prescribedSec: Math.max(0, saved.prescribedSec || 0),
    count: Math.max(0, saved.count || 0),
  }
}

/** Record a rest interval as it opens, by the seconds it prescribes. */
export function openRest(tally: RestTally, prescribedSec: number): RestTally {
  return {
    ...tally,
    prescribedSec: tally.prescribedSec + Math.max(0, prescribedSec),
    count: tally.count + 1,
  }
}

/**
 * Fold the rest currently on the clock into the tally. `startedAt` is 0 when no
 * rest is running and banks nothing, so this is safe on every exit from the rest
 * screen — including finishing the workout straight out of it, which the rest
 * screen's own menu can do.
 */
export function bankRest(tally: RestTally, startedAt: number, now: number): RestTally {
  if (!startedAt || now <= startedAt) return tally
  return { ...tally, takenSec: tally.takenSec + (now - startedAt) / 1000 }
}

/**
 * Rest to credit for an interval that was on the clock when the app went away
 * and has come back too stale to reopen (see {@link canResumeRest}) — the phone
 * locked mid-rest, or the tab was discarded and the session picked up later.
 *
 * Such a rest is dropped from the screen, but the seconds it ran are still
 * inside the session total, which is measured from the persisted `startedAt`.
 * Banking nothing for it left every one of them charged to working time: an
 * hour of gym time reading as an hour of working out. It's credited at its
 * nominal length and no further — the interval did rest you for as long as it
 * prescribed, but the hours a phone spends locked afterwards are not rest.
 *
 * Returns 0 for a rest that is resuming normally (the live screen banks that
 * one from its real start) and for no rest at all.
 */
export function staleRestSec(
  rest: { seconds: number; endsAt: number } | null | undefined,
  now: number,
): number {
  if (!rest || canResumeRest(rest.endsAt, now)) return 0
  const startedAt = rest.endsAt - rest.seconds * 1000
  return Math.max(0, Math.min(rest.seconds, (now - startedAt) / 1000))
}

/**
 * Moving between stations of a circuit: just long enough to walk over and set
 * up. The point of a circuit is that the muscle you just worked recovers while
 * you work the others, so a full rest here would throw that away.
 */
export const CIRCUIT_STATION_REST_SEC = 30

/** A rest length as the workout flow shows it: "none", "45s", "2 min". */
export function restLabel(sec: number): string {
  if (sec <= 0) return 'none'
  return sec >= 60 ? `${sec / 60} min` : `${sec}s`
}

/**
 * The rests a circuit station can be set to from the session menu, in the order
 * they're offered. `null` is "leave it to the circuit" — the built-in station
 * timing, stored as no `circuitRestSec` at all — and is deliberately a separate
 * choice from `0`, which is an explicit "roll straight on to the next move".
 */
export const CIRCUIT_REST_CHOICES: readonly (number | null)[] = [null, 0, 10, 30, 45, 60, 90, 120]

/**
 * The rests a circuit's ROUND boundary can be set to, in the order they're
 * offered — the wrap from the last station back round to the first, once every
 * station has been worked (see PlannedExercise.circuitRoundRestSec).
 *
 * Longer choices than the station list above and no `0`: this is the break after a
 * full round of the circuit, and a round you roll straight out of is what the
 * station rests are for. `null` is "leave it to the stations", i.e. no round rest
 * of its own.
 */
export const CIRCUIT_ROUND_REST_CHOICES: readonly (number | null)[] = [
  null,
  60,
  90,
  120,
  150,
  180,
]

/** How one {@link CIRCUIT_REST_CHOICES} entry reads in the picker. */
export function circuitRestLabel(sec: number | null): string {
  return sec == null ? 'default' : restLabel(sec)
}

/**
 * How long to rest after completing a set.
 *
 * - Between sets of the SAME exercise: the exercise's own prescribed `restSec`.
 * - Moving on inside a CIRCUIT, when the station just finished carries a
 *   `circuitRestSec`: that value, station change or new round alike. It's how a
 *   circuit rests only where it needs to — `0` rolls straight on to the next
 *   move, so a rest can sit after one station and nowhere else.
 * - Moving to the next STATION of a circuit otherwise: {@link CIRCUIT_STATION_REST_SEC}.
 * - Starting a new ROUND of a circuit, when the station carries a
 *   `circuitRoundRestSec`: that value, which outranks its `circuitRestSec` —
 *   the two are the whole point of the field being separate (see
 *   PlannedExercise.circuitRoundRestSec).
 * - Starting a new ROUND of a circuit otherwise: the next
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
  /**
   * Per-station override from the exercise just finished (`PlannedExercise.
   * circuitRestSec`). Only consulted inside a circuit; absent leaves the
   * built-in station/round timing alone.
   */
  circuitRestSec?: number | null
  /**
   * The same, for the wrap into a new round only (`PlannedExercise.
   * circuitRoundRestSec`). Outranks `circuitRestSec` there, which is what lets a
   * circuit hold a short change between its stations and a full rest between
   * rounds; absent leaves the round boundary to `circuitRestSec` as before.
   */
  circuitRoundRestSec?: number | null
}): number {
  const {
    currentRestSec,
    sameExercise,
    nextRestSec,
    sameCircuit,
    newCircuitRound,
    circuitRestSec,
    circuitRoundRestSec,
  } = params
  if (sameExercise) return currentRestSec
  if (nextRestSec == null) return 0
  if (sameCircuit) {
    if (newCircuitRound && circuitRoundRestSec != null) return circuitRoundRestSec
    if (circuitRestSec != null) return circuitRestSec
    if (!newCircuitRound) return CIRCUIT_STATION_REST_SEC
  }
  return Math.min(nextRestSec, TRANSITION_REST_CAP_SEC)
}
