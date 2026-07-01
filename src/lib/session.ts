import type { WorkoutRow, WorkoutSession } from '../types'

/** Flatten a session into the per-set rows stored in the sheet. */
export function sessionToRows(s: WorkoutSession): WorkoutRow[] {
  const rows: WorkoutRow[] = []
  for (const ex of s.exercises) {
    for (const set of ex.sets) {
      rows.push({
        session_id: s.sessionId,
        date: s.date,
        day_type: s.dayType,
        exercise: ex.exercise,
        set_number: set.setNumber,
        weight_lbs: set.weightLbs,
        reps: set.reps,
        notes: set.notes ?? ex.notes ?? '',
        is_historical: s.isHistorical,
      })
    }
  }
  return rows
}

/** Rows that carry at least one completed set (a rep count > 0). */
export function hasLoggedSets(s: WorkoutSession): boolean {
  return s.exercises.some((ex) => ex.sets.some((set) => set.reps > 0))
}
