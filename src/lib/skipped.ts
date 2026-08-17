/**
 * Exercises dropped from the workout in progress.
 *
 * Skipping is a decision about today — a sore knee, a machine someone else is on
 * — so it never touches the plan. What it does touch is everything derived from
 * "the exercises still to do": the step flow, the set count, and the time-left
 * estimate. A skipped move stops being owed the moment it's skipped, which is
 * what makes time left the time you're actually going to spend rather than the
 * time the day was written for.
 *
 * Persisted, because an hour-long workout outlives more than one page load on a
 * phone, and keyed by the session it was decided in so a skip can't carry into
 * the next workout.
 *
 * Pure module — no React/DOM.
 */

/** The storable form: which exercise keys are skipped, and in which session. */
export type SkippedExercises = { sessionId: string; keys: string[] }

/** The skips a session resumes with. Anything saved under another one is ignored. */
export function resumeSkipped(saved: SkippedExercises | null, sessionId: string): Set<string> {
  if (!saved || saved.sessionId !== sessionId || !Array.isArray(saved.keys)) return new Set()
  return new Set(saved.keys.filter((k) => typeof k === 'string' && k !== ''))
}

export function toSkippedRecord(sessionId: string, keys: Set<string>): SkippedExercises {
  return { sessionId, keys: [...keys] }
}

/**
 * Whether `key` can leave the flow: a workout has to keep at least one exercise
 * in play, because an empty flow has no set to put on screen. The UI hides the
 * control for the last one left; this is the rule it hides on.
 */
export function canSkip(skipped: Set<string>, allKeys: string[], key: string): boolean {
  return allKeys.some((k) => k !== key && !skipped.has(k))
}

/** Add or remove one skip, leaving the input untouched. */
export function withSkipped(current: Set<string>, key: string, skip: boolean): Set<string> {
  const next = new Set(current)
  if (skip) next.add(key)
  else next.delete(key)
  return next
}
