/**
 * What this app tells my-brain about how training is going.
 *
 * my-brain's life wheel has a body slice, and the honest reading of it is
 * already here: the weekly streak and the committed goals. Both apps are served
 * from the same site, so this app leaves a small summary in the storage they
 * share and my-brain reads it there, and posts the same summary to the backend
 * for a my-brain on any other device (see store/useBrainShare).
 *
 * The summary carries results, never the rules behind them. The streak is
 * replayed in one place (see weeklyStreak) and a goal's pace judged in one
 * place (see goalLock.paceAgainstLock), so the number my-brain shows can't
 * disagree with the one on the Today tab.
 *
 * Pure module: no React, no storage.
 */

import { toISODate } from './dates'
import { paceAgainstLock, type LockedProjections } from './goalLock'
import { isReached, liveLocks, projectGoal, type GoalSpec } from './goals'
import type { WeekCounts, WeekResult, WeeklyGoalConfig } from './weeklyStreak'

/** Where the summary is left. my-brain reads this key by name. */
export const BRAIN_SHARE_KEY = 'wt.share.body'

/** How many weeks back the summary reaches. */
const WEEKS_SHARED = 26

export type SharedWeek = {
  /** First day of the week, ISO. */
  week: string
  /** `hit` met every weekly goal, `froze` fell short and spent freezes, `missed` ended the run. */
  result: 'hit' | 'froze' | 'missed'
  /** The week still being lived. Only ever a week that is already `hit`. */
  inProgress?: true
}

export type GoalStandings = {
  /** Committed goals still being chased, with a reading to judge them by. */
  open: number
  /** Of those, the ones on or ahead of the line they committed to. */
  onPace: number
  /** Every goal already reached, committed to or not: the reached band on the Progress tab. */
  met: number
  /** The goals behind those counts by name, reached first, then in the order the Progress tab lists them. */
  list: SharedGoal[]
}

export type SharedGoal = {
  title: string
  state: 'met' | 'onPace' | 'behind'
}

export type BrainShare = {
  v: 1
  /** The day this was written, ISO. Weeks after it are unknown to the reader. */
  asOf: string
  streak: number
  freezes: number
  /** Every week this app has judged, counted even where `weeks` is cut short. */
  weeksTracked: number
  /** Oldest first. */
  weeks: SharedWeek[]
  goals: GoalStandings
  /** The week being lived against its weekly goals, as the Today tab counts it. */
  thisWeek?: SharedThisWeek
}

export type SharedThisWeek = {
  /** First day of the week, ISO. */
  week: string
  /** One row per weekly goal that is being judged, in the order the Today tab shows them. */
  rows: { kind: 'workouts' | 'stretches' | 'calorieDays' | 'cardio'; done: number; goal: number }[]
}

/** The week in progress, one row per goal the week is held to. */
export function sharedThisWeek(week: string, counts: WeekCounts, goals: WeeklyGoalConfig): SharedThisWeek {
  const all = [
    { kind: 'workouts' as const, done: counts.workouts, goal: goals.workouts },
    { kind: 'stretches' as const, done: counts.flex, goal: goals.flex },
    { kind: 'calorieDays' as const, done: counts.calDays, goal: goals.calDays },
    { kind: 'cardio' as const, done: counts.cardio ?? 0, goal: goals.cardio ?? 0 },
  ]
  return { week, rows: all.filter((row) => row.goal > 0) }
}

/** Where every committed goal stands, read exactly as the Progress tab reads it. */
export function goalStandings(goals: GoalSpec[], stored: LockedProjections, today: Date = new Date()): GoalStandings {
  const locked = liveLocks(stored, goals, today)
  const out: GoalStandings = { open: 0, onPace: 0, met: 0, list: [] }
  const chased: SharedGoal[] = []
  for (const goal of goals) {
    if (isReached(goal)) {
      out.met += 1
      out.list.push({ title: goal.title, state: 'met' })
      continue
    }
    const lock = locked[goal.id]
    if (!lock) continue
    const proj = projectGoal(goal, today)
    const last = goal.points[goal.points.length - 1]
    if (!last || !Number.isFinite(proj.current)) continue
    out.open += 1
    const pace = paceAgainstLock(lock, proj.current, last.date, proj.slopePerWeek, today, proj)
    const onPace = pace.status !== 'behind'
    if (onPace) out.onPace += 1
    chased.push({ title: goal.title, state: onPace ? 'onPace' : 'behind' })
  }
  out.list.push(...chased)
  return out
}

/** The summary for a streak history, or null when nothing has been logged yet. */
export function buildBrainShare(
  history: WeekResult[],
  goals: GoalStandings,
  today: Date = new Date(),
  thisWeek?: SharedThisWeek,
): BrainShare | null {
  const last = history[history.length - 1]
  if (!last) return null
  return {
    v: 1,
    asOf: toISODate(today),
    streak: last.streakAfter,
    freezes: last.freezesAfter,
    weeksTracked: history.length,
    weeks: history.slice(-WEEKS_SHARED).map((w) => ({
      week: w.week,
      result: w.outcome === 'advanced' ? 'hit' : w.outcome === 'froze' ? 'froze' : 'missed',
      ...(w.inProgress ? { inProgress: true as const } : {}),
    })),
    goals,
    ...(thisWeek ? { thisWeek } : {}),
  }
}
