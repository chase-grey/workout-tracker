import type { WorkoutRow } from '../types'

export function reconcileWorkouts(remote: WorkoutRow[], pending: WorkoutRow[], local: WorkoutRow[],
  revisionAtFetch: number, currentRevision: number): WorkoutRow[] {
  return revisionAtFetch === currentRevision ? mergePendingWorkouts(remote, pending) : local
}

export function mergePendingWorkouts(remote: WorkoutRow[], pending: WorkoutRow[]): WorkoutRow[] {
  const key = (r: WorkoutRow) => JSON.stringify([r.session_id, r.exercise, r.set_number])
  const rows = new Map(remote.map((r) => [key(r), r]))
  for (const row of pending) rows.set(key(row), row)
  return [...rows.values()]
}
