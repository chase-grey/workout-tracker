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
import {
  DEFAULT_PLAN,
  VARIANT_DAY_TYPES,
  variantExercises,
  type DayPlan,
  type VariantKey,
} from '../config/plan'
import { toISODate, weekStartISO } from './dates'
import { trainingSessions } from './session'

/** Every variant a variant day runs, in order. */
export const VARIANT_KEYS: VariantKey[] = ['A', 'B']

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

/** Where one exercise sits in a variant: its place in the order, and its sets. */
type Slot = { index: number; sets: number }

function slotIn(day: DayPlan, variant: VariantKey, key: string): Slot | null {
  const list = variantExercises(day, variant)
  const index = list.findIndex((e) => e.key === key)
  return index < 0 ? null : { index, sets: list[index].sets }
}

/**
 * The variant that trains `key` under the least fatigue — the one where it leads
 * rather than following the day's other press.
 *
 * Decided on where the exercise falls in the performed order first, then on set
 * count, since the variant that gives a lift its full sets is the one built
 * around it. Null when the exercise sits identically in every variant (nothing
 * to choose between) or the day doesn't run variants at all — most of the plan,
 * which is why callers treat null as "every session is comparable".
 */
export function leadVariant(day: DayPlan, key: string): VariantKey | null {
  if (!VARIANT_DAY_TYPES.includes(day.type)) return null
  const a = slotIn(day, 'A', key)
  const b = slotIn(day, 'B', key)
  if (!a || !b) return null
  if (a.index !== b.index) return a.index < b.index ? 'A' : 'B'
  if (a.sets !== b.sets) return a.sets > b.sets ? 'A' : 'B'
  return null
}

/**
 * {@link leadVariant} for an exercise key alone, read off the shipped defaults.
 *
 * The pure readers that need this — charts, goals, the strength map — have no
 * live plan to hand, and they don't need one: `byVariant` is program design
 * rather than user preference, so a stored plan always re-adopts it from the
 * defaults (see mergeDayExercises). Only the day's ordering is the user's to
 * change, and the shipped variants differ in set count too, which settles it
 * either way.
 */
export function leadVariantForKey(key: string): VariantKey | null {
  for (const type of VARIANT_DAY_TYPES) {
    const found = leadVariant(DEFAULT_PLAN[type], key)
    if (found) return found
  }
  return null
}

/**
 * The slot a lift's progression should read when the session is training
 * `variant`: the variant itself for a lift the variants train differently, and
 * null — every session, one ladder — for the many they train alike.
 *
 * Scoping the alike ones would split a single ladder into two that each climb at
 * half speed: a cable crunch done on both push days is the same cable crunch, and
 * pinning Tuesday's target to Tuesdays only would ignore the reps earned on
 * Friday. Only the presses, whose fatigue genuinely differs, get their own ladder.
 *
 * Read off the shipped defaults for the same reason as {@link leadVariantForKey},
 * and so the target prefilled mid-session and the challenge check run at save time
 * can't disagree about which history they're reading.
 */
export function progressionVariant(
  key: string,
  variant: VariantKey | null | undefined,
): VariantKey | null {
  if (variant == null) return null
  return leadVariantForKey(key) != null ? variant : null
}
