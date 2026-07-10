import { toISODate, weekStartISO } from './dates'

export type CalorieEntry = { date: string /* YYYY-MM-DD */; calories: number; label?: string }

export const CALORIE_GOAL = 4000

/** True when a calorie value is usable (finite and non-negative). */
function isValidCalories(calories: number): boolean {
  return Number.isFinite(calories) && calories >= 0
}

/** Sum calories per date. Invalid (non-finite/negative) values are ignored. */
export function dayTotals(entries: CalorieEntry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (!isValidCalories(entry.calories)) continue
    totals.set(entry.date, (totals.get(entry.date) ?? 0) + entry.calories)
  }
  return totals
}

/** Summed calories for a single date. */
export function totalForDate(entries: CalorieEntry[], date: string): number {
  return dayTotals(entries).get(date) ?? 0
}

/** Distinct dates whose summed total meets or exceeds `goal`, sorted ascending. */
export function calorieHitDates(entries: CalorieEntry[], goal: number = CALORIE_GOAL): string[] {
  const hits: string[] = []
  for (const [date, total] of dayTotals(entries)) {
    if (total >= goal) hits.push(date)
  }
  return hits.sort()
}

/**
 * A "calorie PR": the highest single-day total in the current week (week of
 * `today`), if that total is >= goal AND strictly greater than the highest
 * single-day total on any day before this week. Returns that day, else null.
 */
export function caloriePR(
  entries: CalorieEntry[],
  today: Date = new Date(),
  goal: number = CALORIE_GOAL,
): { date: string; calories: number } | null {
  const totals = dayTotals(entries)
  const thisWeekStart = weekStartISO(toISODate(today))

  let thisWeekMaxDate: string | null = null
  let thisWeekMax = -Infinity
  let priorMax = -Infinity

  for (const [date, total] of totals) {
    const weekStart = weekStartISO(date)
    if (weekStart === thisWeekStart) {
      // Prefer the latest date on ties.
      if (total > thisWeekMax || (total === thisWeekMax && (thisWeekMaxDate === null || date > thisWeekMaxDate))) {
        thisWeekMax = total
        thisWeekMaxDate = date
      }
    } else if (date < thisWeekStart) {
      if (total > priorMax) priorMax = total
    }
  }

  if (thisWeekMaxDate === null) return null
  if (thisWeekMax >= goal && thisWeekMax > priorMax) {
    return { date: thisWeekMaxDate, calories: thisWeekMax }
  }
  return null
}
