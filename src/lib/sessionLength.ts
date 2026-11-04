/**
 * Opening a SHORT session up to the FULL day (see config/plan.SessionLength).
 *
 * A session starts in the day's short form — the movements with a short count of
 * zero left out, the rest cut to their short count — and the checklist can expand
 * it to the whole day mid-workout. The expansion only ever ADDS: a movement the
 * short day left out is spliced in where the full day has it, a movement cut to
 * fewer sets gets the sets it was missing appended, and everything already in the
 * log — done or not — stays exactly as it was. So a set logged before the switch
 * is still logged after it, and switching twice changes nothing the second time.
 *
 * Pure module — no React/DOM. The caller hands in the full day as the session is
 * performing it (variant and side order applied) and the progression targets for
 * whatever it needs to prescribe; see useActiveSession.expandToFull.
 */

import type { ExerciseLog, SetLog, WorkoutSession } from '../types'
import type { PlannedExercise } from '../config/plan'
import type { Target } from './progression'

/**
 * `session` opened up to `full`, the day's whole exercise list in performed order.
 *
 * Sets added to a movement already in the log prefill from its last set rather
 * than from the target — the same carry-forward the set screen applies, since by
 * the time the switch happens that last set is the better guess at what the next
 * one will be. A movement new to the log prefills every set from `targets`, as it
 * would have at the start; a key the targets don't know prefills the plan's
 * opening reps and no weight.
 *
 * Logs for keys the full day doesn't list — ad-hoc exercises added from the
 * checklist, or anything else — keep their place after the day's own, in the order
 * they already had.
 */
export function expandToFull(
  session: WorkoutSession,
  full: PlannedExercise[],
  targets: Map<string, Target>,
): WorkoutSession {
  const byKey = new Map(session.exercises.map((log) => [log.exercise, log]))
  const dayKeys = new Set(full.map((e) => e.key))
  const own: ExerciseLog[] = full.map((e) => {
    const existing = byKey.get(e.key)
    if (!existing) return { exercise: e.key, sets: freshSets(e, targets.get(e.key)) }
    if (existing.sets.length >= e.sets) return existing
    return { ...existing, sets: extendSets(existing.sets, e.sets) }
  })
  const extra = session.exercises.filter((log) => !dayKeys.has(log.exercise))
  return { ...session, length: 'full', exercises: [...own, ...extra] }
}

function freshSets(e: PlannedExercise, target: Target | undefined): SetLog[] {
  const weightLbs = target?.weightLbs ?? null
  const reps = target?.reps ?? e.repMin
  return Array.from({ length: e.sets }, (_, i) => ({ setNumber: i + 1, weightLbs, reps, done: false }))
}

function extendSets(sets: SetLog[], count: number): SetLog[] {
  const last = sets[sets.length - 1]
  const out = sets.slice()
  while (out.length < count) {
    out.push({
      setNumber: out.length + 1,
      weightLbs: last?.weightLbs ?? null,
      reps: last?.reps ?? 0,
      done: false,
    })
  }
  return out
}
