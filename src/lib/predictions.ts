/** Pure goal-projection helpers. No side effects beyond the optional `today` clock. */

import { toISODate, parseISODate } from './dates'

export type Projection = {
  slopePerWeek: number // least-squares slope of value vs weeks
  current: number // fitted/estimated current value (latest actual if available)
  target: number
  etaWeeks: number | null // weeks from today to reach target; null if not trending toward it
  etaDate: string | null // ISO YYYY-MM-DD; null if etaWeeks null
  onTrack: boolean // true iff etaWeeks is a positive finite number
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** ISO date `days` days after `from`. */
function addDaysISO(from: Date, days: number): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function project(
  points: { date: string; value: number }[],
  target: number,
  today: Date = new Date(),
): Projection {
  if (points.length === 0) {
    return {
      slopePerWeek: 0,
      current: NaN,
      target,
      etaWeeks: null,
      etaDate: null,
      onTrack: false,
    }
  }

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const current = round1(sorted[sorted.length - 1].value)

  if (sorted.length === 1) {
    return {
      slopePerWeek: 0,
      current,
      target,
      etaWeeks: null,
      etaDate: null,
      onTrack: false,
    }
  }

  // Convert each date to weeks since the first point.
  const t0 = parseISODate(sorted[0].date).getTime()
  const xs = sorted.map((p) => (parseISODate(p.date).getTime() - t0) / (7 * 86400000))
  const ys = sorted.map((p) => p.value)

  const n = sorted.length
  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    sxy += dx * (ys[i] - meanY)
    sxx += dx * dx
  }
  const b = sxx === 0 ? 0 : sxy / sxx
  const slopePerWeek = round3(b)

  const diff = target - current
  const eps = 1e-9

  // Already at or past the target: reached now.
  if (Math.abs(diff) < eps) {
    return {
      slopePerWeek,
      current,
      target,
      etaWeeks: 0,
      etaDate: toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate())),
      onTrack: true,
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
    }
  }

  // Flat, or moving away from the target.
  return {
    slopePerWeek,
    current,
    target,
    etaWeeks: null,
    etaDate: null,
    onTrack: false,
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
