/** Pure goal-projection helpers. No side effects beyond the optional `today` clock. */

import { toISODate, parseISODate } from './dates'

const MS_PER_DAY = 86_400_000

export type Projection = {
  slopePerWeek: number // least-squares slope of value vs weeks, over the trend window
  current: number // fitted/estimated current value (latest actual if available)
  target: number
  etaWeeks: number | null // weeks from today to reach target; null if not trending toward it
  etaDate: string | null // ISO YYYY-MM-DD; null if etaWeeks null
  onTrack: boolean // true iff etaWeeks is a positive finite number
  /** What the slope was read from. */
  basis: ProjectionBasis
}

export type ProjectionBasis = {
  /** Readings the slope was fitted on. */
  points: number
  /** Days from the oldest fitted reading to the newest. */
  spanDays: number
  /** Too little recent data to read a pace from, so no slope was fitted. */
  thin: boolean
}

export type TrendWindow = {
  /** Prefer readings within this many days of the newest one. */
  windowDays: number
  /** Widen past `windowDays` until the window holds this many readings. */
  minPoints: number
  /** Readings bunched inside this many days aren't a direction. */
  minSpanDays: number
}

/**
 * How much history a pace is read from.
 *
 * Fitting a line to *every* reading answers a question the goal never asked —
 * "what has my average week looked like since I started logging?" A month off
 * sick drags that line down for the rest of the year, long after the weight came
 * back, so the ETA describes an interruption instead of what you're doing now.
 * Fitting the recent window answers the question the goal does ask: at this
 * pace, when do I get there?
 *
 * The window widens when readings are sparse — a 1RM or a tape measurement lands
 * weekly at best, and two weeks of those is one or two numbers. It stays empty
 * when the readings are bunched into a few days: consecutive weigh-ins say more
 * about water than about direction.
 */
export const TREND_WINDOW: TrendWindow = {
  windowDays: 14,
  minPoints: 3,
  minSpanDays: 10,
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** Whole days from ISO date `from` to ISO date `to`. */
function daysApart(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / MS_PER_DAY)
}

/** ISO date `days` days after `from`. */
function addDaysISO(from: Date, days: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/**
 * The readings a pace should be fitted on: those within `windowDays` of the
 * newest reading, widened to the last `minPoints` readings when the window holds
 * fewer than that.
 *
 * Anchored on the newest reading rather than on today, so a series that has gone
 * quiet still reports the pace it ended on rather than no pace at all.
 */
export function trendPoints<T extends { date: string }>(
  points: T[],
  window: TrendWindow = TREND_WINDOW,
): T[] {
  if (points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const newest = sorted[sorted.length - 1].date
  const recent = sorted.filter((p) => daysApart(p.date, newest) <= window.windowDays)
  return recent.length >= window.minPoints ? recent : sorted.slice(-window.minPoints)
}

/** Least-squares slope of value against weeks. Zero when the dates don't vary. */
function fitSlopePerWeek(points: { date: string; value: number }[]): number {
  const t0 = parseISODate(points[0].date).getTime()
  const xs = points.map((p) => (parseISODate(p.date).getTime() - t0) / (7 * MS_PER_DAY))
  const ys = points.map((p) => p.value)

  const n = points.length
  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    sxy += dx * (ys[i] - meanY)
    sxx += dx * dx
  }
  return sxx === 0 ? 0 : round3(sxy / sxx)
}

export function project(
  points: { date: string; value: number }[],
  target: number,
  today: Date = new Date(),
  window: TrendWindow = TREND_WINDOW,
): Projection {
  if (points.length === 0) {
    return {
      slopePerWeek: 0,
      current: NaN,
      target,
      etaWeeks: null,
      etaDate: null,
      onTrack: false,
      basis: { points: 0, spanDays: 0, thin: true },
    }
  }

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const current = round1(sorted[sorted.length - 1].value)

  const fitted = trendPoints(sorted, window)
  const spanDays = daysApart(fitted[0].date, fitted[fitted.length - 1].date)
  const basis: ProjectionBasis = {
    points: fitted.length,
    spanDays,
    thin: fitted.length < window.minPoints || spanDays < window.minSpanDays,
  }
  const slopePerWeek = basis.thin ? 0 : fitSlopePerWeek(fitted)

  const diff = target - current
  const eps = 1e-9

  // Already at or past the target: reached now. Arriving needs no pace behind it,
  // so this is decided before the window is judged thin.
  if (Math.abs(diff) < eps) {
    return {
      slopePerWeek,
      current,
      target,
      etaWeeks: 0,
      etaDate: toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate())),
      onTrack: true,
      basis,
    }
  }

  // Trending toward the target: sign of remaining gap matches sign of slope.
  const towardTarget = slopePerWeek !== 0 && Math.sign(diff) === Math.sign(slopePerWeek)
  if (towardTarget) {
    const etaWeeks = diff / slopePerWeek // > 0 by construction
    return {
      slopePerWeek,
      current,
      target,
      etaWeeks,
      etaDate: addDaysISO(today, Math.round(etaWeeks * 7)),
      onTrack: true,
      basis,
    }
  }

  // Too little recent data to read, flat, or moving away from the target.
  return {
    slopePerWeek,
    current,
    target,
    etaWeeks: null,
    etaDate: null,
    onTrack: false,
    basis,
  }
}

/**
 * The value you'd need one week from now to stay on a straight line that reaches
 * `target` in `weeksOut` weeks. If `weeksOut <= 0`, returns `target`. Rounded to 1 decimal.
 */
export function weeklyTarget(current: number, target: number, weeksOut: number): number {
  if (weeksOut <= 0) return round1(target)
  return round1(current + (target - current) / weeksOut)
}
