/**
 * What this app tells my-brain about how training is going.
 *
 * my-brain's life wheel has a body slice, and the honest reading of it is
 * already here: the weekly streak and the committed goals. Both apps are served
 * from the same site, so this app leaves a small summary in the storage they
 * share and my-brain reads it there. Nothing is sent anywhere and no account
 * key changes hands.
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
import type { WeekResult } from './weeklyStreak'

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
  /** Committed goals already reached. */
  met: number
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
}

/** Where every committed goal stands, read exactly as the Progress tab reads it. */
export function goalStandings(goals: GoalSpec[], stored: LockedProjections, today: Date = new Date()): GoalStandings {
  const locked = liveLocks(stored, goals, today)
  const out: GoalStandings = { open: 0, onPace: 0, met: 0 }
  for (const goal of goals) {
    const lock = locked[goal.id]
    if (!lock) continue
    if (isReached(goal)) {
      out.met += 1
      continue
    }
    const proj = projectGoal(goal, today)
    const last = goal.points[goal.points.length - 1]
    if (!last || !Number.isFinite(proj.current)) continue
    out.open += 1
    const pace = paceAgainstLock(lock, proj.current, last.date, proj.slopePerWeek, today, proj)
    if (pace.status !== 'behind') out.onPace += 1
  }
  return out
}

/** The summary for a streak history, or null when nothing has been logged yet. */
export function buildBrainShare(history: WeekResult[], goals: GoalStandings, today: Date = new Date()): BrainShare | null {
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
  }
}
