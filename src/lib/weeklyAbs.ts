import { absExerciseKeys, type Plan } from '../config/plan'
import type { WorkoutRow } from '../types'
import { weekStartISO } from './dates'

export const WEEKLY_ABS_GOAL = 3

/** Count actual ab work on distinct days, including supplemental office sessions. */
export function weeklyAbsDays(rows: WorkoutRow[], plan: Plan, today: string): string[] {
  const keys = absExerciseKeys(plan)
  const monday = weekStartISO(today)
  return [...new Set(rows.filter((row) =>
    row.date >= monday && row.date <= today && row.reps > 0 && keys.has(row.exercise),
  ).map((row) => row.date))].sort()
}
