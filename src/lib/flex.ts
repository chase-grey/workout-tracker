import { weekStartISO, toISODate } from './dates'

/** A single flexibility log entry, tracking multiple stretch angles. */
export type FlexEntry = {
  date: string /* YYYY-MM-DD */
  splitDeg: number | null /* side-split angle */
  tailorsLeftDeg: number | null /* tailor's pose, left */
  tailorsRightDeg: number | null /* tailor's pose, right */
  note?: string
}

/** The angle fields carried by a FlexEntry. */
const ANGLE_FIELDS = ['splitDeg', 'tailorsLeftDeg', 'tailorsRightDeg'] as const
type AngleField = (typeof ANGLE_FIELDS)[number]

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
  split: MetricStats
  tailorsLeft: MetricStats
  tailorsRight: MetricStats
}

/** latest = value from the newest-dated entry with a non-null value; best = max non-null value. */
function metricStats(entries: FlexEntry[], field: AngleField): MetricStats {
  let latest: number | null = null
  let latestDate: string | null = null
  let best: number | null = null
  for (const e of entries) {
    const v = e[field]
    if (v == null) continue
    if (best == null || v > best) best = v
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
    split: metricStats(entries, 'splitDeg'),
    tailorsLeft: metricStats(entries, 'tailorsLeftDeg'),
    tailorsRight: metricStats(entries, 'tailorsRightDeg'),
  }
}

/** Non-null splitDeg values as {date, value}, sorted ascending by date. */
export function splitSeries(
  entries: FlexEntry[],
): { date: string; value: number }[] {
  return entries
    .filter((e): e is FlexEntry & { splitDeg: number } => e.splitDeg != null)
    .map((e) => ({ date: e.date, value: e.splitDeg }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
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
