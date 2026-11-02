/** Pure weekly-goal streak engine. */

import { weekStartISO, toISODate, enumerateWeeks } from './dates'

export type WeeklyGoalConfig = {
  workouts: number
  flex: number
  calDays: number
}

/**
 * The weekly goals, and the Monday each set took effect, oldest first. A week
 * is judged against the set in force that Monday, so raising a goal holds the
 * weeks ahead to it without re-scoring — and resetting — the run already built.
 */
export const WEEKLY_GOAL_HISTORY: readonly { from: string; goals: WeeklyGoalConfig }[] = [
  {
    from: '0000-01-01',
    goals: { workouts: 2, flex: 2, calDays: 6 },
  },
  {
    // Every day of the week on calories, now that the target is a real surplus.
    from: '2026-10-26',
    goals: { workouts: 2, flex: 2, calDays: 7 },
  },
]

/** This week's goals — the newest set in {@link WEEKLY_GOAL_HISTORY}. */
export const DEFAULT_WEEKLY_GOALS: WeeklyGoalConfig =
  WEEKLY_GOAL_HISTORY[WEEKLY_GOAL_HISTORY.length - 1].goals

/** The goals in force for the week starting on Monday `week`. */
export function weeklyGoalsFor(week: string): WeeklyGoalConfig {
  let goals = WEEKLY_GOAL_HISTORY[0].goals
  for (const g of WEEKLY_GOAL_HISTORY) if (g.from <= week) goals = g.goals
  return goals
}

export type WeekTier = 'full' | 'short'

export type WeekCounts = {
  workouts: number
  flex: number
  calDays: number
}

/**
 * Judge a single week's counts against the goal config.
 *
 * A week is `full` only when every goal is met; `exceeded` when it is full and
 * over on something, which is what earns a freeze. Any other week is `short`,
 * and `cost` is what keeping the streak through it takes: one freeze for each
 * day it fell short, summed over the three goals, less one for each day it went
 * over on another goal — a third stretch pays for a missed workout. The cost
 * never drops below one, though: covering every miss with surplus is not the
 * same as hitting the goals, and only that advances the run. A full week costs
 * nothing.
 *
 * A goal of 0 is a goal not being judged — every count clears it — which is how
 * a week from before a habit was being tracked is left alone.
 */
export function classifyWeek(
  counts: WeekCounts,
  config: WeeklyGoalConfig = DEFAULT_WEEKLY_GOALS,
): { tier: WeekTier; exceeded: boolean; cost: number } {
  const over = (have: number, want: number) => Math.max(0, have - want)
  const under = (have: number, want: number) => Math.max(0, want - have)

  const shortfall =
    under(counts.workouts, config.workouts) +
    under(counts.flex, config.flex) +
    under(counts.calDays, config.calDays)
  const surplus =
    over(counts.workouts, config.workouts) +
    over(counts.flex, config.flex) +
    over(counts.calDays, config.calDays)

  if (shortfall === 0) return { tier: 'full', exceeded: surplus > 0, cost: 0 }
  return { tier: 'short', exceeded: false, cost: Math.max(1, shortfall - surplus) }
}

export type WeeklyStreak = { streak: number; freezes: number }

/** What a week did to the running streak. */
export type WeekOutcome = 'advanced' | 'froze' | 'reset'

/** One completed week, with the counts behind it and its effect on the run. */
export type WeekResult = {
  /** Monday of the week, ISO. */
  week: string
  counts: WeekCounts
  /**
   * The goals this week was actually judged against, which is not always the
   * config as a whole: a goal the week predates is zeroed out for it (see
   * {@link weeklyStreakHistory}). Carried on the row so a history a user reads
   * can report each week against the bar it was held to.
   */
  goals: WeeklyGoalConfig
  tier: WeekTier
  exceeded: boolean
  outcome: WeekOutcome
  freezesSpent: number
  streakAfter: number
  freezesAfter: number
  /** True for the week still being lived — only ever a week that already hit full. */
  inProgress: boolean
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
 * Replay every week in order, oldest first, reporting what each one did to the
 * run. This is the whole streak calculation — `computeWeeklyStreak` is just its
 * last row — so the history a user reads can't disagree with the number on the
 * Today tab.
 */
export function weeklyStreakHistory(input: StreakInput): WeekResult[] {
  const goalsFor = (week: string) => input.config ?? weeklyGoalsFor(week)
  const today = input.today ?? new Date()

  const workoutByWeek = bucketByWeek(input.workoutDates)
  const flexByWeek = bucketByWeek(input.flexDates)
  const calByWeek = bucketByWeek(input.calorieHitDates)

  const currentWeekStart = weekStartISO(toISODate(today))
  const countsFor = (week: string): WeekCounts => ({
    workouts: workoutByWeek.get(week) ?? 0,
    flex: flexByWeek.get(week) ?? 0,
    calDays: calByWeek.get(week) ?? 0,
  })

  const allWeeks = [
    ...workoutByWeek.keys(),
    ...flexByWeek.keys(),
    ...calByWeek.keys(),
  ]
  if (allWeeks.length === 0) return []
  const earliestWeek = allWeeks.reduce((min, w) => (w < min ? w : min), allWeeks[0])

  // The week in progress joins the replay the moment it goes full, so the streak
  // — and the freeze for one-upping the goals — lands the day it's earned rather
  // than waiting for Monday. Short of full it stays out: a week still being
  // lived can't spend a freeze or end the run.
  const currentIsFull =
    classifyWeek(countsFor(currentWeekStart), goalsFor(currentWeekStart)).tier === 'full'

  const weeks = enumerateWeeks(earliestWeek, currentWeekStart).filter(
    (w) => w < currentWeekStart || currentIsFull,
  )

  const out: WeekResult[] = []
  let streak = 0
  let freezes = 0

  for (const week of weeks) {
    const counts = countsFor(week)
    const goals = goalsFor(week)
    const { tier, exceeded, cost } = classifyWeek(counts, goals)

    let outcome: WeekOutcome
    let freezesSpent = 0

    if (tier === 'full') {
      streak += 1
      if (exceeded) freezes += 1
      outcome = 'advanced'
    } else {
      // A short week costs a freeze per day it was short, net of any surplus
      // (see classifyWeek). Short the bank and the run ends.
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
      goals,
      tier,
      exceeded,
      outcome,
      freezesSpent,
      streakAfter: streak,
      freezesAfter: freezes,
      inProgress: week === currentWeekStart,
    })
  }

  return out
}

/**
 * Split a history into the weeks behind the current streak and the ones before
 * it. The run is everything after the last week that broke a streak — those
 * weeks, and only those, are the ones the number on the Today tab is counting;
 * a frozen week is in the run because it kept the run alive. Anything at or
 * before the last reset says nothing about the current number, so callers can
 * fold it away.
 */
export function splitAtCurrentRun(history: WeekResult[]): {
  earlier: WeekResult[]
  run: WeekResult[]
} {
  const lastReset = history.findLastIndex((w) => w.outcome === 'reset')
  return { earlier: history.slice(0, lastReset + 1), run: history.slice(lastReset + 1) }
}

/** Compute the current weekly streak (and banked freezes) from date lists. */
export function computeWeeklyStreak(input: StreakInput): WeeklyStreak {
  const history = weeklyStreakHistory(input)
  const last = history[history.length - 1]
  return last
    ? { streak: last.streakAfter, freezes: last.freezesAfter }
    : { streak: 0, freezes: 0 }
}
