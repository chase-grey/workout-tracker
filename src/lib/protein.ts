/**
 * The daily protein target.
 *
 * Protein is counted against body weight, not against the calorie target: the
 * 1.6–2.2 g/kg band is what supports building or holding muscle, and it holds
 * whether someone is eating to gain or to lose. The target sits in the middle
 * of that band, rounded to 5 g so it reads as a number to aim at rather than a
 * calculation. A profile can set its own instead (Settings → tracking).
 *
 * The weight it is worked out from is the latest weigh-in on or before the day,
 * so the target follows a bulk up and a cut down without anyone editing it. A
 * day before the first weigh-in uses the first one; someone who doesn't weigh
 * in falls back to their target weight; with neither there's no target, and
 * the card shows the day's grams alone.
 */

import type { BodyWeightEntry } from '../types'
import type { Profile } from './profile'

/** Grams of protein per kilogram of body weight the target is set at. */
export const PROTEIN_G_PER_KG = 1.8

const LBS_PER_KG = 2.20462

/** The target for a body weight in pounds, to the nearest 5 g. */
export function proteinTargetForWeight(weightLbs: number, gPerKg: number = PROTEIN_G_PER_KG): number {
  return Math.round(((weightLbs / LBS_PER_KG) * gPerKg) / 5) * 5
}

/** The weigh-in a day is judged by: the latest on or before it, else the earliest. */
function weightOn(bodyWeights: BodyWeightEntry[], date: string): number | null {
  let before: BodyWeightEntry | null = null
  let first: BodyWeightEntry | null = null
  for (const w of bodyWeights) {
    if (!Number.isFinite(w.weightLbs) || w.weightLbs <= 0) continue
    if (w.date <= date && (!before || w.date >= before.date)) before = w
    if (!first || w.date < first.date) first = w
  }
  return (before ?? first)?.weightLbs ?? null
}

/**
 * The protein target, in grams, for `date`: the profile's own when it set one,
 * otherwise worked out from body weight. Null when there's nothing to work it
 * out from.
 */
export function proteinGoalOn(
  date: string,
  bodyWeights: BodyWeightEntry[],
  profile: Pick<Profile, 'proteinGoal' | 'targetWeightLbs'> | null,
): number | null {
  const own = profile?.proteinGoal
  if (own != null && Number.isFinite(own) && own > 0) return Math.round(own)
  const weight = weightOn(bodyWeights, date) ?? profile?.targetWeightLbs ?? null
  return weight != null && weight > 0 ? proteinTargetForWeight(weight) : null
}
