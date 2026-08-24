import { weekStartISO, toISODate } from './dates'
import { HIGHER_IS_BETTER, LOWER_IS_BETTER, type MetricDir } from './flexMetrics'
import type { FlexRoutineKey } from '../config/flexRoutines'

/** A single flexibility log entry, tracking multiple stretch angles. */
export type FlexEntry = {
  date: string /* YYYY-MM-DD */
  splitDeg: number | null /* legacy/untagged side-split angle; counts as warm */
  coldSplitDeg?: number | null /* side split measured cold, at the start */
  warmSplitDeg?: number | null /* side split measured warm, at the end */
  tailorsLeftDeg: number | null /* legacy/untagged tailor's, left; counts as warm */
  tailorsRightDeg: number | null /* legacy/untagged tailor's, right; counts as warm */
  tailorsColdLeftDeg?: number | null /* tailor's left measured cold, at the start */
  tailorsColdRightDeg?: number | null /* tailor's right measured cold, at the start */
  tailorsWarmLeftDeg?: number | null /* tailor's left measured warm, after the last set */
  tailorsWarmRightDeg?: number | null /* tailor's right measured warm, after the last set */
  /* The head-to-toe angles. No untagged legacy variant of any of them, unlike
   * splitDeg / tailorsLeftDeg: nothing has ever written these, so cold and warm
   * are the only two readings that exist. */
  coldToeTouchDeg?: number | null
  warmToeTouchDeg?: number | null
  coldLegLiftLeftDeg?: number | null
  coldLegLiftRightDeg?: number | null
  warmLegLiftLeftDeg?: number | null
  warmLegLiftRightDeg?: number | null
  /**
   * Routines completed on this date, in completion order. Absent on legacy
   * entries, which were all side splits (see lib/stretchRotation).
   */
  routines?: FlexRoutineKey[]
  note?: string
}

/** The angle fields carried by a FlexEntry. */
const ANGLE_FIELDS = [
  'splitDeg',
  'coldSplitDeg',
  'warmSplitDeg',
  'tailorsLeftDeg',
  'tailorsRightDeg',
  'tailorsColdLeftDeg',
  'tailorsColdRightDeg',
  'tailorsWarmLeftDeg',
  'tailorsWarmRightDeg',
  'coldToeTouchDeg',
  'warmToeTouchDeg',
  'coldLegLiftLeftDeg',
  'coldLegLiftRightDeg',
  'warmLegLiftLeftDeg',
  'warmLegLiftRightDeg',
] as const

/**
 * The warm split for an entry: the warm reading when present, otherwise the
 * legacy untagged split (older data and manual logs count as warm).
 */
export const warmSplitOf = (e: FlexEntry): number | null => e.warmSplitDeg ?? e.splitDeg ?? null

/** The cold split for an entry, or null if none was captured. */
export const coldSplitOf = (e: FlexEntry): number | null => e.coldSplitDeg ?? null

/**
 * Tailor's readings follow the same cold/warm split as the side split: the
 * tagged warm reading wins, falling back to the legacy untagged pair (older
 * data and manual logs count as warm). Cold has no legacy fallback.
 */
export const warmTailorsLeftOf = (e: FlexEntry): number | null =>
  e.tailorsWarmLeftDeg ?? e.tailorsLeftDeg ?? null
export const warmTailorsRightOf = (e: FlexEntry): number | null =>
  e.tailorsWarmRightDeg ?? e.tailorsRightDeg ?? null
export const coldTailorsLeftOf = (e: FlexEntry): number | null => e.tailorsColdLeftDeg ?? null
export const coldTailorsRightOf = (e: FlexEntry): number | null => e.tailorsColdRightDeg ?? null

/**
 * The head-to-toe readings. Nothing untagged has ever been written for these, so
 * each fallback chain is one link long.
 */
export const coldToeTouchOf = (e: FlexEntry): number | null => e.coldToeTouchDeg ?? null
export const warmToeTouchOf = (e: FlexEntry): number | null => e.warmToeTouchDeg ?? null
export const coldLegLiftLeftOf = (e: FlexEntry): number | null => e.coldLegLiftLeftDeg ?? null
export const coldLegLiftRightOf = (e: FlexEntry): number | null => e.coldLegLiftRightDeg ?? null
export const warmLegLiftLeftOf = (e: FlexEntry): number | null => e.warmLegLiftLeftDeg ?? null
export const warmLegLiftRightOf = (e: FlexEntry): number | null => e.warmLegLiftRightDeg ?? null

/**
 * Collapse to one merged entry per date. For each angle field, keep the latest
 * non-null value seen for that date; keep the latest non-empty note; union the
 * routines. A date's entries are merged in input order, so later entries win.
 * Sorted ascending by date.
 *
 * `routines` unions rather than overwriting, and that matters: two stretch
 * sessions in one day is not a corner case here — it's precisely the case the
 * core-skip rule exists for. Overwriting would leave a day that did both reading
 * as having done only the second, and the alternation would then hand back the
 * routine that was already finished.
 */
export function dedupeFlexByDate(entries: FlexEntry[]): FlexEntry[] {
  const byDate = new Map<string, FlexEntry>()
  for (const e of entries) {
    const prev = byDate.get(e.date)
    if (!prev) {
      byDate.set(e.date, {
        date: e.date,
        splitDeg: e.splitDeg,
        coldSplitDeg: e.coldSplitDeg ?? null,
        warmSplitDeg: e.warmSplitDeg ?? null,
        tailorsLeftDeg: e.tailorsLeftDeg,
        tailorsRightDeg: e.tailorsRightDeg,
        tailorsColdLeftDeg: e.tailorsColdLeftDeg ?? null,
        tailorsColdRightDeg: e.tailorsColdRightDeg ?? null,
        tailorsWarmLeftDeg: e.tailorsWarmLeftDeg ?? null,
        tailorsWarmRightDeg: e.tailorsWarmRightDeg ?? null,
        coldToeTouchDeg: e.coldToeTouchDeg ?? null,
        warmToeTouchDeg: e.warmToeTouchDeg ?? null,
        coldLegLiftLeftDeg: e.coldLegLiftLeftDeg ?? null,
        coldLegLiftRightDeg: e.coldLegLiftRightDeg ?? null,
        warmLegLiftLeftDeg: e.warmLegLiftLeftDeg ?? null,
        warmLegLiftRightDeg: e.warmLegLiftRightDeg ?? null,
        ...(e.routines?.length ? { routines: [...new Set(e.routines)] } : {}),
        ...(e.note != null && e.note !== '' ? { note: e.note } : {}),
      })
      continue
    }
    for (const f of ANGLE_FIELDS) {
      if (e[f] != null) prev[f] = e[f]
    }
    if (e.routines?.length) {
      // First-seen order preserved, and input order is completion order — so the
      // last element is the routine that finished most recently.
      prev.routines = [...new Set([...(prev.routines ?? []), ...e.routines])]
    }
    if (e.note != null && e.note !== '') prev.note = e.note
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export type MetricStats = { latest: number | null; best: number | null }

export type FlexStats = {
  sessionsThisWeek: number /* distinct dates with an entry in the current Mon–Sun week */
  weeklyGoal: number /* default 2 */
  coldSplit: MetricStats
  warmSplit: MetricStats
  coldTailorsLeft: MetricStats
  coldTailorsRight: MetricStats
  /** Warm tailor's readings — the headline numbers, as with the split. */
  tailorsLeft: MetricStats
  tailorsRight: MetricStats
  coldToeTouch: MetricStats
  /** The warm fold — and remember its best is its *lowest* (see flexMetrics). */
  warmToeTouch: MetricStats
  coldLegLiftLeft: MetricStats
  coldLegLiftRight: MetricStats
  /** Warm leg lifts — the headline pair for that pose. */
  legLiftLeft: MetricStats
  legLiftRight: MetricStats
}

/**
 * latest = value from the newest-dated entry with a non-null value; best = the
 * deepest non-null value, which is the *smallest* one for a metric that improves
 * downward (the toe touch). Hence the direction rather than a bare `>`.
 */
function metricStats(
  entries: FlexEntry[],
  value: (e: FlexEntry) => number | null,
  dir: MetricDir = HIGHER_IS_BETTER,
): MetricStats {
  let latest: number | null = null
  let latestDate: string | null = null
  let best: number | null = null
  for (const e of entries) {
    const v = value(e)
    if (v == null) continue
    if (best == null || dir.beats(v, best)) best = v
    if (latestDate === null || e.date > latestDate) {
      latestDate = e.date
      latest = v
    }
  }
  return { latest, best }
}

export function flexStats(
  entries: FlexEntry[],
  today: Date = new Date(),
  opts?: { weeklyGoal?: number },
): FlexStats {
  const weeklyGoal = opts?.weeklyGoal ?? 2
  const thisWeek = weekStartISO(toISODate(today))

  const inWeekDates = new Set<string>()
  for (const e of entries) {
    if (weekStartISO(e.date) === thisWeek) inWeekDates.add(e.date)
  }

  return {
    sessionsThisWeek: inWeekDates.size,
    weeklyGoal,
    coldSplit: metricStats(entries, coldSplitOf),
    warmSplit: metricStats(entries, warmSplitOf),
    coldTailorsLeft: metricStats(entries, coldTailorsLeftOf),
    coldTailorsRight: metricStats(entries, coldTailorsRightOf),
    tailorsLeft: metricStats(entries, warmTailorsLeftOf),
    tailorsRight: metricStats(entries, warmTailorsRightOf),
    coldToeTouch: metricStats(entries, coldToeTouchOf, LOWER_IS_BETTER),
    warmToeTouch: metricStats(entries, warmToeTouchOf, LOWER_IS_BETTER),
    coldLegLiftLeft: metricStats(entries, coldLegLiftLeftOf),
    coldLegLiftRight: metricStats(entries, coldLegLiftRightOf),
    legLiftLeft: metricStats(entries, warmLegLiftLeftOf),
    legLiftRight: metricStats(entries, warmLegLiftRightOf),
  }
}

/** One split chart row per date, carrying the cold and/or warm reading. */
export type SplitPoint = { date: string; cold: number | null; warm: number | null }

/**
 * Cold + warm split per date, for the two-line split chart. Entries with neither
 * reading are dropped. Sorted ascending by date.
 */
export function splitSeries(entries: FlexEntry[]): SplitPoint[] {
  const out: SplitPoint[] = []
  for (const e of entries) {
    const cold = coldSplitOf(e)
    const warm = warmSplitOf(e)
    if (cold == null && warm == null) continue
    out.push({ date: e.date, cold, warm })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Non-null warm-split values as {date, value}, sorted ascending — for goal projections. */
export function warmSplitSeries(entries: FlexEntry[]): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = []
  for (const e of entries) {
    const warm = warmSplitOf(e)
    if (warm == null) continue
    out.push({ date: e.date, value: warm })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** One tailor's chart row per date, carrying both cold and warm left/right. */
export type TailorsPoint = {
  date: string
  coldLeft: number | null
  coldRight: number | null
  warmLeft: number | null
  warmRight: number | null
}

/**
 * Cold + warm tailor's readings per date, for the tailor's chart. Entries with
 * no reading at all are dropped. Sorted ascending by date.
 */
export function tailorsSeries(entries: FlexEntry[]): TailorsPoint[] {
  const out: TailorsPoint[] = []
  for (const e of entries) {
    const row = {
      date: e.date,
      coldLeft: coldTailorsLeftOf(e),
      coldRight: coldTailorsRightOf(e),
      warmLeft: warmTailorsLeftOf(e),
      warmRight: warmTailorsRightOf(e),
    }
    if (row.coldLeft == null && row.coldRight == null && row.warmLeft == null && row.warmRight == null) {
      continue
    }
    out.push(row)
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * For each entry with at least one warm tailor's value, the average of the
 * available left/right values — the series goal projections run on. Sorted
 * ascending by date.
 */
export function tailorsAvgSeries(
  entries: FlexEntry[],
): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = []
  for (const e of entries) {
    const vals: number[] = []
    const left = warmTailorsLeftOf(e)
    const right = warmTailorsRightOf(e)
    if (left != null) vals.push(left)
    if (right != null) vals.push(right)
    if (vals.length === 0) continue
    out.push({
      date: e.date,
      value: vals.reduce((s, v) => s + v, 0) / vals.length,
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** One toe-touch chart row per date — shaped like SplitPoint, and read the same way. */
export type ToeTouchPoint = { date: string; cold: number | null; warm: number | null }

/**
 * Cold + warm toe touch per date. Entries with neither reading are dropped.
 * Sorted ascending by date — and note the line descends as the fold deepens.
 */
export function toeTouchSeries(entries: FlexEntry[]): ToeTouchPoint[] {
  const out: ToeTouchPoint[] = []
  for (const e of entries) {
    const cold = coldToeTouchOf(e)
    const warm = warmToeTouchOf(e)
    if (cold == null && warm == null) continue
    out.push({ date: e.date, cold, warm })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** One leg-lift chart row per date, carrying both cold and warm left/right. */
export type LegLiftPoint = {
  date: string
  coldLeft: number | null
  coldRight: number | null
  warmLeft: number | null
  warmRight: number | null
}

/**
 * Cold + warm leg-lift readings per date. Entries with no reading at all are
 * dropped. Sorted ascending by date.
 */
export function legLiftSeries(entries: FlexEntry[]): LegLiftPoint[] {
  const out: LegLiftPoint[] = []
  for (const e of entries) {
    const row = {
      date: e.date,
      coldLeft: coldLegLiftLeftOf(e),
      coldRight: coldLegLiftRightOf(e),
      warmLeft: warmLegLiftLeftOf(e),
      warmRight: warmLegLiftRightOf(e),
    }
    if (row.coldLeft == null && row.coldRight == null && row.warmLeft == null && row.warmRight == null) {
      continue
    }
    out.push(row)
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}
