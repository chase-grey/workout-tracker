/**
 * Locked goal projections: turning a drifting estimate into a commitment you can
 * be measured against.
 *
 * A live projection (see predictions.project) refits its slope every time new
 * data lands, so its ETA slides around and you can never actually be "behind" —
 * the line just re-aims at wherever you are. Once a goal comes within
 * LOCK_HORIZON_MONTHS, we snapshot the projection instead: a fixed start point,
 * target, and ETA. From then on the chart can draw that straight line as
 * *projected* and the real series as *actual*, and every new entry is either
 * ahead of the line or behind it.
 *
 * The lock is a snapshot, not a verdict — recalculate() re-locks from today's
 * data whenever the user asks for a fresh estimate.
 *
 * Pure module — no React/DOM, no storage.
 */

import { parseISODate, toISODate } from './dates'
import type { Projection } from './predictions'

/** A goal enters lock-in once its projected ETA is this close. */
export const LOCK_HORIZON_MONTHS = 6

const MS_PER_DAY = 86_400_000
const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * Past this, a re-derived ETA is noise rather than information — a pace a hair
 * above flat extrapolates to a date decades out, which tells you nothing except
 * that you've stalled (which the ahead/behind reading already says).
 */
export const MAX_REVISED_ETA_DAYS = 3 * 365

/** A projection frozen at the moment a goal came within the horizon. */
export type LockedProjection = {
  /** Which goal this belongs to (see GOAL_IDS in features/progress). */
  goalId: string
  /** ISO date the projection was locked (or last recalculated). */
  lockedAt: string
  /** The metric's value at lock time — the projected line's origin. */
  startValue: number
  target: number
  /** ISO date the locked line reaches `target`. */
  etaDate: string
  /** Slope the lock was taken at, in metric units per week. */
  slopePerWeek: number
}

export type LockedProjections = Record<string, LockedProjection>

/** Days from `from` to `to` (negative when `to` precedes `from`). */
function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / MS_PER_DAY)
}

/**
 * Whether a live projection is close enough to the target to be locked in.
 *
 * A goal sitting exactly ON its target (etaWeeks 0) is excluded: there's nothing
 * left to project, and freezing it would produce a zero-length line that reports
 * every later reading as "behind" forever.
 */
export function withinHorizon(proj: Projection, today: Date = new Date()): boolean {
  if (!proj.onTrack || proj.etaDate == null || proj.etaWeeks === 0) return false
  const horizon = new Date(today.getFullYear(), today.getMonth() + LOCK_HORIZON_MONTHS, today.getDate())
  return parseISODate(proj.etaDate) <= horizon
}

/**
 * Freeze a live projection. Returns null when the projection has nothing to
 * freeze: no data, not trending toward the target, already there, or an ETA that
 * lands on the lock date itself (a zero-length line can't be tracked against).
 */
export function lockProjection(
  goalId: string,
  proj: Projection,
  today: Date = new Date(),
): LockedProjection | null {
  if (!proj.onTrack || proj.etaDate == null || !Number.isFinite(proj.current)) return null
  if (proj.etaWeeks === 0 || daysBetween(toISODate(today), proj.etaDate) <= 0) return null
  return {
    goalId,
    lockedAt: toISODate(today),
    startValue: round1(proj.current),
    target: proj.target,
    etaDate: proj.etaDate,
    slopePerWeek: proj.slopePerWeek,
  }
}

/**
 * Lock a goal if it has come within the horizon and isn't locked already.
 * Returns the existing lock untouched otherwise, so an ETA that later drifts
 * back out past six months doesn't silently discard the commitment.
 */
export function maybeLock(
  existing: LockedProjection | undefined,
  goalId: string,
  proj: Projection,
  today: Date = new Date(),
): LockedProjection | undefined {
  if (existing) return existing
  if (!withinHorizon(proj, today)) return undefined
  return lockProjection(goalId, proj, today) ?? undefined
}

/**
 * Where the locked line says the metric should be on `date` — a straight line
 * from (lockedAt, startValue) to (etaDate, target). Before the lock date it
 * reads startValue; after the ETA it reads target.
 */
export function expectedAt(lock: LockedProjection, date: string): number {
  const span = daysBetween(lock.lockedAt, lock.etaDate)
  if (span <= 0) return round1(lock.target)
  const elapsed = daysBetween(lock.lockedAt, date)
  if (elapsed <= 0) return round1(lock.startValue)
  if (elapsed >= span) return round1(lock.target)
  return round1(lock.startValue + ((lock.target - lock.startValue) * elapsed) / span)
}

/**
 * The projected line as chart points, one per week from the lock date through
 * the ETA, so it can be overlaid on the actual series.
 */
export function projectedSeries(lock: LockedProjection): { date: string; value: number }[] {
  const span = daysBetween(lock.lockedAt, lock.etaDate)
  const out: { date: string; value: number }[] = []
  const start = parseISODate(lock.lockedAt)
  for (let day = 0; day <= span; day += 7) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day)
    const iso = toISODate(d)
    out.push({ date: iso, value: expectedAt(lock, iso) })
  }
  // Always land exactly on the target at the ETA, even when the span isn't a
  // whole number of weeks.
  if (out.length === 0 || out[out.length - 1].date !== lock.etaDate) {
    out.push({ date: lock.etaDate, value: round1(lock.target) })
  }
  return out
}

export type Pace = {
  /** Positive = ahead of the locked line, negative = behind it. */
  aheadBy: number
  /** Where the locked line expected you to be today. */
  expected: number
  actual: number
  status: 'ahead' | 'behind' | 'on'
  /** Revised ETA implied by the pace you've actually held since the lock. */
  revisedEta: string | null
}

/**
 * How the latest actual value compares with the locked line, and what ETA the
 * pace you've really held implies.
 *
 * "Ahead" always means *closer to the target than planned*, whichever direction
 * the metric moves — losing body fat faster and adding squat weight faster both
 * count as ahead.
 */
export function paceAgainstLock(
  lock: LockedProjection,
  actual: number,
  today: Date = new Date(),
): Pace {
  const todayISO = toISODate(today)
  const expected = expectedAt(lock, todayISO)
  // Sign so that "ahead" is always progress toward the target.
  const toward = Math.sign(lock.target - lock.startValue) || 1
  const aheadBy = round1((actual - expected) * toward)
  const status = Math.abs(aheadBy) < 0.05 ? 'on' : aheadBy > 0 ? 'ahead' : 'behind'

  // Re-derive an ETA from the pace actually held since the lock. A pace barely
  // above flat implies an absurdly distant date, which says nothing useful — past
  // MAX_REVISED_ETA_DAYS we report no revised date rather than the year 2081.
  const elapsedDays = daysBetween(lock.lockedAt, todayISO)
  let revisedEta: string | null = null
  if (elapsedDays > 0) {
    const realSlopePerDay = (actual - lock.startValue) / elapsedDays
    const remaining = lock.target - actual
    if (realSlopePerDay !== 0 && Math.sign(remaining) === Math.sign(realSlopePerDay)) {
      const daysLeft = Math.round(remaining / realSlopePerDay)
      if (daysLeft <= MAX_REVISED_ETA_DAYS) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysLeft)
        revisedEta = toISODate(d)
      }
    }
  }

  return { aheadBy, expected, actual, status, revisedEta }
}
