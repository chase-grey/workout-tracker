import type { Point } from './progress'

/**
 * Body-composition tracking: waist/neck measurements plus a body-fat % estimate.
 *
 * A visible six-pack is driven by body-fat %, not bodyweight or lifts, so this is
 * the signal the six-pack goal projects against. We estimate BF% from tape
 * measurements using the U.S. Navy circumference method (men), which needs waist,
 * neck, and height. Waist + neck are logged per measurement; height is a fixed
 * setting.
 */

/** One body-measurement snapshot. Waist and neck in inches. One per date. */
export type MeasurementEntry = {
  date: string /* YYYY-MM-DD */
  waistIn: number
  neckIn: number
  note?: string
}

/** BF% at/below which a six-pack typically becomes visible for men. */
export const SIX_PACK_BF = 12

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * U.S. Navy body-fat estimate for men, from waist, neck, and height (all inches):
 *   BF% = 86.010·log10(waist − neck) − 70.041·log10(height) + 36.76
 *
 * Returns null when the inputs can't yield a real, positive estimate (e.g. a
 * missing height, or waist ≤ neck, which makes the log undefined).
 */
export function navyBodyFat(
  waistIn: number,
  neckIn: number,
  heightIn: number,
): number | null {
  if (![waistIn, neckIn, heightIn].every((n) => Number.isFinite(n) && n > 0)) return null
  const girth = waistIn - neckIn
  if (girth <= 0) return null
  const bf = 86.01 * Math.log10(girth) - 70.041 * Math.log10(heightIn) + 36.76
  if (!Number.isFinite(bf) || bf <= 0) return null
  return round1(bf)
}

/**
 * Collapse to one entry per date, keeping the last entry seen for a date (each
 * measurement is a full snapshot). Sorted ascending by date.
 */
export function dedupeMeasurementsByDate(entries: MeasurementEntry[]): MeasurementEntry[] {
  const byDate = new Map<string, MeasurementEntry>()
  for (const e of entries) byDate.set(e.date, e)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Waist (inches) over time as {date, value}, sorted ascending by date. */
export function waistSeries(entries: MeasurementEntry[]): Point[] {
  return dedupeMeasurementsByDate(entries).map((e) => ({ date: e.date, value: e.waistIn }))
}

/**
 * Estimated BF% over time as {date, value}, sorted ascending by date. Entries
 * whose estimate can't be computed (e.g. before a height is set) are skipped.
 */
export function bodyFatSeries(entries: MeasurementEntry[], heightIn: number): Point[] {
  const out: Point[] = []
  for (const e of dedupeMeasurementsByDate(entries)) {
    const bf = navyBodyFat(e.waistIn, e.neckIn, heightIn)
    if (bf != null) out.push({ date: e.date, value: bf })
  }
  return out
}

/** The most recent measurement by date, or null if there are none. */
export function latestMeasurement(entries: MeasurementEntry[]): MeasurementEntry | null {
  const sorted = dedupeMeasurementsByDate(entries)
  return sorted.length ? sorted[sorted.length - 1] : null
}
