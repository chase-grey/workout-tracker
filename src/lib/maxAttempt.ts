/**
 * One-rep max attempts: a logged set of exactly one rep.
 *
 * A goal the app won't hand over on an estimate has to be settled by an actual
 * single (see goals.GoalSpec's `singles`), and that single is logged the same way
 * everything else is — a real row on a real exercise, so it shows up in the lift's
 * history and its PRs rather than living in a private goal ledger.
 *
 * Being a normal row means the rest of the app has to know what it is, because a
 * single at max weight is not a working set: prescribing the next session off it
 * would ask for a rep range at a weight nothing sustained (see
 * progression.lastPerformance), and one single is not a workout for the week's
 * purposes either (see session.trainingSessions).
 *
 * The rule is the reps, not a flag on the row: one rep with a weight on it *is* a
 * max attempt, whether it was logged from the goal prompt or done at the end of a
 * session. Which also means the definition survives a CSV round-trip through the
 * sheet, where a flag in the notes might not.
 *
 * Pure module — no React/DOM, no storage.
 */

import type { DayType, WorkoutRow } from '../types'

/** Note written on rows the goal prompt logs, so the sheet says what they were. */
export const MAX_ATTEMPT_NOTE = '1rm attempt'
/**
 * Note on the set the goal prompt logs for a lift that can't be loaded to a
 * single: the heaviest load there is, for the reps that settle the goal (see
 * goals.attemptReps). It's a set of many reps at a working weight, so unlike a
 * single it IS a working set — nothing here needs to tell the rest of the app
 * otherwise, and the note is only so the sheet says why it stands alone.
 */
export const GOAL_SET_NOTE = 'goal set'

/** Whether a logged set is a max attempt: a single, with a weight on it. */
export function isMaxAttempt(row: { reps: number; weight_lbs: number | null }): boolean {
  return row.reps === 1 && row.weight_lbs != null
}

/** Whether every weighted set in a session was a max attempt. */
export function isAttemptOnly(rows: { reps: number; weight_lbs: number | null }[]): boolean {
  return rows.length > 0 && rows.every(isMaxAttempt)
}

/**
 * The row a logged attempt becomes: a single, unless the goal is settled by a set
 * at the lift's cap instead, in which case `reps` is that set's count (see
 * goals.attemptReps) and the row is an ordinary working set with a note.
 */
export function maxAttemptRow({
  sessionId,
  date,
  dayType,
  exercise,
  weightLbs,
  reps = 1,
}: {
  sessionId: string
  date: string
  dayType: DayType
  exercise: string
  weightLbs: number
  reps?: number
}): WorkoutRow {
  return {
    session_id: sessionId,
    date,
    day_type: dayType,
    exercise,
    set_number: 1,
    weight_lbs: weightLbs,
    reps,
    notes: reps === 1 ? MAX_ATTEMPT_NOTE : GOAL_SET_NOTE,
    is_historical: false,
  }
}
