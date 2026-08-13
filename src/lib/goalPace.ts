/**
 * "Did what I just did move me faster or slower toward the goal?"
 *
 * After a session is logged, any locked goal whose exercise was trained gets
 * compared two ways: against where the locked line expected it to be today, and
 * against where it stood before the session. That answers both halves of the
 * question — whether you're ahead of the commitment overall, and whether this
 * particular session helped or cost you ground.
 *
 * Pure module — no React/DOM, no storage.
 */

import type { WorkoutRow } from '../types'
import { paceAgainstLock, type LockedProjections } from './goalLock'
import { project } from './predictions'
import { buildGoals, type GoalInputs } from './goals'

export type GoalPaceNote = {
  goalId: string
  title: string
  /** Faster/slower than the locked line needs, judged on this session. */
  direction: 'faster' | 'slower' | 'level'
  /** Human-readable line for the finish recap. */
  text: string
}

/** The latest value of a goal's series, or null when it has no data. */
function latest(points: { value: number }[]): number | null {
  return points.length ? points[points.length - 1].value : null
}

/**
 * Pace notes for every locked goal that the just-logged session touched.
 *
 * `prev` is the history from before the session and `added` the session's own
 * rows, so "this session" can be isolated: a goal only earns a note when one of
 * `added`'s exercises is a lift that goal is measured on — either of the presses
 * for the bench goal, which reads both (see goals.BENCH_ALSO_KEYS).
 */
export function goalPaceNotes(
  prev: WorkoutRow[],
  added: WorkoutRow[],
  locked: LockedProjections,
  inputs: Omit<GoalInputs, 'workouts'>,
  today: Date = new Date(),
): GoalPaceNote[] {
  const trained = new Set(added.map((r) => r.exercise))
  const goalsAfter = buildGoals({ ...inputs, workouts: [...prev, ...added] })
  // The same goals off the history alone, so "before" is read on whatever series
  // each goal is actually measured on — an estimated 1RM for the lift goals, the
  // reps held across four sets for the pull-up ladder. Rebuilding them is what
  // keeps the two halves of the comparison in the same units.
  const goalsBefore = new Map(buildGoals({ ...inputs, workouts: prev }).map((g) => [g.id, g]))
  const notes: GoalPaceNote[] = []

  for (const goal of goalsAfter) {
    const lock = locked[goal.id]
    if (!lock || goal.exerciseKey == null) continue
    const measuredOn = [goal.exerciseKey, ...(goal.alsoCounts ?? [])]
    if (!measuredOn.some((key) => trained.has(key))) continue

    const after = latest(goal.points)
    if (after == null) continue
    const afterDate = goal.points[goal.points.length - 1].date
    const before = latest(goalsBefore.get(goal.id)?.points ?? [])

    const { slopePerWeek } = project(goal.points, lock.target, today, {
      decayPerWeek: goal.decayPerWeek,
      capPerWeek: goal.capPerWeek,
    })
    const pace = paceAgainstLock(lock, after, afterDate, slopePerWeek, today)
    // Toward the target is positive whichever way the metric moves.
    const toward = Math.sign(lock.target - lock.startValue) || 1
    const moved = before == null ? 0 : Math.round((after - before) * toward * 10) / 10

    const direction: GoalPaceNote['direction'] = moved > 0 ? 'faster' : moved < 0 ? 'slower' : 'level'
    const standing =
      pace.status === 'on'
        ? 'right on the line'
        : `${Math.abs(pace.aheadBy)} ${goal.unit} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} the line`

    const movement =
      direction === 'faster'
        ? `+${moved} ${goal.unit} on ${goal.title}`
        : direction === 'slower'
          ? `${moved} ${goal.unit} on ${goal.title}`
          : `no change on ${goal.title}`

    notes.push({
      goalId: goal.id,
      title: goal.title,
      direction,
      text: `${movement} — ${standing}${pace.revisedEta ? `, eta ${pace.revisedEta}` : ''}`,
    })
  }

  return notes
}
