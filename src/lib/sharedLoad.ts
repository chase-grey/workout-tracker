/**
 * Keeping the stations that share one weight in step during a workout.
 *
 * A load-sharing group (see PlannedExercise.sharedLoad) is prescribed a single
 * weight when the session is built — the tricep pair off one cable stack, the two
 * arms of the lateral raise off one dumbbell. Nothing kept them together after
 * that: re-pinning the stack heavier at the pushdown left the overhead extension
 * still prefilled with the old number, so the one weight the group is supposed to
 * have was a weight you had to type twice.
 */

import type { ExerciseLog, SetLog } from '../types'

/** The plan fields a load-sharing group is read from. */
export type LoadGroupMember = {
  key: string
  sharedLoad?: string
  bodyweight?: boolean
}

/**
 * The other exercises that share `key`'s weight — its load-sharing group minus
 * itself. Empty for an exercise that shares with nothing and for one that is
 * alone in its group, so a caller can treat both the same way.
 *
 * A bodyweight move is left out exactly as it is when the targets are read (see
 * progression.nextTargets), so the two can't disagree about the membership.
 */
export function sharedLoadPeers(exercises: readonly LoadGroupMember[], key: string): string[] {
  const self = exercises.find((e) => e.key === key)
  if (!self?.sharedLoad || self.bodyweight) return []
  return exercises
    .filter((e) => e.key !== key && !e.bodyweight && e.sharedLoad === self.sharedLoad)
    .map((e) => e.key)
}

/**
 * The session's logs with a weight just entered at one station carried across to
 * the rest of its load-sharing group.
 *
 * Only sets not yet marked done are changed: a completed set records what was
 * actually lifted, and the point of the group is the weight you're *about* to
 * load, not a rewrite of the sets behind you.
 *
 * A cleared weight field reads as `null` and spreads nothing. Emptying the box is
 * a step on the way to typing a new number (backspacing 30 to reach 35), not an
 * instruction to blank out the other stations — and the number that follows it
 * spreads normally.
 *
 * Returns `logs` itself when there's nothing to carry, so a plain reps or done
 * edit doesn't hand React a new array to re-render.
 */
export function spreadSharedWeight<T extends ExerciseLog>(params: {
  logs: T[]
  exercises: readonly LoadGroupMember[]
  exKey: string
  weightLbs: SetLog['weightLbs'] | undefined
}): T[] {
  const { logs, exercises, exKey, weightLbs } = params
  if (weightLbs == null) return logs
  const peers = new Set(sharedLoadPeers(exercises, exKey))
  if (peers.size === 0) return logs
  let changed = false
  const out = logs.map((log) => {
    if (!peers.has(log.exercise)) return log
    if (!log.sets.some((s) => !s.done && s.weightLbs !== weightLbs)) return log
    changed = true
    return {
      ...log,
      sets: log.sets.map((s) => (s.done ? s : { ...s, weightLbs })),
    }
  })
  return changed ? out : logs
}
