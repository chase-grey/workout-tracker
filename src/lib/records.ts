/**
 * All-time "personal record" detection for the celebration system.
 *
 * These are the milestones that only come around once you beat your own past
 * best: the most workouts (or Push / Pull / Core sessions, or stretches) you've
 * ever fit into one week, the longest run of days hitting your calorie goal, and
 * your biggest single day and single week of eating during the bulk.
 *
 * Like `detectPRs`, detection is a before → after diff: we compare the data as
 * it was before an action to the data after it, and only cheer the *crossing* —
 * the moment the current period first pulls ahead of every prior period. That
 * makes each record fire exactly once (a running calorie total that keeps
 * climbing past the old best won't re-fire on every tap), and it never counts
 * your very first week/day of data as a "record" (there's no prior best to beat).
 *
 * Pure module — no React/DOM — so it stays unit-testable.
 */

import type { DayType, WorkoutRow } from '../types'
import type { Celebration } from './celebration'
import { CALORIE_GOAL, calorieHitDates, dayTotals, type CalorieEntry } from './calories'
import { parseISODate, toISODate, weekStartISO } from './dates'
import { trainingSessions } from './session'
import { DAY_TYPES } from '../config/plan'

/** The data an action might have changed, snapshotted before and after. */
export type RecordSnapshot = {
  workouts: WorkoutRow[]
  flexDates: string[]
  calorieEntries: CalorieEntry[]
}

const DAY_TYPE_NAME: Record<DayType, string> = { push: 'push', pull: 'pull', fullbody: 'full body' }

const MS_PER_DAY = 86_400_000

/** Calorie-streak milestones worth a cheer even when they don't break the record. */
const STREAK_MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365]

/** Shortest calorie streak worth celebrating as a new record. */
const MIN_STREAK_RECORD = 3

// ---------------------------------------------------------------------------
// Period-record primitives.
// ---------------------------------------------------------------------------

/** The current period's value vs. the best of every *other* period. */
type PeriodValue = { current: number; priorBest: number }

/** Split a per-period map into the current period's value and the best other. */
function periodValue(byPeriod: Map<string, number>, currentKey: string): PeriodValue {
  let current = 0
  let priorBest = 0
  for (const [key, value] of byPeriod) {
    if (key === currentKey) current = value
    else if (value > priorBest) priorBest = value
  }
  return { current, priorBest }
}

/**
 * True when the current period just pulled ahead of every prior period: it now
 * leads (`after`) but did not before (`before`). Requires a real prior best (>0)
 * so the first period of data is never counted as a record.
 */
function crossedRecord(before: PeriodValue, after: PeriodValue): boolean {
  return after.priorBest > 0 && after.current > after.priorBest && before.current <= before.priorBest
}

/**
 * Distinct days trained per Mon–Sun week, keeping only day types `keep` allows.
 * Two sessions on one day count once, matching the weekly goal. Supplemental
 * core-only sessions (the core block done with a stretch) are already excluded by
 * trainingSessions.
 */
function sessionsByWeek(workouts: WorkoutRow[], keep: (d: DayType) => boolean): Map<string, number> {
  return datesByWeek(trainingSessions(workouts).filter((s) => keep(s.dayType)).map((s) => s.date))
}

/** Distinct dates per Mon–Sun week. */
function datesByWeek(dates: string[]): Map<string, number> {
  const byWeek = new Map<string, number>()
  for (const d of new Set(dates)) {
    const wk = weekStartISO(d)
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1)
  }
  return byWeek
}

/** Total calories per Mon–Sun week. */
function caloriesByWeek(entries: CalorieEntry[]): Map<string, number> {
  const byWeek = new Map<string, number>()
  for (const [date, total] of dayTotals(entries)) {
    const wk = weekStartISO(date)
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + total)
  }
  return byWeek
}

// ---------------------------------------------------------------------------
// Calorie streaks.
// ---------------------------------------------------------------------------

/** Longest run of consecutive calendar days that hit the calorie goal. */
export function longestCalorieStreak(entries: CalorieEntry[], goal: number = CALORIE_GOAL): number {
  const hits = calorieHitDates(entries, goal) // sorted ascending, distinct
  let best = 0
  let run = 0
  let prev = -Infinity
  for (const d of hits) {
    const t = parseISODate(d).getTime()
    run = t - prev === MS_PER_DAY ? run + 1 : 1
    if (run > best) best = run
    prev = t
  }
  return best
}

/** Current run of consecutive goal-hit days ending on (and including) `today`. */
export function currentCalorieStreak(
  entries: CalorieEntry[],
  today: Date = new Date(),
  goal: number = CALORIE_GOAL,
): number {
  const hits = new Set(calorieHitDates(entries, goal))
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let run = 0
  while (hits.has(toISODate(cursor))) {
    run += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return run
}

// ---------------------------------------------------------------------------
// Celebration builders.
// ---------------------------------------------------------------------------

function weekSessionRecord(name: string, count: number): Celebration {
  return {
    tier: 'large',
    title: `most ${name} in a week`,
    subtitle: `${count} this week — a new personal best.`,
    icon: 'trophy',
  }
}

function calDayRecord(calories: number): Celebration {
  return {
    tier: 'medium',
    title: 'biggest eating day yet',
    subtitle: `${calories.toLocaleString()} cal in a single day — new high.`,
    icon: 'flame',
  }
}

function calWeekRecord(calories: number): Celebration {
  return {
    tier: 'large',
    title: 'biggest week of fueling',
    subtitle: `${calories.toLocaleString()} cal this week — a new high.`,
    icon: 'flame',
  }
}

function calStreakRecord(days: number): Celebration {
  return {
    tier: 'large',
    title: 'longest calorie streak yet',
    subtitle: `${days} days straight on target. that's the bulk taking care of itself.`,
    icon: 'flame',
  }
}

function calStreakMilestone(days: number): Celebration {
  return {
    tier: 'medium',
    title: `${days}-day calorie streak`,
    subtitle: 'consistency is compounding — keep it going.',
    icon: 'flame',
  }
}

// ---------------------------------------------------------------------------
// Detection.
// ---------------------------------------------------------------------------

/**
 * Every all-time record newly broken by moving from `before` to `after`.
 * Safe to call from any log site: records for data an action didn't touch
 * simply don't fire (their before/after values are identical).
 */
export function newRecords(
  before: RecordSnapshot,
  after: RecordSnapshot,
  today: Date = new Date(),
): Celebration[] {
  const out: Celebration[] = []
  const wk = weekStartISO(toISODate(today))
  const todayISO = toISODate(today)

  // Weekly session-count records: total workouts + each day type + stretches.
  const sessionDefs: { name: string; keep: (d: DayType) => boolean }[] = [
    { name: 'workouts', keep: () => true },
    // Derived from DAY_TYPES so a newly shipped day gets its own record too.
    ...DAY_TYPES.map((type) => ({
      name: `${DAY_TYPE_NAME[type]} sessions`,
      keep: (d: DayType) => d === type,
    })),
  ]
  for (const def of sessionDefs) {
    const b = periodValue(sessionsByWeek(before.workouts, def.keep), wk)
    const a = periodValue(sessionsByWeek(after.workouts, def.keep), wk)
    if (crossedRecord(b, a)) out.push(weekSessionRecord(def.name, a.current))
  }

  {
    const b = periodValue(datesByWeek(before.flexDates), wk)
    const a = periodValue(datesByWeek(after.flexDates), wk)
    if (crossedRecord(b, a)) out.push(weekSessionRecord('stretch sessions', a.current))
  }

  // Biggest single day of eating (any day except today is the bar to clear).
  {
    const totalsBefore = dayTotals(before.calorieEntries)
    const totalsAfter = dayTotals(after.calorieEntries)
    let priorBest = 0
    for (const [date, total] of totalsAfter) {
      if (date !== todayISO && total > priorBest) priorBest = total
    }
    const beforeToday = totalsBefore.get(todayISO) ?? 0
    const afterToday = totalsAfter.get(todayISO) ?? 0
    if (priorBest > 0 && afterToday > priorBest && beforeToday <= priorBest) out.push(calDayRecord(afterToday))
  }

  // Biggest single week of eating.
  {
    const b = periodValue(caloriesByWeek(before.calorieEntries), wk)
    const a = periodValue(caloriesByWeek(after.calorieEntries), wk)
    if (crossedRecord(b, a)) out.push(calWeekRecord(a.current))
  }

  // Longest calorie-goal streak (all-time record), then any milestone crossed.
  {
    const longestBefore = longestCalorieStreak(before.calorieEntries)
    const longestAfter = longestCalorieStreak(after.calorieEntries)
    if (longestAfter > longestBefore && longestAfter >= MIN_STREAK_RECORD) {
      out.push(calStreakRecord(longestAfter))
    } else {
      const streakBefore = currentCalorieStreak(before.calorieEntries, today)
      const streakAfter = currentCalorieStreak(after.calorieEntries, today)
      const milestone = STREAK_MILESTONES.filter((m) => m > streakBefore && m <= streakAfter).pop()
      if (milestone != null) out.push(calStreakMilestone(milestone))
    }
  }

  return out
}
