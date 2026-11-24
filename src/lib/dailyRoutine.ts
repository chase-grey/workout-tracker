/**
 * The stretch routine that's up next, and the routines that are owed by the day.
 *
 * Most routines are skills trained in turn: whichever wasn't done last is next
 * (see lib/flexSkills.stretchRotationFor). A corrective is different — the
 * pelvic tilt routine is owed six days of seven (FlexRoutine.weeklyDays), so it
 * doesn't take a turn, it stands in front of the turns: while a profile trains
 * one, it is the routine that's up next, and the others are simply there to be
 * started.
 *
 * Pure module: no React/DOM, no storage.
 */

import { FLEX_ROUTINES, type FlexRoutineKey } from '../config/flexRoutines'
import { addDaysISO, weekStartISO } from './dates'
import type { FlexEntry } from './flex'
import { stretchRotationFor } from './flexSkills'
import { completedRoutinesOf, lastStretchRoutine } from './stretchRotation'

/** Whether a routine is owed by the day rather than trained in turn. */
export const isDailyRoutine = (routine: FlexRoutineKey): boolean => FLEX_ROUTINES[routine].weeklyDays != null

/**
 * The stretch days the week starting `week` is owed by the daily routines among
 * `skills`: the most any of them asks for, and 0 where none does or the week is
 * from before it did. This is what the week's stretch goal is held to (see
 * weeklyStreak.weeklyGoalsFor) — any stretch session counts toward it, a second
 * routine the same day included (stretchRotation.stretchSessionDates), and six
 * of them is what doing the routine six days comes to.
 */
export function dailyStretchDays(skills: FlexRoutineKey[], week: string): number {
  let days = 0
  for (const key of skills) {
    const { weeklyDays, weeklyDaysFrom } = FLEX_ROUTINES[key]
    if (weeklyDays == null) continue
    if (weeklyDaysFrom && addDaysISO(week, 6) < weeklyDaysFrom) continue
    days = Math.max(days, weeklyDays)
  }
  return days
}

/** The dates in `today`'s week, up to today, on which `routine` was finished. Oldest first. */
export function routineDaysThisWeek(entries: FlexEntry[], routine: FlexRoutineKey, today: string): string[] {
  const week = weekStartISO(today)
  const days = new Set<string>()
  for (const e of entries) {
    if (e.date > today || weekStartISO(e.date) !== week) continue
    if (completedRoutinesOf(e).includes(routine)) days.add(e.date)
  }
  return [...days].sort()
}

/** How a daily routine stands this week: the days done, the days owed, and whether today's is still to do. */
export function dailyStanding(
  entries: FlexEntry[],
  routine: FlexRoutineKey,
  today: string,
): { done: number; goal: number; owedToday: boolean } | null {
  const goal = FLEX_ROUTINES[routine].weeklyDays
  if (goal == null) return null
  const days = routineDaysThisWeek(entries, routine, today)
  return { done: days.length, goal, owedToday: days.length < goal && !days.includes(today) }
}

/**
 * The stretch routine Today marks as up next, or null when none is.
 *
 * With a daily routine among the skills, it's that one until today's is done —
 * and then nothing: the routines that take turns don't step forward in its
 * place. With none, it's the next in the rotation.
 */
export function nextStretchUp(skills: FlexRoutineKey[], entries: FlexEntry[], today: string): FlexRoutineKey | null {
  const daily = skills.filter(isDailyRoutine)
  if (daily.length > 0) {
    return daily.find((r) => dailyStanding(entries, r, today)?.owedToday) ?? null
  }
  return stretchRotationFor(skills, lastStretchRoutine(entries))[0] ?? null
}

/**
 * The routines planned stretch sessions are drawn from, the one up next first:
 * the daily routines where there are any, the rotation otherwise.
 */
export function plannedStretchRotation(skills: FlexRoutineKey[], entries: FlexEntry[]): FlexRoutineKey[] {
  const daily = skills.filter(isDailyRoutine)
  return daily.length > 0 ? daily : stretchRotationFor(skills, lastStretchRoutine(entries))
}
