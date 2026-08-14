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

/**
 * Sessions plotted beside a line rather than on it — the day's second press (see
 * progress.offSlotSeries). Grey rather than a fourth green: it isn't another rung
 * of the series ladder, it's a reading the series deliberately doesn't read, and
 * a green ring would invite it to be compared with the line it sits next to.
 */
export const MARK_OFF_SLOT = '#737373'

/** What those marks are called, in the legend and the tooltip. */
export const OFF_SLOT_NAME = '2nd press'

/**
 * A hollow ring for one of them: unfilled so it reads as a mark beside the line
 * rather than a point on it. `bg` is the card colour showing through the middle.
 */
export function offSlotDot(bg: string) {
  return { r: 3, fill: bg, stroke: MARK_OFF_SLOT, strokeWidth: 2 }
}

/**
 * Cold stretch readings run cool against the warm ones' greens — blue for the
 * left (or only) reading, violet for the right.
 */
export const LINE_COLD = '#38bdf8'
export const LINE_COLD_2 = '#a78bfa'

/** Props for a time-scaled X axis over a numeric `t` timestamp key. */
export const timeXAxis = {
  dataKey: 't',
  type: 'number' as const,
  scale: 'time' as const,
  domain: ['dataMin', 'dataMax'] as [string, string],
  tickFormatter: fmtTick,
}

/** Days at or above the calorie goal that earn a week a bright mark, and a dim one. */
export const HIT_DAYS_BRIGHT = 6
export const HIT_DAYS_DIM = 5

/** A week bar's thickness, and the longest one a seven-day week can draw. */
export const WEEK_BAR_HEIGHT = 3
const WEEK_BAR_MAX = 20
/** Clear space left between neighbouring bars, so a run still reads week by week. */
const WEEK_BAR_GAP = 3
/** Under this much room a full week's bar is thinner than a pip, so draw the pip. */
const WEEK_BAR_MIN = 5

/** How a week's calorie record is drawn beneath its Monday on a date axis. */
export type WeekMark =
  | { shape: 'bar'; width: number; color: string; opacity: number }
  | { shape: 'pip'; r: number; color: string; opacity: number }
  | null

/**
 * The mark a week earns for `hits` days at the calorie goal, given `pxPerWeek` of
 * axis to draw it in.
 *
 * A week that fed the goal gets a bar rather than a dot, because bar *length*
 * carries the one number a dot can't: 5 days out of 7 reads as visibly short of
 * 7 out of 7, and a run of full weeks lines up into a rule under the stretch of
 * curve it produced. Weeks that logged something but fell short keep a faint pip
 * — enough to tell a bad week from an unlogged one without competing with the
 * good ones. A year-long range leaves only a few pixels per week, too little for
 * any bar to be legible, so those ranges fall back to pips at full colour.
 */
export function calorieWeekMark(hits: number, pxPerWeek: number): WeekMark {
  if (hits <= 0) return null
  if (hits < HIT_DAYS_DIM) return { shape: 'pip', r: 2.5, color: LINE_SECONDARY, opacity: 0.55 }
  const color = hits >= HIT_DAYS_BRIGHT ? LINE_PRIMARY : LINE_SECONDARY
  const room = Math.min(pxPerWeek - WEEK_BAR_GAP, WEEK_BAR_MAX)
  if (!(room >= WEEK_BAR_MIN)) return { shape: 'pip', r: 3, color, opacity: 1 }
  return { shape: 'bar', width: (room * Math.min(hits, 7)) / 7, color, opacity: 1 }
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
