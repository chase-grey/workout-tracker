/**
 * Shared helpers for time-scaled chart axes. Charts key off a `date`
 * (YYYY-MM-DD) string, but a categorical axis spaces points evenly regardless
 * of the real gap between them. Converting each point to a numeric timestamp and
 * using a `scale="time"` X axis makes the horizontal spacing proportional to the
 * actual elapsed time.
 */
import { parseISODate } from './dates'
import { currentPalette, onThemeChange } from './themeStore'
import type { Palette } from './theme'

/** Frame commitments and logged history without letting a live ETA extend the chart. */
export function goalChartEnd(
  readings: { date: string }[],
  goals: { lock?: { etaDate: string } }[],
): string {
  return [...readings.map((r) => r.date), ...goals.flatMap((g) => g.lock ? [g.lock.etaDate] : [])]
    .reduce((latest, date) => date > latest ? date : latest, '')
}

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
 * A three-step ladder on the accent for chart marks: bright for the series being
 * read, darker for its companion, and darkest for goal furniture — target lines,
 * lock marks, ETA dots — which should sit behind the data. On a light ground the
 * ladder runs the other way, since "behind" there means paler.
 *
 * `let` rather than `const` so they follow the theme: an import is a live
 * binding, and every chart reads these at render. See {@link applyPalette}.
 */
export let LINE_PRIMARY = ''
export let LINE_SECONDARY = ''
/** Live pace alongside the committed projection. */
export let LINE_CURRENT_PACE = ''
export let LINE_GOAL = ''
/** Goal labels step up the ladder: 9px type at {@link LINE_GOAL} is too dim to read. */
export let LINE_GOAL_LABEL = ''

/**
 * Sessions plotted beside a line rather than on it — the day's second press (see
 * progress.offSlotSeries). Grey rather than a fourth rung: it isn't part
 * of the series ladder, it's a reading the series deliberately doesn't read, and
 * an accent ring would invite it to be compared with the line it sits next to.
 */
export let MARK_OFF_SLOT = ''

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
 * A goal reading that came off the goal's companion lift rather than the one it's
 * named for — an incline day on the bench line, a barbell squat on the squat
 * line (see progress.Point's `from`). The accent, stepped away from the ground:
 * lighter on black, darker on paper, so it reads as the same series in a
 * different weight rather than a second colour fighting the line.
 */
export let MARK_OTHER_LIFT = ''

/**
 * Cold stretch readings run cool against the warm ones' accent — blue for the
 * left (or only) reading, violet for the right, or whichever cool pair stays
 * clear of the accent (see theme.cold).
 */
export let LINE_COLD = ''
export let LINE_COLD_2 = ''

/**
 * The ground a chart sits on, for the props Recharts writes straight onto SVG
 * attributes — grid lines, the axis-break mask, a tag's backing, a hollow dot's
 * middle — where a CSS variable can't reach.
 */
export let CHART_PAGE = ''
export let CHART_SURFACE = ''
export let CHART_SURFACE_2 = ''
export let CHART_ZERO = ''

function applyPalette({ scale, ground, cold, cold2, theme }: Palette) {
  const light = theme.mode === 'light'
  LINE_PRIMARY = scale[light ? 600 : 500]
  LINE_SECONDARY = scale[light ? 400 : 700]
  LINE_GOAL = scale[light ? 200 : 900]
  // Goal labels step up the ladder: 9px type at LINE_GOAL is too dim to read.
  LINE_GOAL_LABEL = scale[light ? 500 : 700]
  LINE_CURRENT_PACE = light ? '#737373' : '#a3a3a3'
  MARK_OFF_SLOT = ground.tick
  LINE_COLD = cold
  LINE_COLD_2 = cold2
  MARK_OTHER_LIFT = scale[light ? 800 : 300]
  CHART_PAGE = ground.bg
  CHART_SURFACE = ground.surface
  CHART_SURFACE_2 = ground.surface2
  CHART_ZERO = ground.zero
}
applyPalette(currentPalette())
onThemeChange(() => applyPalette(currentPalette()))

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
