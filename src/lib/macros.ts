/**
 * Which macros someone counts, what each one's daily target is, and what the
 * three of them add up to in calories.
 *
 * A profile picks any of protein, carbs and fat, or none. One from before the
 * question counts protein alone, which is what the card always showed.
 *
 * Counting all three makes the calories a sum rather than a second thing to
 * enter: a gram of protein or carbohydrate is 4 kcal and a gram of fat is 9
 * (the Atwater factors a nutrition label is built from), so the card logs the
 * calories each gram brings and drops its calorie buttons. With one or two
 * there's no telling what the rest of the plate held, and calories stay their
 * own entry.
 *
 * Targets: protein from body weight (lib/protein). Fat is a quarter of the
 * day's calorie target, inside the 20–35 % range usually recommended, and
 * carbohydrate is whatever calories the other two leave. Each is rounded to
 * 5 g, and a profile can set its own instead (Settings → tracking).
 */

import { MACROS, calorieGoalOn, formatGrams, type Macro, type MacroGrams } from './calories'
import { proteinGoalOn } from './protein'
import type { Profile } from './profile'
import type { BodyWeightEntry } from '../types'

export const KCAL_PER_GRAM: Record<Macro, number> = { protein: 4, carbs: 4, fat: 9 }

/** The share of the calorie target the fat target is set at. */
export const FAT_CALORIE_SHARE = 0.25

export const MACRO_LABELS: Record<Macro, string> = { protein: 'protein', carbs: 'carbs', fat: 'fat' }

type MacroProfile = Pick<Profile, 'macros' | 'proteinGoal' | 'carbGoal' | 'fatGoal' | 'targetWeightLbs'>

/** The macros a profile counts, in card order. */
export function trackedMacros(profile: Pick<Profile, 'macros'> | null | undefined): Macro[] {
  const picked = profile?.macros
  if (!Array.isArray(picked)) return ['protein']
  return MACROS.filter((m) => picked.includes(m))
}

/** Whether the calories are worked out from the macros rather than entered. */
export function derivesCalories(tracked: readonly Macro[]): boolean {
  return MACROS.every((m) => tracked.includes(m))
}

/** The calories in some grams of macros, to the nearest one. */
export function macroCalories(grams: MacroGrams): number {
  return Math.round(MACROS.reduce((sum, m) => sum + (grams[m] ?? 0) * KCAL_PER_GRAM[m], 0))
}

const round5 = (g: number) => Math.round(g / 5) * 5
const own = (g: number | undefined) => (g != null && Number.isFinite(g) && g > 0 ? Math.round(g) : null)

/**
 * The target for `macro` on `date`, in grams: the profile's own when it set
 * one, otherwise worked out. Null when there's nothing to work it out from.
 */
export function macroGoalOn(
  macro: Macro,
  date: string,
  bodyWeights: BodyWeightEntry[],
  profile: MacroProfile | null,
  calorieGoal: number = calorieGoalOn(date),
): number | null {
  if (macro === 'protein') return proteinGoalOn(date, bodyWeights, profile)
  const hasCalories = Number.isFinite(calorieGoal) && calorieGoal > 0
  const fat =
    own(profile?.fatGoal) ?? (hasCalories ? round5((calorieGoal * FAT_CALORIE_SHARE) / KCAL_PER_GRAM.fat) : null)
  if (macro === 'fat') return fat
  const set = own(profile?.carbGoal)
  if (set != null) return set
  const protein = proteinGoalOn(date, bodyWeights, profile)
  if (!hasCalories || fat == null || protein == null) return null
  const left = calorieGoal - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat
  return left > 0 ? round5(left / KCAL_PER_GRAM.carbs) : null
}

/**
 * The macros in a helping the way the card writes them: `25g` when one macro
 * is counted, `25p 60c 20f` when the grams need telling apart. Only the
 * macros in `tracked` are written, and none of them at zero.
 */
export function formatMacros(grams: MacroGrams, tracked: readonly Macro[]): string {
  const shown = tracked.filter((m) => (grams[m] ?? 0) > 0)
  if (tracked.length === 1) return shown.map((m) => formatGrams(grams[m]!)).join('')
  return shown.map((m) => `${Math.round(grams[m]!)}${m[0]}`).join(' ')
}
