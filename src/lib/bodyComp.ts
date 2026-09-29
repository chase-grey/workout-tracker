import type { Point } from './progress'

/**
 * Body-composition tracking: waist/neck measurements plus a recorded body-fat %,
 * and an empirical record of when abs actually became visible.
 *
 * A visible six-pack is gated by TWO things: low enough body fat AND enough ab
 * muscle thickness. So a fixed "reach 12%" target is wrong per-person — Chase
 * was at ~11% on 2025-10-31 with no visible abs. Instead of guessing, we log ab
 * visibility alongside the body-fat reading over time and derive a *personal*
 * target from the leanest point actually observed. As ab muscle grows, the BF%
 * needed to see abs rises, and the logged observations capture that.
 */

/** How visible the abs looked at a given measurement. */
export type AbsVisibility = 'none' | 'faint' | 'clear'

/**
 * One body-measurement snapshot. Body fat is a directly recorded reading
 * (e.g. smart scale / DEXA), independent of waist and neck. One entry per date.
 */
export type MeasurementEntry = {
  date: string /* YYYY-MM-DD */
  waistIn?: number
  neckIn?: number
  /** Directly recorded BF%. */
  bodyFatPct?: number
  absVisibility?: AbsVisibility
  note?: string
}

/** Generic fallback BF% at/below which a six-pack tends to appear for men. */
export const SIX_PACK_BF = 12

const round1 = (n: number): number => Math.round(n * 10) / 10
const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** A directly recorded body fat percentage; tape measurements never supply it. */
export function effectiveBodyFat(entry: MeasurementEntry): number | null {
  return isPos(entry.bodyFatPct) && entry.bodyFatPct < 100 ? round1(entry.bodyFatPct) : null
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
 * Recorded BF% over time as {date, value}, sorted ascending by date. Entries
 * without a direct reading are skipped.
 */
export function bodyFatSeries(entries: MeasurementEntry[]): Point[] {
  const out: Point[] = []
  for (const e of dedupeMeasurementsByDate(entries)) {
    const bf = effectiveBodyFat(e)
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
  _heightIn: number,
): VisibilityObservation[] {
  const out: VisibilityObservation[] = []
  for (const e of dedupeMeasurementsByDate(entries)) {
    if (!e.absVisibility) continue
    const bf = effectiveBodyFat(e)
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
