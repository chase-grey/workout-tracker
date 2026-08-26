/** Pure weekly-goal streak engine. */

import { weekStartISO, toISODate, parseISODate, enumerateWeeks } from './dates'
import { HALF_VITAMIN_DAYS, VITAMIN_DAYS_GOAL } from './vitamins'
import { HALF_WHITENING_DAYS, WHITENING_DAYS_GOAL } from './whitening'

export type WeeklyGoalConfig = {
  workouts: number
  flex: number
  calDays: number
  vitaminDays: number
  whiteningDays: number
  halfWorkouts: number
  halfFlex: number
  halfCalDays: number
  halfVitaminDays: number
  halfWhiteningDays: number
}

export const DEFAULT_WEEKLY_GOALS: WeeklyGoalConfig = {
  workouts: 2,
  flex: 3,
  calDays: 6,
  vitaminDays: VITAMIN_DAYS_GOAL,
  whiteningDays: WHITENING_DAYS_GOAL,
  halfWorkouts: 1,
  halfFlex: 2,
  halfCalDays: 5,
  halfVitaminDays: HALF_VITAMIN_DAYS,
  halfWhiteningDays: HALF_WHITENING_DAYS,
}

/**
 * The stretch goal before it went to three a week, and the Monday it went.
 *
 * The streak replays every week that was ever logged against the goals as they
 * stand now, so raising one silently re-judges history: every past week that hit
 * two stretches and called it done would drop out of `full` and take the run with
 * it. That's a streak lost to a decision made after the fact, which is exactly the
 * thing the vitamin and strip gates below exist to prevent — this is the same idea
 * with a fixed date instead of a derived one, because the goal changed on a day
 * rather than starting when a log did.
 *
 * The current week is spared too, the way a newly picked-up habit's is: the goal
 * went up mid-week, and a Monday-to-Sunday week can't be asked for three when
 * some of it is already spent.
 */
export const FLEX_GOAL_3_FROM = '2026-08-31'
const FLEX_GOAL_BEFORE = { flex: 2, halfFlex: 1 } as const

export type WeekTier = 'full' | 'half' | 'under'

export type WeekCounts = {
  workouts: number
  flex: number
  calDays: number
  vitaminDays: number
  whiteningDays: number
}

/**
 * Classify a single week's counts against the goal config.
 *
 * A goal of 0 is a goal not being judged — every count clears it — which is how
 * a week from before a habit was being tracked is left alone (see
 * {@link weeklyStreakHistory}).
 */
export function classifyWeek(
  counts: WeekCounts,
  config: WeeklyGoalConfig = DEFAULT_WEEKLY_GOALS,
): { tier: WeekTier; exceeded: boolean } {
  const isFull =
    counts.workouts >= config.workouts &&
    counts.flex >= config.flex &&
    counts.calDays >= config.calDays &&
    counts.vitaminDays >= config.vitaminDays &&
    counts.whiteningDays >= config.whiteningDays

  if (isFull) {
    const exceeded =
      counts.workouts > config.workouts ||
      counts.flex > config.flex ||
      counts.calDays > config.calDays ||
      counts.vitaminDays > config.vitaminDays ||
      counts.whiteningDays > config.whiteningDays
    return { tier: 'full', exceeded }
  }

  const isHalf =
    counts.workouts >= config.halfWorkouts &&
    counts.flex >= config.halfFlex &&
    counts.calDays >= config.halfCalDays &&
    counts.vitaminDays >= config.halfVitaminDays &&
    counts.whiteningDays >= config.halfWhiteningDays

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
  /**
   * Days that took every pill they owed (see vitamins.vitaminGoalDates).
   * Optional: a caller with no pill log has no vitamin weeks at all, and a week
   * without one isn't judged on them — see {@link weeklyStreakHistory}.
   */
  vitaminDates?: string[]
  /**
   * Days the whitening strip went on (see whitening.whiteningGoalDates).
   * Optional for the same reason as {@link StreakInput.vitaminDates}: a caller
   * with no strip log has no strip weeks, and a week without one isn't judged on
   * them.
   */
  whiteningDates?: string[]
  today?: Date
  config?: WeeklyGoalConfig
}

/** The Monday after `mondayISO`. */
function nextWeekStart(mondayISO: string): string {
  const d = parseISODate(mondayISO)
  d.setDate(d.getDate() + 7)
  return toISODate(d)
}

/**
 * Replay every week in order, oldest first, reporting what each one did to the
 * run. This is the whole streak calculation — `computeWeeklyStreak` is just its
 * last row — so the history a user reads can't disagree with the number on the
 * Today tab.
 */
export function weeklyStreakHistory(input: StreakInput): WeekResult[] {
  const config = input.config ?? DEFAULT_WEEKLY_GOALS
  const today = input.today ?? new Date()

  const workoutByWeek = bucketByWeek(input.workoutDates)
  const flexByWeek = bucketByWeek(input.flexDates)
  const calByWeek = bucketByWeek(input.calorieHitDates)
  const vitaminByWeek = bucketByWeek(input.vitaminDates ?? [])
  const whiteningByWeek = bucketByWeek(input.whiteningDates ?? [])

  const currentWeekStart = weekStartISO(toISODate(today))
  const countsFor = (week: string): WeekCounts => ({
    workouts: workoutByWeek.get(week) ?? 0,
    flex: flexByWeek.get(week) ?? 0,
    calDays: calByWeek.get(week) ?? 0,
    vitaminDays: vitaminByWeek.get(week) ?? 0,
    whiteningDays: whiteningByWeek.get(week) ?? 0,
  })

  // A daily-habit goal starts judging weeks only after the first week it was
  // logged in. Every week before that has no log because nothing was tracking
  // the habit, and judging those would reset the run retroactively for a goal
  // that didn't exist yet; the starting week is spared too, since a habit picked
  // up on a Thursday can't fill a Monday-to-Sunday week. From the Monday after
  // it counts like everything else — see the zero-goal rule in classifyWeek.
  //
  // Each habit is gated on its own first week, not on a shared one: the pills
  // and the strips were picked up months apart, so a single start date would
  // either judge the strips over weeks that predate them or stop judging the
  // pills over weeks they were logged in.
  const judgeFrom = (byWeek: Map<string, number>): string | null => {
    const weeks = [...byWeek.keys()].sort()
    return weeks.length ? nextWeekStart(weeks[0]) : null
  }
  const judgeVitaminsFrom = judgeFrom(vitaminByWeek)
  const judgeWhiteningFrom = judgeFrom(whiteningByWeek)
  const configFor = (week: string): WeeklyGoalConfig => {
    let c = config
    if (judgeVitaminsFrom === null || week < judgeVitaminsFrom)
      c = { ...c, vitaminDays: 0, halfVitaminDays: 0 }
    if (judgeWhiteningFrom === null || week < judgeWhiteningFrom)
      c = { ...c, whiteningDays: 0, halfWhiteningDays: 0 }
    // A week that predates the three-a-week stretch goal is judged at the two it
    // was actually lived under — see FLEX_GOAL_3_FROM. Only when the caller is on
    // the shipped goals: a caller passing its own config is asking for that config
    // over every week, and a test that sets flex explicitly means it.
    if (config === DEFAULT_WEEKLY_GOALS && week < FLEX_GOAL_3_FROM)
      c = { ...c, ...FLEX_GOAL_BEFORE }
    return c
  }

  const allWeeks = [
    ...workoutByWeek.keys(),
    ...flexByWeek.keys(),
    ...calByWeek.keys(),
    ...vitaminByWeek.keys(),
    ...whiteningByWeek.keys(),
  ]
  if (allWeeks.length === 0) return []
  const earliestWeek = allWeeks.reduce((min, w) => (w < min ? w : min), allWeeks[0])

  // The week in progress joins the replay the moment it goes full, so the streak
  // — and the freeze for one-upping the goals — lands the day it's earned rather
  // than waiting for Monday. Short of full it stays out: a week still being
  // lived can't spend a freeze or end the run.
  const currentIsFull =
    classifyWeek(countsFor(currentWeekStart), configFor(currentWeekStart)).tier === 'full'

  const weeks = enumerateWeeks(earliestWeek, currentWeekStart).filter(
    (w) => w < currentWeekStart || currentIsFull,
  )

  const out: WeekResult[] = []
  let streak = 0
  let freezes = 0

  for (const week of weeks) {
    const counts = countsFor(week)
    const goals = configFor(week)
    const { tier, exceeded } = classifyWeek(counts, goals)

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
