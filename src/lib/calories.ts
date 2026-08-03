import { parseISODate, toISODate, weekStartISO } from './dates'

export type CalorieEntry = { date: string /* YYYY-MM-DD */; calories: number; label?: string }

export const CALORIE_GOAL = 4000

/** Eating window (hours) used to pace calories through the day. */
export const EAT_START_HOUR = 9
export const EAT_END_HOUR = 21

/**
 * Fraction of the eating window (default 9am–9pm) elapsed at `now`, clamped to
 * 0..1. Multiply by the goal to get where you "should" be to finish on time.
 */
export function caloriePaceFraction(now: Date = new Date(), startHour = EAT_START_HOUR, endHour = EAT_END_HOUR): number {
  const h = now.getHours() + now.getMinutes() / 60
  if (h <= startHour) return 0
  if (h >= endHour) return 1
  return (h - startHour) / (endHour - startHour)
}

/** True when a calorie value is usable (finite and non-negative). */
function isValidCalories(calories: number): boolean {
  return Number.isFinite(calories) && calories >= 0
}

/** Sum calories per date. Invalid (non-finite/negative) values are ignored. */
export function dayTotals(entries: CalorieEntry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (!isValidCalories(entry.calories)) continue
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.calories)
  }
  return totals
}

/** Summed calories for a single date. */
export function totalForDate(entries: CalorieEntry[], date: string): number {
  return dayTotals(entries).get(date) ?? 0
}

/**
 * Replace every entry for `date` with a single running-total entry. Used when
 * logging: a day's calories are stored as one total row, not one row per tap,
 * so the same-day quick-adds collapse into a single entry that we upsert.
 */
export function setDayTotal(entries: CalorieEntry[], date: string, total: number): CalorieEntry[] {
  return [...entries.filter((e) => e.date !== date), { date, calories: total }]
}

/**
 * Merge `local` calorie state with a `server` fetch into one entry per date.
 * `local` wins for any date it already has, and the server only contributes
 * dates the local cache is missing. Because a day's total can now move down
 * (the −100 correction) as well as up, we can't assume the higher value is the
 * newer one — so the logging device's own state is authoritative for dates it
 * has touched, and an in-flight tap the server hasn't stored yet is never
 * clobbered by a stale fetch. (Trade-off: a same-date edit made on another
 * device won't overwrite this device's cached value until the cache is cleared;
 * acceptable for a single-logging-device app.) Totals are summed per date, so
 * legacy multi-row dates collapse to a single entry and the cache self-migrates.
 */
export function mergeCaloriesByDate(local: CalorieEntry[], server: CalorieEntry[]): CalorieEntry[] {
  const localTotals = dayTotals(local)
  const serverTotals = dayTotals(server)
  const dates = new Set<string>([...localTotals.keys(), ...serverTotals.keys()])
  const out: CalorieEntry[] = []
  for (const date of dates) {
    const total = localTotals.has(date) ? localTotals.get(date)! : serverTotals.get(date)!
    out.push({ date, calories: total })
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
}

/** Distinct dates whose summed total meets or exceeds `goal`, sorted ascending. */
export function calorieHitDates(entries: CalorieEntry[], goal: number = CALORIE_GOAL): string[] {
  const hits: string[] = []
  for (const [date, total] of dayTotals(entries)) {
    if (total >= goal) hits.push(date)
  }
  return hits.sort()
}

/**
 * A "calorie PR": the highest single-day total in the current week (week of
 * `today`), if that total is >= goal AND strictly greater than the highest
 * single-day total on any day before this week. Returns that day, else null.
 */
export function caloriePR(
  entries: CalorieEntry[],
  today: Date = new Date(),
  goal: number = CALORIE_GOAL,
): { date: string; calories: number } | null {
  const totals = dayTotals(entries)
  const thisWeekStart = weekStartISO(toISODate(today))

  let thisWeekMaxDate: string | null = null
  let thisWeekMax = -Infinity
  let priorMax = -Infinity

  for (const [date, total] of totals) {
    const weekStart = weekStartISO(date)
    if (weekStart === thisWeekStart) {
      // Prefer the latest date on ties.
      if (total > thisWeekMax || (total === thisWeekMax && (thisWeekMaxDate === null || date > thisWeekMaxDate))) {
        thisWeekMax = total
        thisWeekMaxDate = date
      }
    } else if (date < thisWeekStart) {
      if (total > priorMax) priorMax = total
    }
  }

  if (thisWeekMaxDate === null) return null
  if (thisWeekMax >= goal && thisWeekMax > priorMax) {
    return { date: thisWeekMaxDate, calories: thisWeekMax }
  }
  return null
}

/**
 * A trailing 7-day rolling average of daily surplus (intake − goal), one point
 * per logged calorie day, sorted oldest → newest. Centered on zero: positive =
 * eating above goal (feeding a bulk), negative = deficit. The average is taken
 * over *logged* days in the trailing 7-calendar-day window — unlogged days are
 * skipped rather than counted as a zero-intake deficit, so gaps don't drag the
 * trend down. Smooths spiky day-to-day intake into a trend that tracks how body
 * weight / body fat actually respond, for overlaying on the progress charts.
 */
export function calorieSurplusSeries(
  entries: CalorieEntry[],
  goal: number = CALORIE_GOAL,
): { date: string; value: number }[] {
  const totals = dayTotals(entries)
  const dated = [...totals.entries()]
    .map(([date, total]) => ({ date, t: parseISODate(date).getTime(), total }))
    .sort((a, b) => a.t - b.t)

  const WINDOW_MS = 6 * 24 * 60 * 60 * 1000 // 6 days back + the day itself = 7
  return dated.map(({ date, t }) => {
    let sum = 0
    let n = 0
    for (const d of dated) {
      if (d.t >= t - WINDOW_MS && d.t <= t) {
        sum += d.total - goal
        n++
      }
    }
    return { date, value: Math.round(sum / n) }
  })
}

/**
 * What an unlogged day is assumed to have contained. A day with nothing logged
 * almost certainly wasn't a fast — it was a day the logging didn't happen — so
 * counting it as zero would invent a huge deficit. 2500 is a plausible
 * didn't-track-it day: real eating, but well short of the bulk goal, so a gap
 * still reads as a week that fell behind rather than one that never happened.
 */
export const ASSUMED_UNLOGGED_CALORIES = 2500

/**
 * Average daily surplus (intake − goal) per WEEK, one point per Mon–Sun week
 * keyed by its Monday, sorted oldest → newest.
 *
 * Two deliberate differences from the daily series above:
 *
 * - **Only complete days count.** Today is still being eaten, so including it
 *   would drag every week down until bedtime. The window ends at yesterday.
 * - **Unlogged days count as {@link ASSUMED_UNLOGGED_CALORIES}** rather than
 *   being skipped. Skipping them makes a badly-tracked week look identical to a
 *   well-fed one; assuming a modest intake reflects that a missed log is usually
 *   a missed *day*, not a missed meal.
 *
 * Weekly rather than daily because day-to-day intake is far too spiky to read
 * anything from against a body-weight trend that moves over weeks.
 */
export function weeklyCalorieSurplusSeries(
  entries: CalorieEntry[],
  opts: { goal?: number; assumedUnlogged?: number; today?: Date } = {},
): { date: string; value: number }[] {
  const goal = opts.goal ?? CALORIE_GOAL
  const assumed = opts.assumedUnlogged ?? ASSUMED_UNLOGGED_CALORIES
  const today = opts.today ?? new Date()

  const totals = dayTotals(entries)
  if (totals.size === 0) return []

  // Yesterday is the last day that has actually finished.
  const lastComplete = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const first = [...totals.keys()].sort()[0]
  const start = parseISODate(first)
  if (start > lastComplete) return []

  // Walk every complete day from the first logged one, bucketing into weeks.
  const weeks = new Map<string, { sum: number; days: number }>()
  for (const d = new Date(start); d <= lastComplete; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d)
    const intake = totals.get(iso) ?? assumed
    const wk = weekStartISO(iso)
    const bucket = weeks.get(wk) ?? { sum: 0, days: 0 }
    bucket.sum += intake - goal
    bucket.days += 1
    weeks.set(wk, bucket)
  }

  return [...weeks.entries()]
    .map(([date, { sum, days }]) => ({ date, value: Math.round(sum / days) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
