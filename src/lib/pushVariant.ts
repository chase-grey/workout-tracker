/**
 * Which Push + Core variant comes next.
 *
 * Push runs as two variants that differ only in which press leads (see
 * DEFAULT_PLAN.push): A puts incline first at 4 sets, B puts flat first at 4
 * sets. They alternate by position *within the week* rather than by a running
 * counter, so the first push session of any week is always A:
 *
 *   1st push of the week → A, 2nd → B, 3rd → A, …
 *
 * That means a week with a single push session gets A, and so does the next
 * week's single session — the alternation resets at each Monday instead of
 * drifting. Pure module: no React/DOM, no storage.
 */

import type { DayType, WorkoutRow } from '../types'
import type { VariantKey } from '../config/plan'
import { toISODate, weekStartISO } from './dates'
import { trainingSessions } from './session'

/** The variant for the nth push session of a week, counting n from 0. */
export function variantForIndex(index: number): VariantKey {
  return index % 2 === 0 ? 'A' : 'B'
}

/**
 * How many sessions of `dayType` are already logged in the week containing
 * `today`. Counts distinct training sessions, so a supplemental core-only
 * session never shifts the alternation.
 */
export function sessionsThisWeek(
  workouts: WorkoutRow[],
  dayType: DayType,
  today: Date = new Date(),
): number {
  const week = weekStartISO(toISODate(today))
  return trainingSessions(workouts).filter(
    (s) => s.dayType === dayType && weekStartISO(s.date) === week,
  ).length
}

/**
 * The variant to start for `dayType` right now — A for the week's first session,
 * B for its second, and so on. Days that don't run variants get null.
 */
export function nextVariant(
  workouts: WorkoutRow[],
  dayType: DayType,
  today: Date = new Date(),
): VariantKey | null {
  if (dayType !== 'push') return null
  return variantForIndex(sessionsThisWeek(workouts, dayType, today))
}

/** The other variant — for the "actually, give me the other one" override. */
export function otherVariant(v: VariantKey): VariantKey {
  return v === 'A' ? 'B' : 'A'
}
