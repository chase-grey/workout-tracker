/**
 * The whitening-strip habit: one strip a day, six days of the week.
 *
 * One row per date holding whether that day's strip went on. Simpler than the
 * pill log next door — there is only one thing to do a day, so a date's row is
 * one boolean and the day is either in or it isn't. The two habits are kept in
 * separate modules rather than folded into a shared "daily checkbox" because
 * they are separate goals with separate histories, and a log that stored them
 * together could not answer when each one started being tracked (see
 * weeklyStreak.weeklyStreakHistory, which needs exactly that).
 *
 * Pure module — no React/DOM, no storage.
 */

import { toISODate, weekStartISO } from './dates'

export type WhiteningEntry = {
  date: string /* YYYY-MM-DD */
  /** Whether the day's strip was used. */
  strips: boolean
  /**
   * ISO timestamp of the tap that last changed this date, set only when the tap
   * happened ON that date — a backfill says nothing about when the strip was
   * actually worn. Absent on rows that predate the field.
   */
  loggedAt?: string
}

/**
 * Days of the week the strips have to go on. Six rather than seven, for the same
 * reason the pills ask for six: one day off a week is a skipped strip, not a
 * broken habit, and a goal that can only ever be met perfectly is one bad
 * evening from being abandoned.
 */
export const WHITENING_DAYS_GOAL = 6

/** Days of the week that still count as a partial week (see weeklyStreak). */
export const HALF_WHITENING_DAYS = 5

/** One row per date, later entries winning — the merge every caller reads through. */
export function dedupeWhiteningByDate(entries: WhiteningEntry[]): WhiteningEntry[] {
  const byDate = new Map<string, WhiteningEntry>()
  for (const e of entries) byDate.set(e.date, e)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** The row stored for `date`, or null when that day was never logged. */
export function whiteningEntryOn(
  entries: WhiteningEntry[],
  date: string,
): WhiteningEntry | null {
  let found: WhiteningEntry | null = null
  for (const e of entries) if (e.date === date) found = e
  return found
}

/** Whether the strip was used on `date`. */
export function usedStrips(entries: WhiteningEntry[], date: string): boolean {
  return whiteningEntryOn(entries, date)?.strips === true
}

/** Distinct dates the strip went on, ascending — the days the weekly goal counts. */
export function whiteningGoalDates(entries: WhiteningEntry[]): string[] {
  return dedupeWhiteningByDate(entries)
    .filter((e) => e.strips)
    .map((e) => e.date)
}

/** How many days of the Mon–Sun week containing `today` used the strip. */
export function whiteningDaysInWeek(
  entries: WhiteningEntry[],
  today: Date = new Date(),
): number {
  const week = weekStartISO(toISODate(today))
  return whiteningGoalDates(entries).filter((d) => weekStartISO(d) === week).length
}

/**
 * `entries` with `date`'s row set to `strips`, as a single row for that date.
 *
 * Omitting `loggedAt` keeps the timestamp the date already had rather than
 * clearing it — a backfill can't erase a real same-day log time.
 */
export function setWhiteningDay(
  entries: WhiteningEntry[],
  date: string,
  strips: boolean,
  loggedAt?: string,
): WhiteningEntry[] {
  const at = loggedAt ?? whiteningEntryOn(entries, date)?.loggedAt
  const entry: WhiteningEntry = { date, strips }
  if (at) entry.loggedAt = at
  return dedupeWhiteningByDate([...entries.filter((e) => e.date !== date), entry])
}

/** The single row for `date` after the change — what gets sent to the backend. */
export function whiteningEntryFor(
  entries: WhiteningEntry[],
  date: string,
  strips: boolean,
  loggedAt?: string,
): WhiteningEntry {
  return whiteningEntryOn(setWhiteningDay(entries, date, strips, loggedAt), date)!
}
