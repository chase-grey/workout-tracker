import type { BodyWeightEntry, WorkoutRow } from '../types'
import { toISODate, weekStartISO } from './dates'
import { epley1RM } from './epley'
import { MIN_PR_HISTORY_DAYS } from './celebration'
import { exerciseName } from '../config/plan'

export type WeeklySummary = {
  /** Distinct sessions this week (Mon–Sun of `today`). */
  workoutCount: number
  /**
   * Exercises whose best est. 1RM this week beats their best est. 1RM in any
   * prior week — and that have enough prior history for "beat" to mean
   * something (see MIN_PR_HISTORY_DAYS).
   */
  prs: { exercise: string; est1RM: number }[]
  /**
   * Change in body weight (lbs) — latest this-week entry vs the latest entry
   * before this week. `null` if not computable.
   */
  weightTrend: number | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * Summarize the current week's training: distinct workout count, new PRs, and
 * body-weight trend. `today` defaults to now; the week is the Mon–Sun week
 * containing it.
 */
export function weeklySummary(
  workouts: WorkoutRow[],
  bodyWeights: BodyWeightEntry[],
  today: Date = new Date(),
  flexDates: string[] = [],
): WeeklySummary {
  const thisWeekStart = weekStartISO(toISODate(today))

  // --- Activity count: distinct workout sessions + distinct stretch days this week. ---
  const thisWeekSessions = new Set<string>()
  for (const r of workouts) {
    if (weekStartISO(r.date) === thisWeekStart) thisWeekSessions.add(r.session_id)
  }
  for (const d of flexDates) {
    if (weekStartISO(d) === thisWeekStart) thisWeekSessions.add(`flex:${d}`)
  }
  const workoutCount = thisWeekSessions.size

  // --- PRs: best est. 1RM this week vs best in any prior week, per exercise. ---
  // Prior weeks also supply the baseline test: a lift needs MIN_PR_HISTORY_DAYS
  // distinct earlier days before this week's number counts as beating anything,
  // so an exercise done for the first time isn't crowned a PR.
  const thisWeekBest = new Map<string, number>()
  const priorBest = new Map<string, number>()
  const priorDays = new Map<string, Set<string>>()
  for (const r of workouts) {
    if (r.weight_lbs == null) continue
    const est = epley1RM(r.weight_lbs, r.reps)
    const week = weekStartISO(r.date)
    if (week === thisWeekStart) {
      thisWeekBest.set(r.exercise, Math.max(thisWeekBest.get(r.exercise) ?? 0, est))
    } else if (week < thisWeekStart) {
      priorBest.set(r.exercise, Math.max(priorBest.get(r.exercise) ?? 0, est))
      const days = priorDays.get(r.exercise) ?? new Set<string>()
      days.add(r.date)
      priorDays.set(r.exercise, days)
    }
  }

  const prs: { exercise: string; est1RM: number }[] = []
  for (const [key, best] of thisWeekBest) {
    const prior = priorBest.get(key) ?? 0
    const days = priorDays.get(key)?.size ?? 0
    if (prior > 0 && days >= MIN_PR_HISTORY_DAYS && best > prior) {
      prs.push({ exercise: exerciseName(key), est1RM: round1(best) })
    }
  }

  // --- Weight trend: latest this-week entry vs latest entry before this week. ---
  let weightTrend: number | null = null
  let thisWeekLatest: BodyWeightEntry | null = null
  let priorLatest: BodyWeightEntry | null = null
  for (const e of bodyWeights) {
    const week = weekStartISO(e.date)
    if (week === thisWeekStart) {
      if (!thisWeekLatest || e.date > thisWeekLatest.date) thisWeekLatest = e
    } else if (week < thisWeekStart) {
      if (!priorLatest || e.date > priorLatest.date) priorLatest = e
    }
  }
  if (thisWeekLatest && priorLatest) {
    weightTrend = round1(thisWeekLatest.weightLbs - priorLatest.weightLbs)
  }

  return { workoutCount, prs, weightTrend }
}
