/**
 * Date helpers, computed in local time.
 *
 * A week starts on the day the person chose in Settings, Monday unless they
 * say otherwise. Every week boundary in the app comes from {@link weekStartOf}
 * (or {@link weekStartISO}, the same thing on ISO strings), which read that
 * choice from here the way goals read lib/profileStore: the helpers are called
 * with a date and nothing else from most of lib. DataContext keeps the choice
 * in step with Settings.
 *
 * Nothing logged is stored by week. Entries carry their own dates and are
 * sorted into weeks on every read, so a different start day re-reads the same
 * history on the new boundaries: each day falls in exactly one week either
 * way. The few things that are saved under a week's first day (a goal's
 * `from`, a week's own schedule) are matched by the week that date falls in
 * rather than by the key itself; see {@link sameWeek}.
 */

/** A day of the week as `Date.getDay()` numbers it: 0 = Sunday … 6 = Saturday. */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const DEFAULT_WEEK_START: WeekStartDay = 1

let activeStart: WeekStartDay = DEFAULT_WEEK_START

/** Anything that isn't a day of the week reads as Monday. */
export function normalizeWeekStart(day: unknown): WeekStartDay {
  return typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6
    ? (day as WeekStartDay)
    : DEFAULT_WEEK_START
}

/** Set the day weeks start on for every helper below. Unset or invalid is Monday. */
export function setWeekStartDay(day: unknown): void {
  activeStart = normalizeWeekStart(day)
}

export function weekStartDay(): WeekStartDay {
  return activeStart
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a `YYYY-MM-DD` string as a local date (no timezone drift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Days from `from` to `to` (negative when `to` precedes `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86400000)
}

/**
 * The first day (local midnight) of the week containing `d`, for a week that
 * starts on `startDay`: the chosen day by default.
 */
export function weekStartOf(d: Date, startDay: WeekStartDay = activeStart): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  date.setDate(date.getDate() - ((date.getDay() - startDay + 7) % 7))
  return date
}

/**
 * The start of the week containing `d`. The name is from when every week began
 * on Monday; it follows the chosen start day like everything else. For a true
 * Monday whatever the setting, see {@link mondayISO}.
 */
export function mondayOf(d: Date): Date {
  return weekStartOf(d)
}

/** ISO date of the first day of the week containing `dateStr`. */
export function weekStartISO(dateStr: string, startDay: WeekStartDay = activeStart): string {
  return toISODate(weekStartOf(parseISODate(dateStr), startDay))
}

/**
 * ISO date of the Monday on or before `dateStr`, whatever the chosen start
 * day. For structures that are saved in Monday weeks of their own (the cardio
 * plan's training weeks), not for anything shown as "this week".
 */
export function mondayISO(dateStr: string): string {
  return weekStartISO(dateStr, 1)
}

/** `iso` moved by `n` days. */
export function addDaysISO(iso: string, n: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** The seven dates of the week containing `dateStr`, first day first. */
export function weekDatesISO(dateStr: string, startDay: WeekStartDay = activeStart): string[] {
  const start = weekStartISO(dateStr, startDay)
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))
}

/**
 * Whether two dates fall in the same week. How a saved week key is matched: a
 * key written as a Monday still names its week after the start day moves.
 */
export function sameWeek(a: string, b: string, startDay: WeekStartDay = activeStart): boolean {
  return weekStartISO(a, startDay) === weekStartISO(b, startDay)
}

/**
 * The days of the week in the order a week runs, as `getDay()` numbers:
 * `[1, 2, 3, 4, 5, 6, 0]` for a Monday start, `[0, 1, …, 6]` for Sunday.
 */
export function weekdayOrder(startDay: WeekStartDay = activeStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (startDay + i) % 7)
}

/**
 * The same order in Monday-first numbering (0 = Monday … 6 = Sunday), which is
 * how schedules and the cardio plan store a weekday. For laying out a row of
 * day chips or a header in the week's own order.
 */
export function mondayIndexOrder(startDay: WeekStartDay = activeStart): number[] {
  return weekdayOrder(startDay).map((d) => (d + 6) % 7)
}

/** Day of the week of `iso` in Monday-first numbering: 0 = Monday … 6 = Sunday. */
export function mondayIndexOf(iso: string): number {
  return (parseISODate(iso).getDay() + 6) % 7
}

/** Every week start from `startISO` through `endISO`, inclusive, a week apart. */
export function enumerateWeeks(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const cur = parseISODate(startISO)
  const end = parseISODate(endISO)
  while (cur <= end) {
    out.push(toISODate(cur))
    cur.setDate(cur.getDate() + 7)
  }
  return out
}
