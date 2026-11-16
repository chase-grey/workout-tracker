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

/*
 * Single sets dropped from the flow.
 *
 * The same decision as skipping an exercise, made one set at a time from the
 * checklist: the last set of the press when the shoulder says so, the second
 * side of a calf stretch that's already loose. A skipped set stays in the
 * checklist, struck through, to be put back; it leaves everything that's
 * counted from the sets still to do.
 */

/** The sets of an exercise still owed or logged — the ones a skip hasn't taken out. */
export function setsInPlay<T extends { skipped?: boolean }>(sets: readonly T[]): T[] {
  return sets.filter((s) => !s.skipped)
}

/**
 * Whether every set an exercise still has in play is logged. An exercise whose
 * every set was skipped isn't complete — nothing of it was done.
 */
export function allInPlayDone(sets: readonly { skipped?: boolean; done?: boolean; reps: number }[]): boolean {
  const live = setsInPlay(sets)
  return live.length > 0 && live.every((s) => !!s.done && s.reps > 0)
}

/**
 * The step the screen lands on once the flow has changed under it.
 *
 * The step on screen stays put while it's still in play. When it's the one
 * that left, the screen moves on the way finishing it would have: to the next
 * step still owed ahead of it, then to one left behind, then — when nothing is
 * owed — to anything still in play. Null only when nothing is.
 *
 * `order` is the flow before the change, in order; `inPlay` says whether a step
 * is still in it after; `done` whether a step is logged.
 */
export function landingStep(
  order: readonly string[],
  inPlay: (key: string) => boolean,
  done: (key: string) => boolean,
  current: string,
): string | null {
  if (inPlay(current)) return current
  const at = order.indexOf(current)
  const owed = (k: string) => inPlay(k) && !done(k)
  return order.slice(at + 1).find(owed) ?? order.find(owed) ?? order.find(inPlay) ?? null
}
