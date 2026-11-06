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
  prs: { exercise: string; est1RM: number; weightLbs: number; reps: number }[]
  /**
   * Change in body weight (lbs) — the mean of this week's weigh-ins vs the mean
   * of the last week before it that had any, the same comparison each completed
   * week gets in {@link weeklyWeightChanges}. `null` if not computable.
   */
  weightTrend: number | null
  /**
   * Mean of this week's weigh-ins (lbs), the same figure each completed week
   * is listed by in {@link weeklyWeightChanges}. `null` with no weigh-in yet.
   */
  weightAverage: number | null
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * Every completed week that has weigh-ins, newest first, with the change in its
 * average weigh-in from the average of the last week before it that had any. A
 * week with no weigh-ins is skipped rather than shown as zero, and the first
 * week on record has nothing to compare against, so it doesn't appear.
 */
export function weeklyWeightChanges(bodyWeights: BodyWeightEntry[], today: Date = new Date()) {
  const currentWeek = weekStartISO(toISODate(today))
  const byWeek = new Map<string, { sum: number; count: number }>()
  for (const entry of bodyWeights) {
    const week = weekStartISO(entry.date)
    if (week >= currentWeek) continue
    const acc = byWeek.get(week) ?? { sum: 0, count: 0 }
    acc.sum += entry.weightLbs
    acc.count += 1
    byWeek.set(week, acc)
  }
  const changes: { week: string; averageLbs: number; changeLbs: number }[] = []
  let previousAverage: number | undefined
  for (const [week, { sum, count }] of [...byWeek].sort(([a], [b]) => a.localeCompare(b))) {
    const average = sum / count
    if (previousAverage !== undefined) {
      changes.push({ week, averageLbs: round1(average), changeLbs: round1(average - previousAverage) })
    }
    previousAverage = average
  }
  return changes.reverse()
}

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
  const thisWeekBest = new Map<string, { est1RM: number; weightLbs: number; reps: number }>()
  const priorBest = new Map<string, number>()
  const priorDays = new Map<string, Set<string>>()
  for (const r of workouts) {
    if (r.weight_lbs == null) continue
    const est = epley1RM(r.weight_lbs, r.reps)
    const week = weekStartISO(r.date)
    if (week === thisWeekStart) {
      if (est > (thisWeekBest.get(r.exercise)?.est1RM ?? 0)) {
        thisWeekBest.set(r.exercise, { est1RM: est, weightLbs: r.weight_lbs, reps: r.reps })
      }
    } else if (week < thisWeekStart) {
      priorBest.set(r.exercise, Math.max(priorBest.get(r.exercise) ?? 0, est))
      const days = priorDays.get(r.exercise) ?? new Set<string>()
      days.add(r.date)
      priorDays.set(r.exercise, days)
    }
  }

  const prs: WeeklySummary['prs'] = []
  for (const [key, best] of thisWeekBest) {
    const prior = priorBest.get(key) ?? 0
    const days = priorDays.get(key)?.size ?? 0
    if (prior > 0 && days >= MIN_PR_HISTORY_DAYS && best.est1RM > prior) {
      prs.push({ exercise: exerciseName(key), ...best, est1RM: round1(best.est1RM) })
    }
  }

  // --- Weight trend: this week's average vs the last prior week's average. ---
  // A single weigh-in swings a pound or two with water and the hour of day, so
  // "down 2.3 this week" off one morning against one older morning disagreed
  // with the week averages shown right beside it. Compare mean to mean, as the
  // history list does, skipping any prior week with no weigh-ins.
  let thisWeekSum = 0
  let thisWeekCount = 0
  let priorWeek: string | null = null
  let priorSum = 0
  let priorCount = 0
  for (const e of bodyWeights) {
    const week = weekStartISO(e.date)
    if (week === thisWeekStart) {
      thisWeekSum += e.weightLbs
      thisWeekCount += 1
    } else if (week < thisWeekStart) {
      if (priorWeek === null || week > priorWeek) {
        priorWeek = week
        priorSum = 0
        priorCount = 0
      }
      if (week === priorWeek) {
        priorSum += e.weightLbs
        priorCount += 1
      }
    }
  }
  const weightAverage = thisWeekCount > 0 ? round1(thisWeekSum / thisWeekCount) : null
  const weightTrend =
    thisWeekCount > 0 && priorCount > 0 ? round1(thisWeekSum / thisWeekCount - priorSum / priorCount) : null

  return { workoutCount, prs, weightTrend, weightAverage }
}
