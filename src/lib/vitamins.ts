/**
 * The pill habit: a multivitamin every day, and iron on alternating days.
 *
 * One row per date, holding what was actually swallowed — which of the two is
 * separate from which of the two was *owed*, because iron is owed every other
 * day and the schedule is read back out of the log rather than off a calendar.
 * See {@link isIronDay} for why.
 *
 * Pure module — no React/DOM, no storage.
 */

import { parseISODate, toISODate, weekStartISO } from './dates'

export type VitaminEntry = {
  date: string /* YYYY-MM-DD */
  /** Whether the daily multivitamin was taken that day. */
  vitamins: boolean
  /** Whether the alternating-day iron was taken that day. */
  iron: boolean
  /**
   * ISO timestamp of the tap that last changed this date, set only when the tap
   * happened ON that date — a backfill says nothing about when the pills were
   * actually swallowed. Absent on rows that predate the field.
   */
  loggedAt?: string
}

/**
 * Days of the week the pills have to be taken. Six rather than seven: one day
 * off a week is a missed dose, not a broken habit, and a goal that can only ever
 * be met perfectly is one bad morning from being abandoned.
 */
export const VITAMIN_DAYS_GOAL = 6

/** Days of the week that still count as a partial week (see weeklyStreak). */
export const HALF_VITAMIN_DAYS = 5

/** The calendar day before `date`, ISO. */
function dayBefore(date: string): string {
  const d = parseISODate(date)
  d.setDate(d.getDate() - 1)
  return toISODate(d)
}

/** One row per date, later entries winning — the merge every caller reads through. */
export function dedupeVitaminsByDate(entries: VitaminEntry[]): VitaminEntry[] {
  const byDate = new Map<string, VitaminEntry>()
  for (const e of entries) byDate.set(e.date, e)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** The row stored for `date`, or null when that day was never logged. */
export function entryFor(entries: VitaminEntry[], date: string): VitaminEntry | null {
  let found: VitaminEntry | null = null
  for (const e of entries) if (e.date === date) found = e
  return found
}

/** Whether the multivitamin was taken on `date`. */
export function tookVitamins(entries: VitaminEntry[], date: string): boolean {
  return entryFor(entries, date)?.vitamins === true
}

/** Whether iron was taken on `date`. */
export function tookIron(entries: VitaminEntry[], date: string): boolean {
  return entryFor(entries, date)?.iron === true
}

/**
 * Whether `date` is one of the alternating iron days.
 *
 * Read off the log rather than off the calendar's parity: iron alternates, so a
 * day asks for it unless yesterday already had it. A fixed even/odd schedule
 * would keep insisting on days that were missed — skip Wednesday's dose and
 * Thursday still reads as an off day, leaving a two-day gap the calendar thinks
 * is on plan. Reading yesterday instead makes the schedule self-correcting: a
 * missed day rolls the dose to the next one, and two iron days can never land
 * back to back.
 *
 * A day that recorded iron is an iron day by definition, whatever the day before
 * did — so this stays true of a past day rather than re-deciding its history.
 */
export function isIronDay(entries: VitaminEntry[], date: string): boolean {
  return tookIron(entries, date) || !tookIron(entries, dayBefore(date))
}

/** What a single day owes and what it has, for the card and the day strip. */
export type VitaminDayState = {
  date: string
  vitamins: boolean
  iron: boolean
  /** Whether iron is on the schedule for this day (see {@link isIronDay}). */
  ironDay: boolean
  /** Scheduled iron that hasn't been taken yet. */
  ironDue: boolean
  /** Everything this day asked for is in — what makes the day count. */
  done: boolean
}

export function vitaminDayState(entries: VitaminEntry[], date: string): VitaminDayState {
  const vitamins = tookVitamins(entries, date)
  const iron = tookIron(entries, date)
  const ironDay = isIronDay(entries, date)
  return {
    date,
    vitamins,
    iron,
    ironDay,
    ironDue: ironDay && !iron,
    done: vitamins && (!ironDay || iron),
  }
}

/**
 * Distinct dates that took everything they owed, ascending — the days the weekly
 * goal counts.
 *
 * The multivitamin alone isn't enough on an iron day. Iron is the dose that's
 * easy to skip precisely because it isn't every day, so a day that quietly
 * dropped it must not read as a day that went to plan.
 */
export function vitaminGoalDates(entries: VitaminEntry[]): string[] {
  return dedupeVitaminsByDate(entries)
    .filter((e) => vitaminDayState(entries, e.date).done)
    .map((e) => e.date)
}

/** How many days of the Mon–Sun week containing `today` took everything owed. */
export function vitaminDaysInWeek(entries: VitaminEntry[], today: Date = new Date()): number {
  const week = weekStartISO(toISODate(today))
  return vitaminGoalDates(entries).filter((d) => weekStartISO(d) === week).length
}

/**
 * `entries` with `date`'s row set to `patch` merged over whatever it held, as a
 * single row for that date. Absent fields keep their stored value, so logging
 * iron on a day whose multivitamin is already in doesn't take the multivitamin
 * back off.
 *
 * Omitting `loggedAt` keeps the timestamp the date already had rather than
 * clearing it — a backfill can't erase a real same-day log time.
 */
export function setVitaminDay(
  entries: VitaminEntry[],
  date: string,
  patch: { vitamins?: boolean; iron?: boolean },
  loggedAt?: string,
): VitaminEntry[] {
  const prev = entryFor(entries, date)
  const at = loggedAt ?? prev?.loggedAt
  const entry: VitaminEntry = {
    date,
    vitamins: patch.vitamins ?? prev?.vitamins ?? false,
    iron: patch.iron ?? prev?.iron ?? false,
  }
  if (at) entry.loggedAt = at
  return dedupeVitaminsByDate([...entries.filter((e) => e.date !== date), entry])
}

/** The single row for `date` after applying `patch` — what gets sent to the backend. */
export function vitaminEntryFor(
  entries: VitaminEntry[],
  date: string,
  patch: { vitamins?: boolean; iron?: boolean },
  loggedAt?: string,
): VitaminEntry {
  return entryFor(setVitaminDay(entries, date, patch, loggedAt), date)!
}
