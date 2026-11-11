/** Pure weekly-goal streak engine. */

import { weekStartISO, toISODate, enumerateWeeks } from './dates'
import { profileWeeklyGoals } from './profile'
import { activeProfile } from './profileStore'

export type WeeklyGoalConfig = {
  workouts: number
  flex: number
  calDays: number
  /** Days with any cardio logged. Absent on a config from before cardio, which reads as 0: not judged. */
  cardio?: number
}

/**
 * The weekly goals, and the Monday each set took effect, oldest first. A week
 * is judged against the set in force that Monday, so raising a goal holds the
 * weeks ahead to it without re-scoring — and resetting — the run already built.
 */
export const WEEKLY_GOAL_HISTORY: readonly { from: string; goals: WeeklyGoalConfig }[] = [
  {
    // Six calorie days of seven. The week of 2026-10-26 briefly asked for all
    // seven alongside the 4,500 target; that was withdrawn and the weeks it
    // covered are judged at six like every other, so it has no entry here.
    from: '0000-01-01',
    goals: { workouts: 2, flex: 2, calDays: 6 },
  },
]

/** This week's goals — the newest set in {@link WEEKLY_GOAL_HISTORY}. */
export const DEFAULT_WEEKLY_GOALS: WeeklyGoalConfig =
  WEEKLY_GOAL_HISTORY[WEEKLY_GOAL_HISTORY.length - 1].goals

/**
 * The goals in force for the week starting on Monday `week`: the profile's own
 * where this device has one (see lib/profile), the shipped history otherwise.
 */
export function weeklyGoalsFor(week: string): WeeklyGoalConfig {
  const profile = activeProfile()
  if (profile) return profileWeeklyGoals(profile, week)
  let goals = WEEKLY_GOAL_HISTORY[0].goals
  for (const g of WEEKLY_GOAL_HISTORY) if (g.from <= week) goals = g.goals
  return goals
}

export type WeekTier = 'full' | 'short'

/** The goals this week is being held to. */
export function currentWeeklyGoals(today: Date = new Date()): WeeklyGoalConfig {
  return weeklyGoalsFor(weekStartISO(toISODate(today)))
}

export type WeekCounts = {
  workouts: number
  flex: number
  calDays: number
  cardio?: number
}

/**
 * Judge a single week's counts against the goal config.
 *
 * A week is `full` only when every goal is met, and a full week `earned` one
 * freeze for every day it went over, summed across the three goals: four
 * workouts against two, three stretches against two and seven calorie days
 * against six bank four. `exceeded` is just `earned > 0`. Any other week is
 * `short`, and `cost` is what keeping the streak through it takes: one freeze
 * for each day it fell short, summed over the three goals, less one for each
 * day it went over on another goal — a third stretch pays for a missed workout.
 * The cost never drops below one, though: covering every miss with surplus is
 * not the same as hitting the goals, and only that advances the run. A short
 * week earns nothing; its surplus is spent on its own shortfall. A full week
 * costs nothing.
 *
 * A goal of 0 is a goal not being judged — every count clears it, and no count
 * is over it — which is how a week from before a habit was being tracked is
 * left alone without minting a freeze for every day of it.
 */
export function classifyWeek(
  counts: WeekCounts,
  config: WeeklyGoalConfig = DEFAULT_WEEKLY_GOALS,
): { tier: WeekTier; exceeded: boolean; earned: number; cost: number } {
  const over = (have: number, want: number) => (want === 0 ? 0 : Math.max(0, have - want))
  const under = (have: number, want: number) => Math.max(0, want - have)

  const shortfall =
    under(counts.workouts, config.workouts) +
    under(counts.flex, config.flex) +
    under(counts.calDays, config.calDays) +
    under(counts.cardio ?? 0, config.cardio ?? 0)
  const surplus =
    over(counts.workouts, config.workouts) +
    over(counts.flex, config.flex) +
    over(counts.calDays, config.calDays) +
    over(counts.cardio ?? 0, config.cardio ?? 0)

  if (shortfall === 0) return { tier: 'full', exceeded: surplus > 0, earned: surplus, cost: 0 }
  return { tier: 'short', exceeded: false, earned: 0, cost: Math.max(1, shortfall - surplus) }
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
  /** Freezes this week banked: one per day over a goal, once every goal was met. */
  freezesEarned: number
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
  cardioDates?: string[]
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
  const cardioByWeek = bucketByWeek(input.cardioDates ?? [])

  const currentWeekStart = weekStartISO(toISODate(today))
  const countsFor = (week: string): WeekCounts => ({
    workouts: workoutByWeek.get(week) ?? 0,
    flex: flexByWeek.get(week) ?? 0,
    calDays: calByWeek.get(week) ?? 0,
    cardio: cardioByWeek.get(week) ?? 0,
  })

  const allWeeks = [
    ...workoutByWeek.keys(),
    ...flexByWeek.keys(),
    ...calByWeek.keys(),
    ...cardioByWeek.keys(),
  ]
  if (allWeeks.length === 0) return []
  const earliestWeek = allWeeks.reduce((min, w) => (w < min ? w : min), allWeeks[0])

  // The week in progress joins the replay the moment it goes full, so the streak
  // — and the freezes for one-upping the goals — land the day they're earned rather
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
    const { tier, exceeded, earned, cost } = classifyWeek(counts, goals)

    let outcome: WeekOutcome
    let freezesSpent = 0

    if (tier === 'full') {
      streak += 1
      freezes += earned
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
      freezesEarned: earned,
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
