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

export type WeekCounts = { workouts: number; flex: number; calDays: number }

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

/** What a week did to the running streak. */
export type WeekOutcome = 'advanced' | 'froze' | 'reset'

/** One completed week, with the counts behind it and its effect on the run. */
export type WeekResult = {
  /** Monday of the week, ISO. */
  week: string
  counts: WeekCounts
  tier: WeekTier
  exceeded: boolean
  outcome: WeekOutcome
  freezesSpent: number
  streakAfter: number
  freezesAfter: number
}

/**
 * Count the distinct dates in each Mon–Sun week, keyed by that week's Monday.
 * Distinct, so two workouts (or two stretches) in a day count as one day toward
 * the week's goal.
 */
function bucketByWeek(dates: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of new Set(dates)) {
    const wk = weekStartISO(d)
    map.set(wk, (map.get(wk) ?? 0) + 1)
  }
  return map
}

export type StreakInput = {
  workoutDates: string[]
  flexDates: string[]
  calorieHitDates: string[]
  today?: Date
  config?: WeeklyGoalConfig
}

/**
 * Replay every completed week in order, oldest first, reporting what each one
 * did to the run. This is the whole streak calculation — `computeWeeklyStreak`
 * is just its last row — so the history a user reads can't disagree with the
 * number on the Today tab.
 */
export function weeklyStreakHistory(input: StreakInput): WeekResult[] {
  const config = input.config ?? DEFAULT_WEEKLY_GOALS
  const today = input.today ?? new Date()

  const workoutByWeek = bucketByWeek(input.workoutDates)
  const flexByWeek = bucketByWeek(input.flexDates)
  const calByWeek = bucketByWeek(input.calorieHitDates)

  // The current in-progress week is excluded: only weeks strictly before it count.
  const currentWeekStart = weekStartISO(toISODate(today))

  const allWeeks = [
    ...workoutByWeek.keys(),
    ...flexByWeek.keys(),
    ...calByWeek.keys(),
  ]
  if (allWeeks.length === 0) return []
  const earliestWeek = allWeeks.reduce((min, w) => (w < min ? w : min), allWeeks[0])

  const completedWeeks = enumerateWeeks(earliestWeek, currentWeekStart).filter(
    (w) => w < currentWeekStart,
  )

  const out: WeekResult[] = []
  let streak = 0
  let freezes = 0

  for (const week of completedWeeks) {
    const counts: WeekCounts = {
      workouts: workoutByWeek.get(week) ?? 0,
      flex: flexByWeek.get(week) ?? 0,
      calDays: calByWeek.get(week) ?? 0,
    }
    const { tier, exceeded } = classifyWeek(counts, config)

    let outcome: WeekOutcome
    let freezesSpent = 0

    if (tier === 'full') {
      streak += 1
      if (exceeded) freezes += 1
      outcome = 'advanced'
    } else {
      // A half week costs one banked freeze, a washed-out week two. Short the
      // bank and the run ends.
      const cost = tier === 'half' ? 1 : 2
      if (freezes >= cost) {
        freezes -= cost
        freezesSpent = cost
        outcome = 'froze'
      } else {
        streak = 0
        outcome = 'reset'
      }
    }

    out.push({
      week,
      counts,
      tier,
      exceeded,
      outcome,
      freezesSpent,
      streakAfter: streak,
      freezesAfter: freezes,
    })
  }

  return out
}

/** Compute the current weekly streak (and banked freezes) from date lists. */
export function computeWeeklyStreak(input: StreakInput): WeeklyStreak {
  const history = weeklyStreakHistory(input)
  const last = history[history.length - 1]
  return last
    ? { streak: last.streakAfter, freezes: last.freezesAfter }
    : { streak: 0, freezes: 0 }
}
