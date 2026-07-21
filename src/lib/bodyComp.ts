import type { Point } from './progress'

/**
 * Body-composition tracking: waist/neck measurements plus a body-fat % estimate,
 * and an empirical record of when abs actually became visible.
 *
 * A visible six-pack is gated by TWO things: low enough body fat AND enough ab
 * muscle thickness. So a fixed "reach 12%" target is wrong per-person — Chase
 * was at ~11% on 2025-10-31 with no visible abs. Instead of guessing, we log ab
 * visibility alongside the body-fat estimate over time and derive a *personal*
 * target from the leanest point actually observed. As ab muscle grows, the BF%
 * needed to see abs rises, and the logged observations capture that.
 */

/** How visible the abs looked at a given measurement. */
export type AbsVisibility = 'none' | 'faint' | 'clear'

/**
 * One body-measurement snapshot. Waist and neck (inches) drive the Navy estimate;
 * `bodyFatPct` is an optional directly-known reading (e.g. DEXA / smart scale)
 * that overrides the estimate for that day. `absVisibility` is the empirical
 * observation. One entry per date.
 */
export type MeasurementEntry = {
  date: string /* YYYY-MM-DD */
  waistIn?: number
  neckIn?: number
  /** Directly-known BF% (overrides the Navy estimate when present). */
  bodyFatPct?: number
  absVisibility?: AbsVisibility
  note?: string
}

/** Generic fallback BF% at/below which a six-pack tends to appear for men. */
export const SIX_PACK_BF = 12

const round1 = (n: number): number => Math.round(n * 10) / 10
const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

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
  if (![waistIn, neckIn, heightIn].every(isPos)) return null
  const girth = waistIn - neckIn
  if (girth <= 0) return null
  const bf = 86.01 * Math.log10(girth) - 70.041 * Math.log10(heightIn) + 36.76
  if (!Number.isFinite(bf) || bf <= 0) return null
  return round1(bf)
}

/**
 * The best BF% for an entry: a directly-known reading if present, otherwise the
 * Navy estimate from waist/neck + height. Null if neither is available.
 */
export function effectiveBodyFat(entry: MeasurementEntry, heightIn: number): number | null {
  if (isPos(entry.bodyFatPct)) return round1(entry.bodyFatPct)
  if (isPos(entry.waistIn) && isPos(entry.neckIn)) {
    return navyBodyFat(entry.waistIn, entry.neckIn, heightIn)
  }
  return null
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

/** Waist (inches) over time as {date, value}, for entries that recorded a waist. */
export function waistSeries(entries: MeasurementEntry[]): Point[] {
  return dedupeMeasurementsByDate(entries)
    .filter((e) => isPos(e.waistIn))
    .map((e) => ({ date: e.date, value: e.waistIn as number }))
}

/**
 * Estimated BF% over time as {date, value}, sorted ascending by date. Entries
 * whose BF% can't be determined (e.g. before a height is set) are skipped.
 */
export function bodyFatSeries(entries: MeasurementEntry[], heightIn: number): Point[] {
  const out: Point[] = []
  for (const e of dedupeMeasurementsByDate(entries)) {
    const bf = effectiveBodyFat(e, heightIn)
    if (bf != null) out.push({ date: e.date, value: bf })
  }
  return out
}

/** The most recent measurement by date, or null if there are none. */
export function latestMeasurement(entries: MeasurementEntry[]): MeasurementEntry | null {
  const sorted = dedupeMeasurementsByDate(entries)
  return sorted.length ? sorted[sorted.length - 1] : null
}

export type VisibilityObservation = { date: string; bodyFat: number; visibility: AbsVisibility }

/** Every entry that recorded ab visibility AND has a determinable BF%. */
export function visibilityObservations(
  entries: MeasurementEntry[],
  heightIn: number,
): VisibilityObservation[] {
  const out: VisibilityObservation[] = []
  for (const e of dedupeMeasurementsByDate(entries)) {
    if (!e.absVisibility) continue
    const bf = effectiveBodyFat(e, heightIn)
    if (bf == null) continue
    out.push({ date: e.date, bodyFat: bf, visibility: e.absVisibility })
  }
  return out
}

/**
 * A personal six-pack BF% target derived from the leanest point you've actually
 * observed:
 *   - abs already 'clear' there → hold at that BF% (target = that BF%)
 *   - 'faint' → aim ~1% leaner to sharpen them
 *   - 'none' → aim ~2% leaner than your leanest-yet
 * With no visibility data, falls back to the generic threshold. The target
 * self-corrects as you log leaner points and as ab muscle makes abs show sooner.
 */
export function personalSixPackTarget(
  entries: MeasurementEntry[],
  heightIn: number,
  fallback: number = SIX_PACK_BF,
): { target: number; leanest: VisibilityObservation | null } {
  const obs = visibilityObservations(entries, heightIn)
  if (obs.length === 0) return { target: fallback, leanest: null }
  const leanest = obs.reduce((a, b) => (b.bodyFat < a.bodyFat ? b : a))
  const step = leanest.visibility === 'clear' ? 0 : leanest.visibility === 'faint' ? 1 : 2
  const target = Math.max(4, round1(leanest.bodyFat - step))
  return { target, leanest }
}
