/**
 * Where the week's goals are supposed to stand right now, and how much room is
 * left to still reach them.
 *
 * The week bar used to compare progress against elapsed time — a straight ramp
 * from Monday 00:00 to Sunday 24:00. Two things were wrong with that:
 *
 *  - It asked for fractions of things you can't do fractionally. A quarter of the
 *    way through the week it wanted half a workout, so Monday afternoon already
 *    read "behind" before the day it was judging had ended.
 *  - It said nothing about whether the week is still finishable. Every metric here
 *    counts DISTINCT DATES, so none of them can advance more than once a day: six
 *    calorie days with two days left is not "ahead", it's out of room, no matter
 *    how full the bar looks.
 *
 * So pace is answered twice, in two different currencies:
 *
 *  - {@link requiredByNow} — the schedule. Each metric's goal spread across the
 *    seven days and floored to whole units, stepping only when a day has fully
 *    ended. Never asks for a fraction, never moves during the day you're still in.
 *  - {@link MetricPace.slack} — the room. Days that could still be missed with the
 *    goal met anyway. The week's real standing is the tightest of these, because a
 *    maxed-out metric averages away a binding one.
 *
 * Pure module — no React/DOM, no storage.
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

/**
 * How many of a metric's `goal` units the week's schedule expects to be banked
 * once `daysCompleted` days have ended: the goal spread evenly across the seven
 * days, floored.
 *
 * Flooring is the whole point. It reads as "count the units whose last possible
 * day has passed" — with a goal of 2 that's one by the end of Thursday and the
 * other by the end of Sunday, and with a goal of 6 it's one more each day from
 * Tuesday on. Since `daysCompleted` never reaches 7, the result is always below
 * the goal: the schedule can't demand the week be finished before it's over.
 */
export function requiredByNow(goal: number, daysCompleted: number): number {
  if (goal <= 0) return 0
  return Math.floor((daysCompleted * goal) / DAYS_IN_WEEK)
}

export type MetricKey = keyof WeekCounts

/** One metric's standing against both the schedule and the days left. */
export type MetricPace = {
  key: MetricKey
  done: number
  goal: number
  /** Units the schedule expects by now (see {@link requiredByNow}). */
  required: number
  /** Days that could still carry a unit, today included. */
  daysLeft: number
  /** Units still owed. */
  remaining: number
  /**
   * Days that could be missed entirely with the goal still met. Zero means every
   * remaining day has to land; negative means the goal is already out of reach.
   */
  slack: number
  met: boolean
}

export type WeekPace = {
  metrics: MetricPace[]
  /**
   * Where the pace marker sits on the overall bar: the mean of the per-metric
   * required fractions, aggregated the same way progress is so the two are
   * directly comparable.
   */
  requiredFraction: number
  /** Days of room on the tightest metric — the week's real standing. */
  buffer: number
  /**
   * The metric the buffer was read off. Null once every goal is met, when there's
   * nothing left to be tight about.
   */
  binding: MetricPace | null
}

/** Metric order for display and for breaking buffer ties. */
export const METRIC_KEYS: MetricKey[] = ['workouts', 'flex', 'calDays']

/**
 * The week's pace: each metric against its schedule, plus the buffer on whichever
 * one has the least room.
 *
 * The buffer is a MINIMUM rather than an average because the week isn't finished
 * until all three goals are, so the tightest metric is the one that decides
 * whether it's still on time. A metric already met has nothing owed and so holds
 * the full `daysLeft` — it can never be the one binding.
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
    return {
      key,
      done,
      goal,
      required: requiredByNow(goal, daysCompleted),
      daysLeft,
      remaining,
      slack: daysLeft - remaining,
      met: remaining === 0,
    }
  })

  const requiredFraction =
    metrics.reduce((sum, m) => sum + (m.goal > 0 ? m.required / m.goal : 0), 0) / metrics.length

  // First-listed wins a tie, which only happens between metrics owing the same
  // number of units — they all share one `daysLeft`.
  const binding = metrics.reduce((worst, m) => (m.slack < worst.slack ? m : worst), metrics[0])

  return {
    metrics,
    requiredFraction,
    buffer: binding.slack,
    binding: binding.met ? null : binding,
  }
}
