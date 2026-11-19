/**
 * The schedule, taken out of the app: as a file any calendar can import, and
 * as a two-way sync with Google Calendar.
 *
 * What leaves is what the week calendar shows from today on for the sessions
 * the app runs or logs — the days someone chose, and anything done today (see
 * lib/weekCalendar). Someone who chose no days has nothing ahead, and so
 * nothing to send.
 *
 * The sync is a three-way merge of sets. A session is a pillar on a date, and
 * three copies of that set exist: what the app shows now, what the Google
 * calendar holds now, and what both agreed on at the last sync (the base, kept
 * by the backend beside the account's token). Whatever differs from the base
 * on one side is that side's change, and both sides' changes are kept: an
 * event dragged to Friday in Google is a removal on Thursday and an addition
 * on Friday, which come back as that week's own days (WeekPins); a day tapped
 * in the app is an event to make. Sets have no conflicts to settle — the same
 * key added or removed on both sides is the same answer.
 *
 * One kind of session can't be moved from the calendar's side: a week the
 * cardio plan lays out takes its days from the plan (see lib/cardioPlan), so
 * there is nowhere in the app for a moved run to land. Those are `locked`: the
 * app's copy wins and the calendar is put back.
 *
 * Pure module. The network is services/api, the wiring features/today/CalendarSync.
 */

import { mondayIndexOf, parseISODate, toISODate, weekStartISO } from './dates'
import {
  PINNABLE,
  shiftWeek,
  weekCalendar,
  weekDates,
  type PinnablePillar,
  type PlannedCardio,
  type WeekCalendarInput,
} from './weekCalendar'

/** How many weeks ahead, this one included, are exported and kept in sync. */
export const SYNC_WEEKS = 8

/** One session on one day. Two of a pillar on a day are one event, titled with both. */
export type SyncEvent = { pillar: PinnablePillar; date: string; title: string }

/** An event as the Google calendar holds it. */
export type RemoteEvent = SyncEvent & { id: string }

/** "s:2026-11-19": short, because the base is stored whole in a script property. */
export function keyOf(e: { pillar: PinnablePillar; date: string }): string {
  return `${e.pillar[0]}:${e.date}`
}

function parseKey(key: string): { pillar: PinnablePillar; date: string } | null {
  const pillar = PINNABLE.find((p) => p[0] === key[0])
  const date = key.slice(2)
  return pillar && key[1] === ':' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { pillar, date } : null
}

const lockKey = (pillar: PinnablePillar, date: string) => `${pillar}:${weekStartISO(date)}`

export type Upcoming = {
  /** First and last date covered: today, and the Sunday that closes the last week. */
  from: string
  to: string
  events: SyncEvent[]
  /** Pillar-weeks whose days the app can't take from outside (see the module note). */
  locked: Set<string>
}

/**
 * The sessions on the calendar from today through the next {@link SYNC_WEEKS}
 * weeks, in date order.
 */
export function upcomingSessions(
  input: Omit<WeekCalendarInput, 'weekStart' | 'plannedCardio'>,
  cardioFor: (weekStart: string) => PlannedCardio[],
  weeks: number = SYNC_WEEKS,
): Upcoming {
  const first = weekStartISO(input.today)
  const byKey = new Map<string, SyncEvent>()
  const locked = new Set<string>()
  for (let n = 0; n < weeks; n++) {
    const weekStart = shiftWeek(first, n)
    const plannedCardio = cardioFor(weekStart)
    if (plannedCardio.length > 0) locked.add(lockKey('cardio', weekStart))
    for (const day of weekCalendar({ ...input, weekStart, plannedCardio })) {
      if (day.date < input.today) continue
      for (const item of day.items) {
        const pillar = PINNABLE.find((p) => p === item.pillar)
        if (!pillar) continue
        const title = item.amount ? `${item.label} ${item.amount}` : item.label
        const key = keyOf({ pillar, date: day.date })
        const held = byKey.get(key)
        if (!held) byKey.set(key, { pillar, date: day.date, title })
        else if (!held.title.split(', ').includes(title)) held.title = `${held.title}, ${title}`
      }
    }
  }
  return {
    from: input.today,
    to: weekDates(shiftWeek(first, weeks - 1))[6],
    events: [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.pillar.localeCompare(b.pillar)),
    locked,
  }
}

export type SyncPlan = {
  /** What to do to the Google calendar. */
  create: SyncEvent[]
  update: { id: string; title: string }[]
  remove: string[]
  /** What to do to the app: a week's days for a pillar, to be saved as that week's own. */
  appChanges: { weekStart: string; pillar: PinnablePillar; weekdays: number[] }[]
  /** What both sides hold once all of the above is done. */
  base: string[]
  /** Whether the base moved, so it needs saving even with nothing else to do. */
  baseChanged: boolean
}

/**
 * Settle the app's sessions against the calendar's, given what they agreed on
 * last time. Everything outside `from`…`to` is left alone on both sides: a
 * session that has gone by stays in the calendar as it was.
 */
export function mergeSync(input: {
  from: string
  to: string
  base: string[]
  app: SyncEvent[]
  remote: RemoteEvent[]
  locked: Set<string>
}): SyncPlan {
  const inWindow = (date: string) => date >= input.from && date <= input.to
  const base = new Set(input.base.filter((k) => inWindow(parseKey(k)?.date ?? '')))
  const app = new Map(input.app.filter((e) => inWindow(e.date)).map((e) => [keyOf(e), e]))
  // The first event for a key is the one managed; a copy made by hand is left be.
  const remote = new Map<string, RemoteEvent>()
  for (const e of input.remote) {
    if (inWindow(e.date) && !remote.has(keyOf(e))) remote.set(keyOf(e), e)
  }

  const result = new Set<string>()
  for (const key of new Set([...base, ...app.keys(), ...remote.keys()])) {
    const at = parseKey(key)
    if (!at) continue
    const inApp = app.has(key)
    const inRemote = remote.has(key)
    const keep = input.locked.has(lockKey(at.pillar, at.date))
      ? inApp
      : base.has(key)
        ? inApp && inRemote // still there unless either side took it off
        : inApp || inRemote // new on either side
    if (keep) result.add(key)
  }

  const create: SyncEvent[] = []
  const update: SyncPlan['update'] = []
  for (const key of result) {
    const mine = app.get(key)
    const theirs = remote.get(key)
    if (!theirs && mine) create.push(mine)
    else if (theirs && mine && theirs.title !== mine.title) update.push({ id: theirs.id, title: mine.title })
  }
  const remove = [...remote].filter(([key]) => !result.has(key)).map(([, e]) => e.id)

  // The pillar-weeks where the app shows something other than the result.
  const touched = new Map<string, { weekStart: string; pillar: PinnablePillar }>()
  for (const key of new Set([...result, ...app.keys()])) {
    if (result.has(key) === app.has(key)) continue
    const at = parseKey(key)!
    touched.set(lockKey(at.pillar, at.date), { weekStart: weekStartISO(at.date), pillar: at.pillar })
  }
  const appChanges = [...touched.values()].map(({ weekStart, pillar }) => {
    const dates = weekDates(weekStart)
    return {
      weekStart,
      pillar,
      weekdays: dates.filter((d) => result.has(keyOf({ pillar, date: d }))).map(mondayIndexOf),
    }
  })

  const next = [...result].sort()
  return {
    create,
    update,
    remove,
    appChanges,
    base: next,
    baseChanged: next.length !== base.size || next.some((k) => !base.has(k)),
  }
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n')
}

const icsDate = (iso: string) => iso.replace(/-/g, '')

function nextDay(iso: string): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + 1)
  return toISODate(d)
}

/**
 * The sessions as an iCalendar file: one all-day event each, which Apple
 * Calendar, Outlook and the rest import. A stable UID per session means
 * importing a later download updates the events already there instead of
 * doubling them, in the calendars that honour it.
 */
export function toICS(events: SyncEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//workout-tracker//schedule//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.pillar}-${e.date}@workout-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(e.date))}`,
      `SUMMARY:${icsText(e.title)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
