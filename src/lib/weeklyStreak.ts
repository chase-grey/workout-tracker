/** Pure weekly-goal streak engine. */

import { weekStartISO, toISODate, enumerateWeeks } from './dates'

export type WeeklyGoalConfig = {
  workouts: number
  flex: number
  calDays: number
  halfWorkouts: number
  halfFlex: number
  halfCalDays: number
}

export const DEFAULT_WEEKLY_GOALS: WeeklyGoalConfig = {
  workouts: 2,
  flex: 2,
  calDays: 6,
  halfWorkouts: 1,
  halfFlex: 1,
  halfCalDays: 5,
}

export type WeekTier = 'full' | 'half' | 'under'

type WeekCounts = { workouts: number; flex: number; calDays: number }

/** Classify a single week's counts against the goal config. */
export function classifyWeek(
  counts: WeekCounts,
  config: WeeklyGoalConfig = DEFAULT_WEEKLY_GOALS,
): { tier: WeekTier; exceeded: boolean } {
  const isFull =
    counts.workouts >= config.workouts &&
    counts.flex >= config.flex &&
    counts.calDays >= config.calDays

  if (isFull) {
    const exceeded =
      counts.workouts > config.workouts ||
      counts.flex > config.flex ||
      counts.calDays > config.calDays
    return { tier: 'full', exceeded }
  }

  const isHalf =
    counts.workouts >= config.halfWorkouts &&
    counts.flex >= config.halfFlex &&
    counts.calDays >= config.halfCalDays

  if (isHalf) {
    return { tier: 'half', exceeded: false }
  }

  return { tier: 'under', exceeded: false }
}

export type WeeklyStreak = { streak: number; freezes: number }

/** Increment a per-week count map keyed by the Monday of each date's week. */
function bucketByWeek(dates: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of dates) {
    const wk = weekStartISO(d)
    map.set(wk, (map.get(wk) ?? 0) + 1)
  }
  return map
}

/** Compute the current weekly streak (and banked freezes) from date lists. */
export function computeWeeklyStreak(input: {
  workoutDates: string[]
  flexDates: string[]
  calorieHitDates: string[]
  today?: Date
  config?: WeeklyGoalConfig
}): WeeklyStreak {
  const config = input.config ?? DEFAULT_WEEKLY_GOALS
  const today = input.today ?? new Date()

  const workoutByWeek = bucketByWeek(input.workoutDates)
  const flexByWeek = bucketByWeek(input.flexDates)
  const calByWeek = bucketByWeek(input.calorieHitDates)

  // The current in-progress week is excluded: only weeks strictly before it count.
  const currentWeekStart = weekStartISO(toISODate(today))

  // Earliest week appearing in any list.
  const allWeeks = [
    ...workoutByWeek.keys(),
    ...flexByWeek.keys(),
    ...calByWeek.keys(),
  ]
  if (allWeeks.length === 0) {
    return { streak: 0, freezes: 0 }
  }
  const earliestWeek = allWeeks.reduce((min, w) => (w < min ? w : min), allWeeks[0])

  // Last completed week is the week immediately before the current in-progress week.
  const completedWeeks = enumerateWeeks(earliestWeek, currentWeekStart).filter(
    (w) => w < currentWeekStart,
  )
  if (completedWeeks.length === 0) {
    return { streak: 0, freezes: 0 }
  }

  let streak = 0
  let freezes = 0

  for (const week of completedWeeks) {
    const counts: WeekCounts = {
      workouts: workoutByWeek.get(week) ?? 0,
      flex: flexByWeek.get(week) ?? 0,
      calDays: calByWeek.get(week) ?? 0,
    }
    const { tier, exceeded } = classifyWeek(counts, config)

    if (tier === 'full') {
      streak += 1
      if (exceeded) freezes += 1
    } else if (tier === 'half') {
      if (freezes >= 1) {
        freezes -= 1
      } else {
        streak = 0
      }
    } else {
      // under
      if (freezes >= 2) {
        freezes -= 2
      } else {
        streak = 0
      }
    }
  }

  return { streak, freezes }
}
