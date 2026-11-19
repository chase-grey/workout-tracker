/**
 * Weekly pace, independent of logged progress. Workouts and flex sessions run
 * on a steady ramp: a Monday evening grace period, then a smooth climb to the
 * last intended day's evening deadline. Calorie days can't be banked ahead or
 * caught up, and a day isn't settled until it ends, so their schedule is a
 * staircase that steps at midnight and counts finished days only.
 */

import { weekStartOf } from './dates'
import type { WeekCounts, WeeklyGoalConfig } from './weeklyStreak'

export const DAYS_IN_WEEK = 7

const MS_PER_DAY = 86400000

/**
 * Whole days of the week that have FULLY ENDED at `now`: 0 for all of its first
 * day (Monday, unless another start day is chosen; see lib/dates), 6 for all
 * of its last. The day in progress never counts — it's still yours to spend —
 * which is what keeps the schedule from moving underneath you mid-afternoon.
 */
export function weekDaysCompleted(now: Date = new Date()): number {
  const elapsed = Math.floor((now.getTime() - weekStartOf(now).getTime()) / MS_PER_DAY)
  return Math.min(DAYS_IN_WEEK - 1, Math.max(0, elapsed))
}

/** Local hours for the first day's start and the last intended day's finish. */
export const WEEK_START_HOUR = 18
export const WEEK_DEADLINE_HOUR = 21

/** Expected units at a steady pace; fractional sessions describe the target. */
export function requiredByNow(
  goal: number,
  now: Date = new Date(),
  windowDays: number = DAYS_IN_WEEK,
): number {
  if (goal <= 0) return 0
  const start = weekStartOf(now)
  const end = new Date(start)
  start.setHours(WEEK_START_HOUR)
  end.setDate(end.getDate() + windowDays - 1)
  end.setHours(WEEK_DEADLINE_HOUR)
  const fraction = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())
  return goal * Math.min(1, Math.max(0, fraction))
}

/**
 * Calorie days that had to be banked by `now` for the goal to still be in reach:
 * the goal less every day that can still carry one, today included.
 *
 * A calorie day is settled only when it ends. Until midnight today's plate is
 * still being filled, so today is never owed, and the marker moves at midnight
 * and at no other time. It has been moved early twice before: on a ramp across
 * the clock, then at each day's own 10pm, which called a day missed with two
 * hours of it left. Days can't be banked ahead or caught up either, so the only
 * honest "behind" is that the days left no longer cover what's owed. A goal
 * short of seven keeps its spare days in hand until they are spent: six of seven
 * owes nothing through Tuesday, one on Wednesday, five on Sunday. Seven of
 * seven owes every finished day.
 */
export function calDaysRequiredByNow(goal: number, now: Date = new Date()): number {
  if (goal <= 0) return 0
  const daysLeft = DAYS_IN_WEEK - weekDaysCompleted(now)
  return Math.min(goal, Math.max(0, goal - daysLeft))
}

/** Behind on calorie days: fewer banked than the days left can make up. */
export function calDaysBehind(done: number, goal: number, now: Date = new Date()): boolean {
  return done < calDaysRequiredByNow(goal, now)
}

export type MetricKey = keyof WeekCounts

/**
 * The days of the week each metric is actually done on, counted from its first
 * day. Flex sessions land by the end of the sixth (Saturday in a Monday week) —
 * the last day isn't part of the plan for them, so pacing them over seven days let undone sessions look
 * comfortable on Thursday when fewer intended days were left than it appeared.
 *
 * A goal can still be rescued outside its window; that's what
 * {@link MetricPace.missed} is for. The window is about where you're *supposed*
 * to be, not what's possible.
 */
export const METRIC_WINDOW: Record<MetricKey, number> = {
  workouts: DAYS_IN_WEEK,
  flex: 6,
  calDays: DAYS_IN_WEEK,
  cardio: DAYS_IN_WEEK,
}

/** One metric's standing against both the schedule and the days left. */
export type MetricPace = {
  key: MetricKey
  done: number
  goal: number
  /** Units the schedule expects by now (see {@link requiredByNow}). */
  required: number
  /** Days of this metric's own window (see {@link METRIC_WINDOW}). */
  windowDays: number
  /** Intended days that could still carry a unit, today included. */
  daysLeft: number
  /** Units still owed. */
  remaining: number
  /**
   * Days of the window that could be missed entirely with the goal still met.
   * Zero means every intended day left has to land; negative means the goal has
   * fallen off its plan, which for a short window is not yet the same as lost.
   */
  slack: number
  /** True once the goal can't be reached before the week itself ends. */
  missed: boolean
  met: boolean
}

export type WeekPace = {
  metrics: MetricPace[]
  /**
   * Where the pace marker sits on the overall bar: the mean of the per-metric
   * required fractions, aggregated the same way progress is so the two are
   * directly comparable. At 1 the schedule has nothing left to say and the
   * marker goes away; with calorie days in play it stops short of that all
   * Sunday, since Sunday's own day is never owed before it ends.
   */
  requiredFraction: number
  /**
   * Days of room on the tightest unmet metric — the week's real standing. Falls
   * back to the days left in the week once every goal is met, when they're all
   * spare.
   */
  buffer: number
  /**
   * The metric the buffer was read off. Null once every goal is met, when there's
   * nothing left to be tight about.
   */
  binding: MetricPace | null
}

/** Metric order for display and for breaking buffer ties. */
export const METRIC_KEYS: MetricKey[] = [
  'workouts',
  'flex',
  'calDays',
  'cardio',
]

/**
 * The week's pace: each metric against its schedule, plus the buffer on whichever
 * one has the least room.
 *
 * The buffer is a MINIMUM rather than an average because the week isn't finished
 * until every goal is, so the tightest metric is the one that decides whether
 * it's still on time.
 *
 * A metric whose goal is 0 belongs to a pillar that's switched off (see
 * lib/profile); it isn't paced, and it isn't in `metrics` at all.
 */
export function weekPace(
  counts: WeekCounts,
  goals: WeeklyGoalConfig,
  now: Date = new Date(),
): WeekPace {
  const daysCompleted = weekDaysCompleted(now)
  const daysLeft = DAYS_IN_WEEK - daysCompleted
  const metrics = METRIC_KEYS.filter((key) => (goals[key] ?? 0) > 0).map<MetricPace>((key) => {
    const goal = goals[key] ?? 0
    const done = counts[key] ?? 0
    const remaining = Math.max(0, goal - done)
    const windowDays = METRIC_WINDOW[key]
    const windowLeft = Math.max(0, windowDays - daysCompleted)
    return {
      key,
      done,
      goal,
      required: key === 'calDays' ? calDaysRequiredByNow(goal, now) : requiredByNow(goal, now, windowDays),
      windowDays,
      daysLeft: windowLeft,
      remaining,
      slack: windowLeft - remaining,
      missed: remaining > daysLeft,
      met: remaining === 0,
    }
  })

  const requiredFraction =
    metrics.length === 0
      ? 1
      : metrics.reduce((sum, m) => sum + m.required / m.goal, 0) / metrics.length

  // Only an unmet metric can bind: a met one owes nothing, and its window may
  // have closed, which would otherwise make it look like the tightest of the
  // three. First-listed wins a tie.
  const unmet = metrics.filter((m) => !m.met)
  const binding = unmet.reduce<MetricPace | null>(
    (worst, m) => (worst === null || m.slack < worst.slack ? m : worst),
    null,
  )

  return {
    metrics,
    requiredFraction,
    buffer: binding ? binding.slack : daysLeft,
    binding,
  }
}
