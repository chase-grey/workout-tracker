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
 *    days it's actually done on and floored to whole units, stepping only when a
 *    day has come due. Never asks for a fraction, never moves during the day
 *    you're still in.
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

/** Hour on Sunday the week's goals are meant to be finished by. */
export const WEEK_DEADLINE_HOUR = 21

/**
 * Days of the week whose share of a goal has COME DUE at `now`: 0..7.
 *
 * The same count as {@link weekDaysCompleted} except at the end, where Sunday
 * comes due at {@link WEEK_DEADLINE_HOUR} rather than at midnight. Counting only
 * ended days meant a full-week goal was never entirely due inside the week, so
 * the schedule marker stopped short of the end no matter how the week went; the
 * deadline is 9pm Sunday, so that's where the schedule finishes.
 *
 * The three hours after it are not part of the schedule but are still yours to
 * log in — nothing here says a goal is lost (see {@link MetricPace.missed}).
 */
export function weekDaysDue(now: Date = new Date()): number {
  const completed = weekDaysCompleted(now)
  const onSunday = completed === DAYS_IN_WEEK - 1
  return onSunday && now.getHours() >= WEEK_DEADLINE_HOUR ? DAYS_IN_WEEK : completed
}

/**
 * How many of a metric's `goal` units the schedule expects to be banked once
 * `daysCompleted` days have ended: the goal spread evenly across its
 * `windowDays`, floored.
 *
 * Flooring is the whole point. It reads as "count the units whose last intended
 * day has passed" — over a full week a goal of 2 wants one by the end of Thursday
 * and the other by Sunday's deadline, while a goal of 6 wants one more each day
 * from Tuesday on. Once `daysCompleted` reaches `windowDays` the whole goal is
 * due, which for a full-week metric is 9pm Sunday and for a shorter window is the
 * end of the window's last day.
 */
export function requiredByNow(
  goal: number,
  daysCompleted: number,
  windowDays: number = DAYS_IN_WEEK,
): number {
  if (goal <= 0) return 0
  return Math.floor((Math.min(daysCompleted, windowDays) * goal) / windowDays)
}

export type MetricKey = keyof WeekCounts

/**
 * The days of the Mon–Sun week each metric is actually done on, counted from
 * Monday. Flex sessions land by the end of Saturday — Sunday isn't part of the
 * plan for them, so pacing them over seven days let undone sessions look
 * comfortable on Thursday when fewer intended days were left than it appeared.
 *
 * Six, not the five it was. Five was sized for two sessions a week and had room
 * to spare; three sessions in five days leaves none at all, and a window with no
 * slack in it reports being behind as the normal state, which is the fastest way
 * to make a pacer worth ignoring. Six keeps Sunday out — the point of the window
 * — and gives the third session somewhere to go.
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
   * directly comparable. Reaches 1 at the week's deadline, where the schedule has
   * nothing left to say and the marker goes away.
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
  // The schedule runs to 9pm Sunday; the room runs to midnight. Past the deadline
  // the whole goal is due and the marker is done, but the day is not, so `daysLeft`
  // and everything read off it stay on ended days.
  const daysDue = weekDaysDue(now)

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
      required: requiredByNow(goal, daysDue, windowDays),
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
