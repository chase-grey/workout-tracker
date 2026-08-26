/**
 * Carrying what you just lifted forward to the sets of the same exercise still
 * ahead of you in the session.
 *
 * Every set is prefilled with the progression target when the workout is built
 * (see useActiveSession.start), which is the right number for the first set of an
 * exercise: it's the step up the plan is asking for. It stops being the right
 * number the moment you answer the question — if the target said 55 and the bar
 * only had 50 on it, the sets behind that one are 50 too, and re-prescribing 55
 * for each of them is a number you have to correct three more times.
 *
 * Only the sets you haven't done yet move. A completed set records what was
 * actually lifted and is never rewritten from here.
 */

import type { ExerciseLog, SetLog } from '../types'

/** The numbers a completed set hands to the ones after it. */
export type CarriedSet = {
  weightLbs: SetLog['weightLbs']
  reps: number
}

/**
 * The session's logs with `carried` written into every not-yet-done set of
 * `exKey`.
 *
 * All of them rather than just the next one, because "the next set of this
 * exercise" isn't the next screen for a circuit station — the arm circuit puts
 * another two stations between a pushdown and the pushdown after it — and it isn't
 * the next screen either when you jump around the checklist. Writing the whole
 * remainder means every one of them reads what you last logged no matter which
 * order you reach them in, and the set after that overwrites it in turn.
 *
 * A set logged with no reps (nothing entered, an exercise skipped through) carries
 * nothing: it isn't a performance to build the rest of the exercise on.
 *
 * Returns `logs` itself when there's nothing to carry, so a set that matched its
 * prefill exactly doesn't hand React a new array to re-render.
 */
export function carryLoggedSet<T extends ExerciseLog>(params: {
  logs: T[]
  exKey: string
  carried: CarriedSet
}): T[] {
  const { logs, exKey, carried } = params
  if (carried.reps <= 0) return logs
  let changed = false
  const out = logs.map((log) => {
    if (log.exercise !== exKey) return log
    const pending = (s: SetLog) => !s.done
    const differs = (s: SetLog) => s.weightLbs !== carried.weightLbs || s.reps !== carried.reps
    if (!log.sets.some((s) => pending(s) && differs(s))) return log
    changed = true
    return {
      ...log,
      sets: log.sets.map((s) => (pending(s) ? { ...s, ...carried } : s)),
    }
  })
  return changed ? out : logs
}
