/**
 * The week calendar on Today: seven days, each with what was done and what is
 * still planned, for the pillars this person tracks.
 *
 * Nothing in the app binds a workout to a weekday — the plan is a rotation and
 * the week is a count to reach — so "planned" is a projection. Each pillar's
 * remaining weekly goal is spread over the days still open, starting today, and
 * the strength days take the rotation in turn from whichever was trained last.
 * A weekday pinned to a pillar (see {@link CalendarPins}) is planned whatever
 * the goal says, and the rest of the goal spreads round it.
 *
 * Past days only ever show what happened. A day that was "planned" and passed
 * empty is not marked missed: the projection was the app's guess, not a promise
 * the user made, and red on the week behind you is a poor reason to open the app.
 * The calorie target is the exception, since it really is every day's target —
 * a past day that didn't hit it reads as missed, which is what the calorie
 * week's empty check always said.
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
import type { WeeklyGoalConfig } from './weeklyStreak'
import { parseISODate, toISODate, weekStartISO } from './dates'

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
 * Only the two pillars whose sessions the app runs take pins — cardio has a
 * plan of its own, and the calorie target is every day already.
 */
export type CalendarPins = Partial<Record<'strength' | 'flexibility', number[]>>

export type PinnablePillar = keyof CalendarPins

/** done: it happened. planned: still ahead. missed: a calorie day that passed under target. */
export type CalendarStatus = 'done' | 'planned' | 'missed'

/** What tapping a planned item today should open. */
export type CalendarAction =
  | { type: 'lift'; day: DayType }
  | { type: 'stretch'; routine: FlexRoutineKey }
  | { type: 'cardio' }

export type CalendarItem = {
  pillar: Pillar
  status: CalendarStatus
  /** "push + core", "head to toe", "easy run", "calories". */
  label: string
  /** A short figure beside the label: "25m", "3.1mi", "4210/4500". */
  amount?: string
  /** Set only on today's planned items. */
  action?: CalendarAction
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
  /** Any date in the week to lay out; it's snapped to its Monday. */
  weekStart: string
  today: string
  pillars: Pillar[]
  /** The weekly goals in force for the week starting on a given Monday. */
  goalsFor: (week: string) => WeeklyGoalConfig
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
}

function addDays(date: string, n: number): string {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function weekDates(weekStart: string): string[] {
  const monday = weekStartISO(weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** The Monday `n` weeks from the week holding `date`. */
export function shiftWeek(date: string, n: number): string {
  return addDays(weekStartISO(date), n * 7)
}

/** "25m", or "3.1mi" when there's only a distance. */
export function cardioAmount(e: { minutes?: number; distanceMi?: number }): string | undefined {
  if (e.minutes) return `${Math.round(e.minutes)}m`
  if (e.distanceMi) return `${Number(e.distanceMi.toFixed(1))}mi`
  return undefined
}

/**
 * Which of `open` days to plan `count` sessions on, spread as evenly as the
 * days allow and starting with the first — so a goal of two from Monday lands
 * on Monday and Thursday, and the session that can be done today is today's.
 */
export function spreadDays(open: string[], count: number): string[] {
  if (count <= 0 || open.length === 0) return []
  if (count >= open.length) return [...open]
  return Array.from({ length: count }, (_, i) => open[Math.floor((i * open.length) / count)])
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
 * The days in the week of `weekStart` that `pillar` is projected onto: pinned
 * weekdays still open, then the rest of the weekly goal spread across the
 * unpinned open days. A day is open from today on, and today only while the
 * pillar hasn't been done today.
 */
function projectedDates(
  input: WeekCalendarInput,
  done: Done,
  weekStart: string,
  pillar: 'strength' | 'flexibility' | 'cardio',
  goal: number,
): string[] {
  const dates = weekDates(weekStart)
  const doneOn = done[pillar]
  const open = dates.filter((d) => d > input.today || (d === input.today && !doneOn.has(d)))
  const doneCount = dates.filter((d) => doneOn.has(d)).length
  const remaining = Math.max(0, goal - doneCount)
  const pinned = pillar === 'cardio' ? [] : (input.pins?.[pillar] ?? [])
  const pinnedOpen = open.filter((d) => pinned.includes(dates.indexOf(d)))
  const unpinned = open.filter((d) => !pinnedOpen.includes(d))
  const extra = spreadDays(unpinned, remaining - pinnedOpen.length)
  return [...pinnedOpen, ...extra].sort()
}

function goalOf(goals: WeeklyGoalConfig, pillar: 'strength' | 'flexibility' | 'cardio'): number {
  if (pillar === 'strength') return goals.workouts
  if (pillar === 'flexibility') return goals.flex
  return goals.cardio ?? 0
}

/**
 * How many sessions of `pillar` are projected between this week and the week
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
    n += projectedDates(input, done, wk, pillar, goalOf(input.goalsFor(wk), pillar)).length
  }
  return n
}

export function weekCalendar(input: WeekCalendarInput): CalendarDay[] {
  const weekStart = weekStartISO(input.weekStart)
  const dates = weekDates(weekStart)
  const tracked = (p: Pillar) => input.pillars.includes(p)
  const goals = input.goalsFor(weekStart)
  const done = doneByDate(input)
  const items = new Map<string, CalendarItem[]>(dates.map((d) => [d, []]))
  const push = (date: string, item: CalendarItem) => items.get(date)?.push(item)
  const isToday = (d: string) => d === input.today

  if (tracked('strength')) {
    for (const d of dates) {
      for (const day of done.strength.get(d) ?? []) {
        push(d, { pillar: 'strength', status: 'done', label: input.liftLabels[day] })
      }
    }
    const planned = projectedDates(input, done, weekStart, 'strength', goals.workouts)
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
        ...(day && isToday(d) ? { action: { type: 'lift', day } } : {}),
      })
    })
  }

  if (tracked('flexibility')) {
    for (const d of dates) {
      for (const r of done.flexibility.get(d) ?? []) {
        push(d, { pillar: 'flexibility', status: 'done', label: r ? input.stretchLabels[r] : 'stretch' })
      }
    }
    const planned = projectedDates(input, done, weekStart, 'flexibility', goals.flex)
    const rot = input.stretchRotation
    const offset = plannedBefore(input, done, weekStart, 'flexibility')
    planned.forEach((d, i) => {
      const routine = rot.length ? rot[(offset + i) % rot.length] : null
      push(d, {
        pillar: 'flexibility',
        status: 'planned',
        label: routine ? input.stretchLabels[routine] : 'stretch',
        ...(routine && isToday(d) ? { action: { type: 'stretch', routine } } : {}),
      })
    })
  }

  if (tracked('cardio')) {
    for (const d of dates) {
      for (const e of done.cardio.get(d) ?? []) {
        push(d, { pillar: 'cardio', status: 'done', label: e.kind, amount: cardioAmount(e) })
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
          amount: cardioAmount(p),
          ...(isToday(p.date) ? { action: { type: 'cardio' } } : {}),
        })
      }
    } else {
      // No plan for the week: spread the weekly cardio goal like the others.
      for (const d of projectedDates(input, done, weekStart, 'cardio', goals.cardio ?? 0)) {
        push(d, {
          pillar: 'cardio',
          status: 'planned',
          label: 'cardio',
          ...(isToday(d) ? { action: { type: 'cardio' } } : {}),
        })
      }
    }
  }

  if (tracked('diet')) {
    const totals = dayTotals(input.calorieEntries)
    for (const d of dates) {
      const goal = input.calorieGoalOn(d)
      const total = totals.get(d) ?? 0
      const hit = calorieDayHit(total, goal, input.dietDirection ?? 'gain')
      push(d, {
        pillar: 'diet',
        status: hit ? 'done' : d < input.today ? 'missed' : 'planned',
        label: 'calories',
        amount: d > input.today ? String(goal) : `${total}/${goal}`,
      })
    }
  }

  const order = (p: Pillar) => PILLARS.indexOf(p)
  return dates.map((date, weekday) => ({
    date,
    weekday,
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

/** `pins` with `weekday` added to or taken off `pillar`. */
export function togglePin(pins: CalendarPins | undefined, pillar: PinnablePillar, weekday: number): CalendarPins {
  const cur = pins?.[pillar] ?? []
  const next = cur.includes(weekday) ? cur.filter((d) => d !== weekday) : [...cur, weekday].sort((a, b) => a - b)
  return { ...pins, [pillar]: next }
}

/**
 * The day a week opens on: today in the current week, the Sunday of a week
 * behind you (its last word), the Monday of one ahead.
 */
export function defaultCalendarDate(weekStart: string, today: string): string {
  const dates = weekDates(weekStart)
  if (dates.includes(today)) return today
  return dates[0] > today ? dates[0] : dates[6]
}

/** The calendar's two forms: a row per day, or one strip of marks. */
export type WeekCalendarView = 'full' | 'simple'
