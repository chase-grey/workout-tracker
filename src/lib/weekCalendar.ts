/**
 * The week calendar on Today: seven days, each with what was done and what is
 * still planned, for the pillars this person tracks.
 *
 * Nothing in the app binds a workout to a weekday — the plan is a rotation and
 * the week is a count to reach — and the calendar doesn't pretend otherwise.
 * Left alone it is a record: each day shows what was lifted, stretched, run.
 * Only someone who chooses days gets days ahead: a weekday pinned to a pillar
 * (see {@link CalendarPins}) is planned every week, a week given days of its
 * own (see {@link WeekPins}) is planned on exactly those, and a cardio plan's
 * sessions fall where the plan put them. The strength days planned take the
 * rotation in turn from whichever was trained last.
 *
 * It used to guess, spreading each weekly goal over the days still open. That
 * read as a schedule nobody had made, and moved every time a day went by.
 *
 * Past days only ever show what happened. A day that was planned and passed
 * empty is not marked missed: red on the week behind you is a poor reason to
 * open the app. The calorie target is the exception, since it really is every
 * day's target — a past day that didn't hit it reads as missed, which is what
 * the calorie week's empty check always said. A day still ahead shows no
 * calorie mark at all: there is nothing to judge yet.
 *
 * Pure module: plain data in, seven cells out.
 */

import type { DayType, WorkoutRow } from '../types'
import type { FlexRoutineKey } from '../config/flexRoutines'
import type { CardioEntry } from './cardio'
import type { CalorieEntry } from './calories'
import { dayTotals } from './calories'
import type { FlexEntry } from './flex'
import { calorieDayHit, PILLARS, type DietDirection, type Pillar } from './profile'
import { trainingSessions } from './session'
import { completedRoutinesOf } from './stretchRotation'
import { mondayIndexOf, parseISODate, sameWeek, toISODate, weekStartISO } from './dates'

/**
 * One planned cardio session. Mirrors `PlannedCardio` in src/lib/cardioPlan.ts
 * (built alongside this); kept as a local copy so the calendar doesn't depend
 * on that module until the two are wired together.
 */
export type PlannedCardio = {
  date: string /* YYYY-MM-DD */
  kind: string
  minutes?: number
  distanceMi?: number
  label: string
}

/**
 * Weekdays (0 = Monday … 6 = Sunday) pinned to a pillar: "I lift on Mondays".
 * The calorie target takes none, being every day already, and cardio's are
 * read only in a week its own plan has nothing to say about.
 */
export type CalendarPins = Partial<Record<'strength' | 'flexibility' | 'cardio', number[]>>

export type PinnablePillar = keyof CalendarPins

export const PINNABLE: PinnablePillar[] = ['strength', 'flexibility', 'cardio']

/** What a schedule row calls each pillar's sessions. */
export const PIN_LABEL: Record<PinnablePillar, string> = { strength: 'lift', flexibility: 'stretch', cardio: 'cardio' }

export const WEEKDAY_SHORT = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/**
 * One week's own days, by its first day: "this week I'm lifting Tuesday
 * instead". A pillar named here is planned on exactly these weekdays that week,
 * the standing pins stepping aside, and a pillar left out keeps its standing
 * days.
 *
 * The key is the week's first day as it was when the days were chosen. Read it
 * through {@link pinsForWeek}, which finds a week by any date inside it, so a
 * week saved under its Monday is still found once weeks start on another day.
 */
export type WeekPins = Record<string, CalendarPins>

/** The saved key of the week holding `weekStart`, if that week has days of its own. */
function weekPinKey(weekPins: WeekPins | undefined, weekStart: string): string | undefined {
  if (!weekPins) return undefined
  if (weekPins[weekStart]) return weekStart
  return Object.keys(weekPins).find((w) => sameWeek(w, weekStart))
}

/** The days chosen for the week holding `weekStart` alone, whichever day its key was written under. */
export function pinsForWeek(weekPins: WeekPins | undefined, weekStart: string): CalendarPins | undefined {
  const key = weekPinKey(weekPins, weekStart)
  return key === undefined ? undefined : weekPins?.[key]
}

/** done: it happened. planned: still ahead. missed: a calorie day that passed under target. */
export type CalendarStatus = 'done' | 'planned' | 'missed'

/** What tapping a planned item today should open. */
export type CalendarAction =
  | { type: 'lift'; day: DayType }
  | { type: 'stretch'; routine: FlexRoutineKey }
  | { type: 'cardio' }

/** What a session item is, enough to show its details without starting it. */
export type CalendarWhat =
  | { type: 'lift'; day: DayType }
  | { type: 'stretch'; routine: FlexRoutineKey }
  | { type: 'cardio'; kind?: string; minutes?: number; distanceMi?: number }

export type CalendarItem = {
  pillar: Pillar
  status: CalendarStatus
  /** "push + core", "head to toe", "easy run", "calories". */
  label: string
  /** A short figure beside the label: "25m", "3.1mi", "4210/4500". */
  amount?: string
  /** Set only on today's planned items. */
  action?: CalendarAction
  /** Set on a session whose contents are known: a lift day, a routine, a cardio session. */
  what?: CalendarWhat
}

export type CalendarDay = {
  date: string
  /** 0 = Monday … 6 = Sunday. */
  weekday: number
  when: 'past' | 'today' | 'future'
  /** In PILLARS order, and only the pillars tracked. */
  items: CalendarItem[]
}

export type WeekCalendarInput = {
  /** Any date in the week to lay out; it's snapped to the week's first day. */
  weekStart: string
  today: string
  pillars: Pillar[]
  workouts: WorkoutRow[]
  /** The lift days in rotation order, empty days already dropped. */
  liftDays: DayType[]
  liftLabels: Record<DayType, string>
  flexEntries: FlexEntry[]
  /**
   * The routines planned stretch sessions cycle through, the one up next
   * first. One routine is a pinned focus; two alternate.
   */
  stretchRotation: FlexRoutineKey[]
  stretchLabels: Record<FlexRoutineKey, string>
  cardioEntries: CardioEntry[]
  plannedCardio?: PlannedCardio[]
  calorieEntries: CalorieEntry[]
  calorieGoalOn: (date: string) => number
  dietDirection?: DietDirection
  pins?: CalendarPins
  weekPins?: WeekPins
}

function addDays(date: string, n: number): string {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function weekDates(weekStart: string): string[] {
  const first = weekStartISO(weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

/** The date in the week of `weekStart` that falls on `weekday` (0 = Monday … 6 = Sunday). */
export function dateOfWeekday(weekStart: string, weekday: number): string {
  return weekDates(weekStart).find((d) => mondayIndexOf(d) === weekday)!
}

/** The first day of the week `n` weeks from the week holding `date`. */
export function shiftWeek(date: string, n: number): string {
  return addDays(weekStartISO(date), n * 7)
}

/** "25m", or "3.1mi" when there's only a distance. */
export function cardioAmount(e: { minutes?: number; distanceMi?: number }): string | undefined {
  if (e.minutes) return `${Math.round(e.minutes)}m`
  if (e.distanceMi) return `${Number(e.distanceMi.toFixed(1))}mi`
  return undefined
}

type Done = {
  strength: Map<string, DayType[]>
  flexibility: Map<string, (FlexRoutineKey | null)[]>
  cardio: Map<string, CardioEntry[]>
}

function doneByDate(input: WeekCalendarInput): Done {
  const strength = new Map<string, DayType[]>()
  for (const s of trainingSessions(input.workouts)) {
    strength.set(s.date, [...(strength.get(s.date) ?? []), s.dayType])
  }
  // Any stretch entry counts toward the week, as it does for the goal; one that
  // records no finished routine (a bare measurement) is shown as a plain stretch.
  const routinesOn = new Map<string, FlexRoutineKey[]>()
  for (const e of input.flexEntries) {
    routinesOn.set(e.date, [...new Set([...(routinesOn.get(e.date) ?? []), ...completedRoutinesOf(e)])])
  }
  const flexibility = new Map<string, (FlexRoutineKey | null)[]>()
  for (const [date, routines] of routinesOn) flexibility.set(date, routines.length ? routines : [null])
  const cardio = new Map<string, CardioEntry[]>()
  for (const e of input.cardioEntries) cardio.set(e.date, [...(cardio.get(e.date) ?? []), e])
  return { strength, flexibility, cardio }
}

/**
 * The days in the week of `weekStart` that `pillar` is planned on: the week's
 * own days if it has any, else the standing pins, and of those only the ones
 * still open. A day is open from today on, and today only while the pillar
 * hasn't been done today. With no days chosen there are none.
 */
function plannedDates(
  input: WeekCalendarInput,
  done: Done,
  weekStart: string,
  pillar: PinnablePillar,
): string[] {
  const dates = weekDates(weekStart)
  const chosen = pinsForWeek(input.weekPins, weekStart)?.[pillar] ?? input.pins?.[pillar] ?? []
  // A pin names a day of the week, not a place in it: Tuesday is Tuesday
  // whichever day the week starts on.
  return dates.filter(
    (d) => chosen.includes(mondayIndexOf(d)) && (d > input.today || (d === input.today && !done[pillar].has(d))),
  )
}

/**
 * How many sessions of `pillar` are planned between this week and the week
 * before `weekStart` — what a later week's rotation has to skip past.
 */
function plannedBefore(
  input: WeekCalendarInput,
  done: Done,
  weekStart: string,
  pillar: 'strength' | 'flexibility',
): number {
  let n = 0
  for (let wk = weekStartISO(input.today); wk < weekStart; wk = shiftWeek(wk, 1)) {
    n += plannedDates(input, done, wk, pillar).length
  }
  return n
}

export function weekCalendar(input: WeekCalendarInput): CalendarDay[] {
  const weekStart = weekStartISO(input.weekStart)
  const dates = weekDates(weekStart)
  const tracked = (p: Pillar) => input.pillars.includes(p)
  const done = doneByDate(input)
  const items = new Map<string, CalendarItem[]>(dates.map((d) => [d, []]))
  const push = (date: string, item: CalendarItem) => items.get(date)?.push(item)
  const isToday = (d: string) => d === input.today

  if (tracked('strength')) {
    for (const d of dates) {
      for (const day of done.strength.get(d) ?? []) {
        push(d, { pillar: 'strength', status: 'done', label: input.liftLabels[day], what: { type: 'lift', day } })
      }
    }
    const planned = plannedDates(input, done, weekStart, 'strength')
    // The rotation picks up after the last session trained by today.
    const last = trainingSessions(input.workouts)
      .filter((s) => s.date <= input.today)
      .reduce<{ date: string; dayType: DayType } | null>((a, s) => (!a || s.date >= a.date ? s : a), null)
    const n = input.liftDays.length
    const start = last ? input.liftDays.indexOf(last.dayType) + 1 : 0
    const offset = plannedBefore(input, done, weekStart, 'strength')
    planned.forEach((d, i) => {
      const day = n ? input.liftDays[(((start + offset + i) % n) + n) % n] : null
      push(d, {
        pillar: 'strength',
        status: 'planned',
        label: day ? input.liftLabels[day] : 'workout',
        ...(day ? { what: { type: 'lift', day } } : {}),
        ...(day && isToday(d) ? { action: { type: 'lift', day } } : {}),
      })
    })
  }

  if (tracked('flexibility')) {
    for (const d of dates) {
      for (const r of done.flexibility.get(d) ?? []) {
        push(d, {
          pillar: 'flexibility',
          status: 'done',
          label: r ? input.stretchLabels[r] : 'stretch',
          ...(r ? { what: { type: 'stretch', routine: r } } : {}),
        })
      }
    }
    const planned = plannedDates(input, done, weekStart, 'flexibility')
    const rot = input.stretchRotation
    const offset = plannedBefore(input, done, weekStart, 'flexibility')
    planned.forEach((d, i) => {
      const routine = rot.length ? rot[(offset + i) % rot.length] : null
      push(d, {
        pillar: 'flexibility',
        status: 'planned',
        label: routine ? input.stretchLabels[routine] : 'stretch',
        ...(routine ? { what: { type: 'stretch', routine } } : {}),
        ...(routine && isToday(d) ? { action: { type: 'stretch', routine } } : {}),
      })
    })
  }

  if (tracked('cardio')) {
    for (const d of dates) {
      for (const e of done.cardio.get(d) ?? []) {
        push(d, {
          pillar: 'cardio',
          status: 'done',
          label: e.kind,
          amount: cardioAmount(e),
          what: { type: 'cardio', kind: e.kind, minutes: e.minutes, distanceMi: e.distanceMi },
        })
      }
    }
    const inWeek = (input.plannedCardio ?? []).filter((p) => dates.includes(p.date))
    if (inWeek.length) {
      // The plan says which days. A planned session today steps aside once one
      // of its kind is logged; anything else logged leaves it standing.
      for (const p of inWeek) {
        if (p.date < input.today) continue
        if (isToday(p.date) && (done.cardio.get(p.date) ?? []).some((e) => e.kind === p.kind)) continue
        push(p.date, {
          pillar: 'cardio',
          status: 'planned',
          label: p.label,
          // A plan's label carries its own figure ("easy run 25 min"); don't say it twice.
          amount: /\d/.test(p.label) ? undefined : cardioAmount(p),
          what: { type: 'cardio', kind: p.kind, minutes: p.minutes, distanceMi: p.distanceMi },
          ...(isToday(p.date) ? { action: { type: 'cardio' } } : {}),
        })
      }
    } else {
      // No plan for the week: the days chosen for cardio, if any were.
      for (const d of plannedDates(input, done, weekStart, 'cardio')) {
        push(d, {
          pillar: 'cardio',
          status: 'planned',
          label: 'cardio',
          what: { type: 'cardio' },
          ...(isToday(d) ? { action: { type: 'cardio' } } : {}),
        })
      }
    }
  }

  if (tracked('diet')) {
    const totals = dayTotals(input.calorieEntries)
    // A day still ahead has nothing to judge, so it carries no mark at all.
    for (const d of dates.filter((d) => d <= input.today)) {
      const goal = input.calorieGoalOn(d)
      const total = totals.get(d) ?? 0
      const hit = calorieDayHit(total, goal, input.dietDirection ?? 'gain')
      push(d, {
        pillar: 'diet',
        status: hit ? 'done' : d < input.today ? 'missed' : 'planned',
        label: 'calories',
        amount: `${total}/${goal}`,
      })
    }
  }

  const order = (p: Pillar) => PILLARS.indexOf(p)
  return dates.map((date) => ({
    date,
    weekday: mondayIndexOf(date),
    when: date < input.today ? 'past' : date === input.today ? 'today' : 'future',
    // Stable within a pillar: done before planned, then in the order pushed.
    items: (items.get(date) ?? []).sort((a, b) => order(a.pillar) - order(b.pillar)),
  }))
}

/**
 * The one mark per pillar the simplified strip draws for a day: done if any of
 * that pillar was, planned if any is still ahead, else nothing.
 */
export function pillarMarks(day: CalendarDay, pillars: Pillar[]): Record<Pillar, CalendarStatus | null> {
  const out = { strength: null, flexibility: null, cardio: null, diet: null } as Record<Pillar, CalendarStatus | null>
  for (const p of pillars) {
    const of = day.items.filter((i) => i.pillar === p)
    out[p] = of.some((i) => i.status === 'done')
      ? 'done'
      : of.some((i) => i.status === 'planned')
        ? 'planned'
        : of.some((i) => i.status === 'missed')
          ? 'missed'
          : null
  }
  return out
}

/**
 * How a mark is drawn for its status. The shape already says which pillar, so
 * the colour is left one job: lit once it happened, dim while it hasn't —
 * a session still planned, a calorie target not hit — and absent when the day
 * has nothing of that pillar at all.
 */
export type MarkTone = 'lit' | 'dim'

export function markTone(status: CalendarStatus | null): MarkTone | null {
  return status === 'done' ? 'lit' : status ? 'dim' : null
}

/** `pins` with `weekday` added to or taken off `pillar`. */
export function togglePin(pins: CalendarPins | undefined, pillar: PinnablePillar, weekday: number): CalendarPins {
  return setPins(pins, pillar, toggleWeekday(pins?.[pillar] ?? [], weekday))
}

/** `weekdays` with `weekday` added or taken off. */
export function toggleWeekday(weekdays: number[], weekday: number): number[] {
  return weekdays.includes(weekday) ? weekdays.filter((d) => d !== weekday) : [...weekdays, weekday]
}

/** `pins` with `pillar` on exactly `weekdays`. */
export function setPins(pins: CalendarPins | undefined, pillar: PinnablePillar, weekdays: number[]): CalendarPins {
  return { ...pins, [pillar]: [...new Set(weekdays)].sort((a, b) => a - b) }
}

/**
 * The weekdays `pillar` stands on in a laid-out week, done or still planned:
 * what the schedule editor opens showing for that week.
 */
export function scheduledWeekdays(days: CalendarDay[], pillar: PinnablePillar): number[] {
  return days.filter((d) => d.items.some((i) => i.pillar === pillar)).map((d) => d.weekday)
}

/**
 * `weekPins` with one week's days for `pillar` set, and the weeks before
 * `today`'s dropped: a week behind you shows only what happened, so its days
 * have nothing left to say and would only ride along in every sync.
 */
export function withWeekPins(
  weekPins: WeekPins | undefined,
  weekStart: string,
  pillar: PinnablePillar,
  weekdays: number[],
  today: string,
): WeekPins {
  const week = weekStartISO(weekStart)
  const current = weekStartISO(today)
  // Re-keyed to each week's first day as weeks run now, so a week saved under
  // its Monday before the start day moved is updated rather than doubled.
  const kept = Object.fromEntries(
    Object.entries(weekPins ?? {})
      .map(([w, pins]) => [weekStartISO(w), pins] as const)
      .filter(([w]) => w >= current),
  )
  return { ...kept, [week]: setPins(kept[week], pillar, weekdays) }
}

/** `weekPins` without the week of `weekStart`: back to the standing schedule. */
export function withoutWeekPins(weekPins: WeekPins | undefined, weekStart: string): WeekPins {
  return Object.fromEntries(Object.entries(weekPins ?? {}).filter(([w]) => !sameWeek(w, weekStart)))
}

/** Whether any day has been chosen for any pillar, standing or for the week of `weekStart`. */
export function hasSchedule(pins: CalendarPins | undefined, weekPins: WeekPins | undefined, weekStart: string): boolean {
  const any = (p: CalendarPins | undefined) => PINNABLE.some((k) => (p?.[k]?.length ?? 0) > 0)
  return any(pins) || any(pinsForWeek(weekPins, weekStart))
}

/**
 * The day a week opens on: today in the current week, the last day of a week
 * behind you (its last word), the first of one ahead.
 */
export function defaultCalendarDate(weekStart: string, today: string): string {
  const dates = weekDates(weekStart)
  if (dates.includes(today)) return today
  return dates[0] > today ? dates[0] : dates[6]
}

/**
 * The calendar's two forms: one strip of marks with the picked day's sessions
 * under it, or a row per day. `simple` is how it opens unless `full` was kept.
 */
export type WeekCalendarView = 'full' | 'simple'
