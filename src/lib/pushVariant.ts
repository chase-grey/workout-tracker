/**
 * Which Push + Core variant comes next.
 *
 * Push runs as two variants that differ only in which press leads (see
 * DEFAULT_PLAN.push): A puts incline first at 4 sets, B puts flat first at 4
 * sets. The ask is simply to start with a different press each time, so they
 * alternate off the last one actually trained:
 *
 *   incline-first → flat-first → incline-first → …
 *
 * Read off the variant recorded on the logged session rather than off a session
 * count, so an override ("give me the other one today") is what the next session
 * turns over from — the alternation follows what was pressed first, not what was
 * scheduled. A count per week was the earlier rule, and it pinned a once-a-week
 * schedule to incline forever, since the week's first session was always A.
 *
 * Counted off logged history rather than a stored toggle, so it survives a
 * reinstall and stays consistent across devices. Only completed sessions count:
 * starting a workout and abandoning it doesn't burn a turn. Pure module: no
 * React/DOM, no storage.
 */

import type { DayType, WorkoutRow } from '../types'
import {
  DEFAULT_PLAN,
  VARIANT_DAY_TYPES,
  variantExercises,
  type DayPlan,
  type VariantKey,
} from '../config/plan'
import { trainingSessions } from './session'

/** Every variant a variant day runs, in order. */
export const VARIANT_KEYS: VariantKey[] = ['A', 'B']

/**
 * The variant the most recent logged `dayType` session trained, or null if none
 * recorded one.
 *
 * Only training sessions are eligible, so a supplemental core-only session never
 * turns the alternation over. Sessions that recorded no variant at all are
 * skipped rather than treated as a break in the chain: imported history and
 * anything logged before the A/B split have none, and the last session that does
 * say which press led is still the right thing to alternate from. Dates are
 * YYYY-MM-DD, so a plain string compare orders them, and `>=` lets a later row
 * win a same-day tie since rows are appended chronologically.
 */
export function lastVariant(workouts: WorkoutRow[], dayType: DayType): VariantKey | null {
  const dates = new Map(
    trainingSessions(workouts)
      .filter((s) => s.dayType === dayType)
      .map((s) => [s.sessionId, s.date]),
  )
  let latest: { date: string; variant: VariantKey } | null = null
  for (const r of workouts) {
    if (!r.session_id || !r.variant) continue
    const date = dates.get(r.session_id)
    if (date === undefined) continue
    if (!latest || date >= latest.date) latest = { date, variant: r.variant }
  }
  return latest?.variant ?? null
}

/**
 * The variant to start for `dayType` right now — whichever one the last session
 * didn't train, and A (incline first) when there's no variant on record to turn
 * over from. Days that don't run variants get null.
 */
export function nextVariant(workouts: WorkoutRow[], dayType: DayType): VariantKey | null {
  if (dayType !== 'push') return null
  const last = lastVariant(workouts, dayType)
  return last ? otherVariant(last) : VARIANT_KEYS[0]
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
