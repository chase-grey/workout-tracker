/**
 * Weekly pace, independent of logged progress. Workouts and flex sessions run
 * on a steady ramp: a Monday evening grace period, then a smooth climb to the
 * last intended day's evening deadline. Calorie days are owed one a day, so
 * their schedule is a staircase: each day's share comes due at that day's
 * 10pm. Remaining-day buffers are separate, since pace and feasibility differ.
 */

import { mondayOf } from './dates'
import type { WeekCounts, WeeklyGoalConfig } from './weeklyStreak'

export const DAYS_IN_WEEK = 7

const MS_PER_DAY = 86400000

/**
 * Whole Mon–Sun days that have FULLY ENDED at `now`: 0 for all of Monday, 6 for
 * all of Sunday. The day in progress never counts — it's still yours to spend —
 * which is what keeps the schedule from moving underneath you mid-afternoon.
 */
export function weekDaysCompleted(now: Date = new Date()): number {
  const elapsed = Math.floor((now.getTime() - mondayOf(now).getTime()) / MS_PER_DAY)
  return Math.min(DAYS_IN_WEEK - 1, Math.max(0, elapsed))
}

/** Local hours for the Monday start and the last intended day's finish. */
export const WEEK_START_HOUR = 18
export const WEEK_DEADLINE_HOUR = 21

/** Expected units at a steady pace; fractional sessions describe the target. */
export function requiredByNow(
  goal: number,
  now: Date = new Date(),
  windowDays: number = DAYS_IN_WEEK,
): number {
  if (goal <= 0) return 0
  const start = mondayOf(now)
  const end = new Date(start)
  start.setHours(WEEK_START_HOUR)
  end.setDate(end.getDate() + windowDays - 1)
  end.setHours(WEEK_DEADLINE_HOUR)
  const fraction = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())
  return goal * Math.min(1, Math.max(0, fraction))
}

/**
 * Local hour at which a calorie day is due. Every day of the week is a calorie
 * day now, so there is nothing to spread across the week: Monday's day is owed
 * Monday night, and the schedule steps up once a night rather than ramping.
 * An hour past the eating window, so a late plate still lands before the bar
 * moves.
 */
export const CAL_DAY_DEADLINE_HOUR = 22

/**
 * Calorie days the schedule expects by `now`: the goal's share for every day of
 * this week whose {@link CAL_DAY_DEADLINE_HOUR} has passed. Zero all day Monday
 * until 10pm, one step per night after that, the whole goal from Sunday 10pm.
 * Fractional when the goal isn't seven, so the staircase still tops out at the
 * goal rather than overshooting it.
 */
export function calDaysRequiredByNow(goal: number, now: Date = new Date()): number {
  if (goal <= 0) return 0
  const due = new Date(mondayOf(now))
  due.setHours(CAL_DAY_DEADLINE_HOUR, 0, 0, 0)
  let days = 0
  while (days < DAYS_IN_WEEK && due.getTime() <= now.getTime()) {
    days++
    due.setDate(due.getDate() + 1)
  }
  return (goal * days) / DAYS_IN_WEEK
}

export type MetricKey = keyof WeekCounts

/**
 * The days of the Mon–Sun week each metric is actually done on, counted from
 * Monday. Flex sessions land by the end of Saturday — Sunday isn't part of the
 * plan for them, so pacing them over seven days let undone sessions look
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
   * directly comparable. Reaches 1 at the week's last deadline — Sunday 10pm,
   * when the final calorie day comes due — where the schedule has nothing left
   * to say and the marker goes away.
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
]

/**
 * The week's pace: each metric against its schedule, plus the buffer on whichever
 * one has the least room.
 *
 * The buffer is a MINIMUM rather than an average because the week isn't finished
 * until every goal is, so the tightest metric is the one that decides whether
 * it's still on time.
 */
export function weekPace(
  counts: WeekCounts,
  goals: WeeklyGoalConfig,
  now: Date = new Date(),
): WeekPace {
  const daysCompleted = weekDaysCompleted(now)
  const daysLeft = DAYS_IN_WEEK - daysCompleted
  const metrics = METRIC_KEYS.map<MetricPace>((key) => {
    const goal = goals[key]
    const done = counts[key]
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
    metrics.reduce((sum, m) => sum + (m.goal > 0 ? m.required / m.goal : 0), 0) / metrics.length

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
