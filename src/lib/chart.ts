/**
 * Shared helpers for time-scaled chart axes. Charts key off a `date`
 * (YYYY-MM-DD) string, but a categorical axis spaces points evenly regardless
 * of the real gap between them. Converting each point to a numeric timestamp and
 * using a `scale="time"` X axis makes the horizontal spacing proportional to the
 * actual elapsed time.
 */
import { parseISODate } from './dates'

/** Add a numeric `t` (local-midnight ms) to each date-keyed row. */
export function withTime<T extends { date: string }>(rows: T[]): (T & { t: number })[] {
  return rows.map((r) => ({ ...r, t: parseISODate(r.date).getTime() }))
}

/** Short M/D label for axis ticks. */
export function fmtTick(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** Fuller M/D/YY label for tooltip headers. */
export function fmtDateLabel(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

/**
 * A three-step green ladder for chart marks: bright green for the series being
 * read, dark green for its companion, and real dark green for goal furniture —
 * target lines, lock marks, ETA dots — which should sit behind the data.
 */
export const LINE_PRIMARY = '#22c55e'
export const LINE_SECONDARY = '#15803d'
export const LINE_GOAL = '#14532d'
/** Goal labels step up the ladder: 9px type at {@link LINE_GOAL} is too dim to read. */
export const LINE_GOAL_LABEL = LINE_SECONDARY

/** Props for a time-scaled X axis over a numeric `t` timestamp key. */
export const timeXAxis = {
  dataKey: 't',
  type: 'number' as const,
  scale: 'time' as const,
  domain: ['dataMin', 'dataMax'] as [string, string],
  tickFormatter: fmtTick,
}

/** Round `n` to a "nice" number (1/2/5 × 10ⁿ) — up for steps, either way otherwise. */
function niceNum(n: number, roundUp: boolean): number {
  const exp = Math.floor(Math.log10(n))
  const pow = Math.pow(10, exp)
  const frac = n / pow
  let nice: number
  if (roundUp) nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  else nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10
  return nice * pow
}

/**
 * A Y-axis scale with evenly-spaced, round tick values (…10, 20, 30…) computed
 * from a series' min/max. Recharts' `'auto'` domain leaves ragged, uneven ticks;
 * this snaps the domain out to round bounds and spaces the ticks uniformly.
 *
 * `broken` is true when the axis starts above zero, so a break mark can flag that
 * the scale is skipping the values between 0 and the first tick.
 */
export function niceScale(
  values: number[],
  targetTicks = 4,
): { domain: [number, number]; ticks: number[]; broken: boolean } {
  const nums = values.filter((v) => Number.isFinite(v))
  if (nums.length === 0) return { domain: [0, 1], ticks: [0, 1], broken: false }

  let min = Math.min(...nums)
  let max = Math.max(...nums)
  if (min === max) {
    // A flat series has no range to snap to — pad it so the line sits mid-chart.
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1
    min -= pad
    max += pad
  }

  const step = niceNum((max - min) / Math.max(1, targetTicks - 1), true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let t = niceMin; t <= niceMax + step / 2; t += step) {
    // Kill floating-point dust like 19.999999998 from repeated addition.
    ticks.push(Math.round(t * 1e6) / 1e6)
  }
  return { domain: [niceMin, niceMax], ticks, broken: niceMin > 0 }
}
