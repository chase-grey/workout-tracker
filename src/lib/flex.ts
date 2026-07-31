import { weekStartISO, toISODate } from './dates'

/** A single flexibility log entry, tracking multiple stretch angles. */
export type FlexEntry = {
  date: string /* YYYY-MM-DD */
  splitDeg: number | null /* legacy/untagged side-split angle; counts as warm */
  coldSplitDeg?: number | null /* side split measured cold, at the start */
  warmSplitDeg?: number | null /* side split measured warm, at the end */
  tailorsLeftDeg: number | null /* tailor's pose, left */
  tailorsRightDeg: number | null /* tailor's pose, right */
  note?: string
}

/** The angle fields carried by a FlexEntry. */
const ANGLE_FIELDS = [
  'splitDeg',
  'coldSplitDeg',
  'warmSplitDeg',
  'tailorsLeftDeg',
  'tailorsRightDeg',
] as const
type AngleField = (typeof ANGLE_FIELDS)[number]

/**
 * The warm split for an entry: the warm reading when present, otherwise the
 * legacy untagged split (older data and manual logs count as warm).
 */
export const warmSplitOf = (e: FlexEntry): number | null => e.warmSplitDeg ?? e.splitDeg ?? null

/** The cold split for an entry, or null if none was captured. */
export const coldSplitOf = (e: FlexEntry): number | null => e.coldSplitDeg ?? null

/**
 * Collapse to one merged entry per date. For each angle field, keep the latest
 * non-null value seen for that date; keep the latest non-empty note. A date's
 * entries are merged in input order, so later entries win. Sorted ascending by
 * date.
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
        ...(e.note != null && e.note !== '' ? { note: e.note } : {}),
      })
      continue
    }
    for (const f of ANGLE_FIELDS) {
      if (e[f] != null) prev[f] = e[f]
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
  tailorsLeft: MetricStats
  tailorsRight: MetricStats
}

/** latest = value from the newest-dated entry with a non-null value; best = max non-null value. */
function metricStats(entries: FlexEntry[], value: (e: FlexEntry) => number | null): MetricStats {
  let latest: number | null = null
  let latestDate: string | null = null
  let best: number | null = null
  for (const e of entries) {
    const v = value(e)
    if (v == null) continue
    if (best == null || v > best) best = v
    if (latestDate === null || e.date > latestDate) {
      latestDate = e.date
      latest = v
    }
  }
  return { latest, best }
}

/** Selector for a plain angle field, tolerating older entries missing the key. */
const field = (f: AngleField) => (e: FlexEntry) => e[f] ?? null

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
    tailorsLeft: metricStats(entries, field('tailorsLeftDeg')),
    tailorsRight: metricStats(entries, field('tailorsRightDeg')),
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

/**
 * For each entry with at least one tailor's value, the average of the available
 * left/right values. Sorted ascending by date.
 */
export function tailorsAvgSeries(
  entries: FlexEntry[],
): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = []
  for (const e of entries) {
    const vals: number[] = []
    if (e.tailorsLeftDeg != null) vals.push(e.tailorsLeftDeg)
    if (e.tailorsRightDeg != null) vals.push(e.tailorsRightDeg)
    if (vals.length === 0) continue
    out.push({
      date: e.date,
      value: vals.reduce((s, v) => s + v, 0) / vals.length,
    })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}
