import { parseISODate, toISODate, weekStartISO } from './dates'

export type CalorieEntry = {
  date: string /* YYYY-MM-DD */
  calories: number
  label?: string
  /**
   * ISO timestamp of the most recent tap that changed this date's total, set
   * only when the tap happened ON that date. Backfilling an earlier day leaves
   * it alone: "logged at 3:40pm" has to mean 3:40pm on the day being shown, not
   * the moment someone went back and corrected it. Absent on entries that
   * predate the field.
   */
  loggedAt?: string
  /**
   * How many calories the tap at {@link loggedAt} added — the last helping, not
   * the day's running total. Signed, so a −100 correction records -100. It is
   * half of one fact with `loggedAt` and is kept, replaced and dropped with it.
   */
  lastAmount?: number
}

export const CALORIE_GOAL = 4000

/** Eating window (hours) used to pace calories through the day. */
export const EAT_START_HOUR = 9
export const EAT_END_HOUR = 21

/** Hours without a log, inside the eating window, before it reads as a missed meal. */
export const STALE_LOG_HOURS = 4

/**
 * Hour of day before which a day with nothing logged at all says nothing. Early
 * in the morning an empty day is just an early morning, not a missed meal, so
 * warning about it is clutter. Past this hour it's a real gap worth flagging.
 */
export const EMPTY_LOG_NAG_HOUR = 11

/** True once it's late enough in the day for a day with nothing logged to be worth flagging. */
export function isEmptyDayNagTime(now: Date = new Date()): boolean {
  const h = now.getHours() + now.getMinutes() / 60
  return h >= EMPTY_LOG_NAG_HOUR && h <= EAT_END_HOUR
}

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

/** A wall-clock time, lowercase 12-hour: `3:40 pm`. */
export function formatClock(d: Date): string {
  const h24 = d.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m} ${h24 < 12 ? 'am' : 'pm'}`
}

/** How long ago `then` was, at a glance: `just now`, `45m ago`, `2h 5m ago`, `3d ago`. */
export function formatElapsed(then: Date, now: Date = new Date()): string {
  const min = Math.floor((now.getTime() - then.getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) {
    const rem = min % 60
    return rem ? `${h}h ${rem}m ago` : `${h}h ago`
  }
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

/**
 * True when it's been {@link STALE_LOG_HOURS} or more since the last log while
 * the eating window is open — the "you probably forgot a meal" signal. Outside
 * the window a long gap is just the overnight fast, so nothing is flagged.
 * A day with nothing logged at all (`last` = null) has no gap to measure, so it
 * waits on the clock instead: nothing is flagged until {@link EMPTY_LOG_NAG_HOUR}.
 */
export function isFoodLogStale(last: Date | null, now: Date = new Date()): boolean {
  const h = now.getHours() + now.getMinutes() / 60
  if (h < EAT_START_HOUR || h > EAT_END_HOUR) return false
  if (!last) return isEmptyDayNagTime(now)
  return now.getTime() - last.getTime() >= STALE_LOG_HOURS * 3600_000
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
 * The last value recorded for each date, in array order — the right reducer for
 * a *fetch*, where {@link dayTotals}'s sum is not just redundant but ruinous.
 *
 * A day is stored as one running total, so several rows sharing a date are
 * successive snapshots of the same day, not separate meals: the newest one IS
 * the total. Summing them multiplies a day's intake by its tap count. That
 * isn't hypothetical — between the switch to running totals and the backend
 * redeploy that taught the sheet to upsert by date, every tap appended a row
 * carrying the whole running total, and 8/3/2026 read back as 35,000 calories.
 *
 * The local cache keeps a one-row-per-date invariant (see {@link setDayTotal}),
 * so summing it is a no-op and `dayTotals` stays the reducer there.
 */
function latestByDate(entries: CalorieEntry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (!isValidCalories(entry.calories)) continue
    totals.set(entry.date, entry.calories)
  }
  return totals
}

/** A date's last recorded tap: when it happened, and how big it was if known. */
type LastLog = { at: Date; amount?: number }

/**
 * The most recent tap recorded for `date`, or null when that day has no
 * timestamp (never logged, or logged before the field existed / only ever
 * backfilled). `amount` is absent when the row is older than that field.
 */
function lastLog(entries: CalorieEntry[], date: string): LastLog | null {
  let latest: LastLog | null = null
  for (const entry of entries) {
    if (entry.date !== date || !entry.loggedAt) continue
    const at = new Date(entry.loggedAt)
    if (Number.isNaN(at.getTime())) continue
    if (latest !== null && at <= latest.at) continue
    latest = Number.isFinite(entry.lastAmount) ? { at, amount: entry.lastAmount } : { at }
  }
  return latest
}

/** When `date` was last logged, or null — see {@link lastLog}. */
export function lastLoggedAt(entries: CalorieEntry[], date: string): Date | null {
  return lastLog(entries, date)?.at ?? null
}

/**
 * How close two taps have to be to count as one helping. Quick-adds are how a
 * plate gets logged: a 900-calorie dinner is +500 +100 +100 +100 +100 fired off
 * in a few seconds, and reporting the last of those as "+100 just now" says the
 * meal was a snack. Anything inside this window is the same sitting, so the
 * amounts add up and the card reports the plate. A tap an hour later is a
 * separate helping and starts its own count.
 */
export const HELPING_MERGE_MS = 3 * 60_000

/**
 * The helping to record for a tap of `amount` on `date`: the tap on its own, or
 * the running sum of the burst it belongs to (see {@link HELPING_MERGE_MS}).
 * Undefined when the burst nets to zero — a +100 undone by a −100 left the day
 * exactly as it found it, and "+0" is not a helping anyone ate — which leaves
 * the card saying only how long ago the day was last touched.
 *
 * A stamped day with no recorded amount predates the field and can't be added
 * to, so the tap stands alone rather than guessing at what came before it.
 */
export function coalesceHelping(
  entries: CalorieEntry[],
  date: string,
  amount: number,
  now: Date = new Date(),
): number | undefined {
  const last = lastLog(entries, date)
  const burst =
    last?.amount != null && now.getTime() - last.at.getTime() < HELPING_MERGE_MS ? last.amount : 0
  const total = burst + amount
  return total === 0 ? undefined : total
}

/** A logged helping the way the card writes it: `+500`, `−100`. */
export function formatHelping(calories: number): string {
  return calories < 0 ? `−${Math.abs(calories)}` : `+${calories}`
}

/**
 * What the calorie card says about the day it's showing, and whether to flag it.
 *
 * For a past day there's nothing to report but the date. For today the line is
 * the last helping and how long it's been since — more useful than the word
 * "today", which the header position already implies, and the size answers the
 * question the gap raises: whether that hour-ago tap was a meal or a snack. A
 * day can have a total but no timestamp — logged before the field existed, or
 * only ever backfilled, or never touched at all — and then there's nothing
 * honest to say, so the label is empty and the card drops the line. A stamped
 * day predating the amount field still says how long ago, just not how much.
 */
export function foodLogStatus(
  entries: CalorieEntry[],
  date: string,
  now: Date = new Date(),
): { label: string; stale: boolean } {
  if (date !== toISODate(now)) return { label: date.slice(5), stale: false }

  const last = lastLog(entries, date)
  if (last) {
    const elapsed = formatElapsed(last.at, now)
    return {
      label: last.amount == null ? elapsed : `${formatHelping(last.amount)} · ${elapsed}`,
      stale: isFoodLogStale(last.at, now),
    }
  }

  return { label: '', stale: false }
}

/**
 * Replace every entry for `date` with a single running-total entry. Used when
 * logging: a day's calories are stored as one total row, not one row per tap,
 * so the same-day quick-adds collapse into a single entry that we upsert.
 *
 * Omitting `loggedAt` keeps whatever timestamp the date already had rather than
 * clearing it, so a backfill can't erase a real same-day log time. The helping
 * moves with the timestamp and never on its own: a backfill that kept the old
 * time but took this tap's amount would claim a helping the day never had.
 */
export function setDayTotal(
  entries: CalorieEntry[],
  date: string,
  total: number,
  loggedAt?: string,
  lastAmount?: number,
): CalorieEntry[] {
  const kept = loggedAt ? { at: loggedAt, amount: lastAmount } : lastLog(entries, date)
  const entry: CalorieEntry = { date, calories: total }
  if (kept) {
    entry.loggedAt = typeof kept.at === 'string' ? kept.at : kept.at.toISOString()
    if (Number.isFinite(kept.amount)) entry.lastAmount = kept.amount
  }
  return [...entries.filter((e) => e.date !== date), entry]
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
 *
 * The log timestamp is merged separately from the total, taking the newer of
 * the two sides (and bringing that side's helping with it): unlike the total it
 * only ever moves forward, so a device that hasn't logged today can still learn
 * when the logging device last did, and what it last ate.
 *
 * `serverWins` inverts the precedence for one fetch, letting the backend
 * overwrite dates this device already has. Local-wins is otherwise permanent:
 * a cache that recorded a wrong total once would keep it forever, with no fetch
 * able to correct it. Used to heal the caches written while the sheet was
 * returning per-tap rows — see {@link latestByDate}.
 */
export function mergeCaloriesByDate(
  local: CalorieEntry[],
  server: CalorieEntry[],
  opts: { serverWins?: boolean } = {},
): CalorieEntry[] {
  const localTotals = dayTotals(local)
  // Last-wins, not summed: a fetch can carry several rows for one date, and
  // each is the whole running total rather than a slice of it.
  const serverTotals = latestByDate(server)
  const dates = new Set<string>([...localTotals.keys(), ...serverTotals.keys()])
  const out: CalorieEntry[] = []
  for (const date of dates) {
    const preferServer = opts.serverWins && serverTotals.has(date)
    const total = !preferServer && localTotals.has(date) ? localTotals.get(date)! : serverTotals.get(date)!
    const localAt = lastLog(local, date)
    const serverAt = lastLog(server, date)
    const at = !localAt || (serverAt && serverAt.at > localAt.at) ? serverAt : localAt
    const entry: CalorieEntry = { date, calories: total }
    if (at) {
      entry.loggedAt = at.at.toISOString()
      if (Number.isFinite(at.amount)) entry.lastAmount = at.amount
    }
    out.push(entry)
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
 * How many days met the goal in each Mon–Sun week, keyed by that week's Monday.
 * Weeks with no qualifying day are absent rather than zero, so a lookup miss and
 * a washed-out week read the same.
 */
export function calorieHitsByWeek(entries: CalorieEntry[], goal: number = CALORIE_GOAL): Map<string, number> {
  const weeks = new Map<string, number>()
  for (const date of calorieHitDates(entries, goal)) {
    const week = weekStartISO(date)
    weeks.set(week, (weeks.get(week) ?? 0) + 1)
  }
  return weeks
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
