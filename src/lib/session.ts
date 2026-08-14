import type { DayType, WorkoutRow, WorkoutSession } from '../types'
import { DEAD_BUG } from '../config/plan'
import { isMaxAttempt } from './maxAttempt'

/**
 * Exercise keys that are supplemental core work (dead bugs, now folded into the
 * Stretch + Core session). A workout session whose every logged row is one of
 * these is accessory work: it's charted for reps but never counts as a workout
 * toward the weekly goal — the same treatment the old standalone Core day had.
 * Keying off the exercise (not a day type) also covers legacy rows saved under
 * the removed `abs` day, since those were dead-bug rows too.
 */
export const SUPPLEMENTAL_EXERCISE_KEYS = new Set<string>([DEAD_BUG.key])

export type TrainingSession = { sessionId: string; date: string; dayType: DayType }

/**
 * One entry per distinct workout session that counts as training — i.e. sessions
 * with at least one set that was neither supplemental nor a lone max attempt —
 * keeping each session's first-seen date and day type. Rows without a session_id
 * are ignored.
 *
 * A max attempt logged on its own is one rep (see maxAttempt): worth logging, and
 * not a workout. Walking in to take a single and walking out shouldn't bank a day
 * against the week's goal or hold the streak up. An attempt taken at the end of a
 * real session is carried by that session's other sets, which is right.
 */
export function trainingSessions(rows: WorkoutRow[]): TrainingSession[] {
  const meta = new Map<string, { date: string; dayType: DayType; real: boolean }>()
  for (const r of rows) {
    if (!r.session_id) continue
    const isReal = !SUPPLEMENTAL_EXERCISE_KEYS.has(r.exercise) && !isMaxAttempt(r)
    const prev = meta.get(r.session_id)
    if (!prev) meta.set(r.session_id, { date: r.date, dayType: r.day_type, real: isReal })
    else if (isReal) prev.real = true
  }
  const out: TrainingSession[] = []
  for (const [sessionId, v] of meta) {
    if (v.real) out.push({ sessionId, date: v.date, dayType: v.dayType })
  }
  return out
}

/**
 * The distinct dates training happened on, oldest first. Two sessions in one day
 * count once: the weekly goal, the streak and the week records are all counting
 * days trained, not sessions logged, so splitting an afternoon into a push and a
 * pull doesn't bank a whole week's worth of workouts in one day.
 */
export function trainingDates(rows: WorkoutRow[]): string[] {
  return [...new Set(trainingSessions(rows).map((s) => s.date))].sort()
}

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
        // Pinned onto every row, not just the day: which press led decides what
        // the next target for this lift is read from (see lastPerformance).
        variant: s.variant,
      })
    }
  }
  return rows
}

/**
 * The most recent training session (excluding supplemental-only ones), or null if
 * there's no training history yet. Dates are YYYY-MM-DD, so a plain string compare
 * orders them; `>=` lets a later row-order session win a same-day tie, since rows
 * are appended chronologically.
 */
export function lastTrainingSession(rows: WorkoutRow[]): TrainingSession | null {
  let latest: TrainingSession | null = null
  for (const s of trainingSessions(rows)) {
    if (!latest || s.date >= latest.date) latest = s
  }
  return latest
}

/** Rows that carry at least one completed set (a rep count > 0). */
export function hasLoggedSets(s: WorkoutSession): boolean {
  return s.exercises.some((ex) => ex.sets.some((set) => set.reps > 0))
}
