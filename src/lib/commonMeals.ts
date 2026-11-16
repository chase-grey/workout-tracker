/**
 * The meals someone logs over and over, for one-tap buttons on the food card.
 *
 * There is no meal list to pick from: a meal is a helping, and the helpings are
 * already there. The same breakfast logged as +500 +100 +25g most mornings
 * leaves a helping of 600 calories and 25g on each of those days, so the
 * helpings that recur, size for size, are the meals. Ranked by how often they
 * recur within the window, then by how recently, so a new habit overtakes an
 * old one once it has been eaten as often.
 *
 * A helping has to recur to count: one big dinner is not a meal anyone needs a
 * button for. One that is just a single tap of a button already on the card
 * (+100, +25g) is left out too, being that button again.
 */

import { dayHelpings, type CalorieEntry } from './calories'
import { toISODate } from './dates'

export type Meal = { calories: number; protein: number }

type Opts = {
  now?: Date
  /** How many meals to offer. */
  limit?: number
  /** How many times a helping has to have been logged to be a meal. */
  minCount?: number
  /** How far back to look, in days. */
  withinDays?: number
  /** Meals the card already has a button for. */
  exclude?: Meal[]
}

const keyOf = (m: Meal) => `${m.calories}|${m.protein}`

/** The most-logged helpings in `entries`, most common first. */
export function commonMeals(entries: CalorieEntry[], opts: Opts = {}): Meal[] {
  const { now = new Date(), limit = 3, minCount = 2, withinDays = 60, exclude = [] } = opts
  const start = new Date(now)
  start.setDate(start.getDate() - withinDays)
  const from = toISODate(start)
  const skip = new Set(exclude.map(keyOf))

  const seen = new Map<string, { meal: Meal; count: number; last: number }>()
  for (const date of new Set(entries.map((e) => e.date))) {
    if (date < from) continue
    for (const h of dayHelpings(entries, date)) {
      const meal = { calories: Math.round(h.amount), protein: Math.round(h.protein ?? 0) }
      if (meal.calories < 0 || meal.protein < 0 || (meal.calories === 0 && meal.protein === 0)) continue
      const key = keyOf(meal)
      if (skip.has(key)) continue
      const at = new Date(h.at).getTime()
      const tally = seen.get(key)
      if (tally) {
        tally.count++
        tally.last = Math.max(tally.last, at)
      } else seen.set(key, { meal, count: 1, last: at })
    }
  }

  return [...seen.values()]
    .filter((t) => t.count >= minCount)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map((t) => t.meal)
}
