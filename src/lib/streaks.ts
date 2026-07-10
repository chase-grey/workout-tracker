import type { StreakState, WorkoutRow } from '../types'
import { enumerateWeeks, toISODate, weekStartISO } from './dates'

/**
 * Pure computation of streak state from the flat workout rows.
 *
 * Rules:
 *  - A week is Monday–Sunday. A "workout" is one distinct session in that week.
 *  - **Active streak**: consecutive weeks (ending at the current week) with ≥1 workout.
 *  - **Double streak**: consecutive weeks with ≥2 workouts.
 *  - **Freeze credits**: +1 per *completed* week with ≥3 workouts. A credit is spent
 *    automatically to bridge a completed week that had 0 workouts, preserving the streak.
 *    A week with exactly 1 workout breaks the double streak (not bridgeable — you showed
 *    up, just not twice). The current, in-progress week never breaks a streak on its own.
 *
 * `freezeCredits` in the result is the number of credits remaining (earned − spent).
 */
export function computeStreaks(
  rows: WorkoutRow[],
  today: Date = new Date(),
  flexDates: string[] = [],
): StreakState {
  // A "session" is a distinct workout session_id OR a stretch day (flex date).
  const perWeekSessions = new Map<string, Set<string>>()
  const bump = (week: string, id: string) => {
    const set = perWeekSessions.get(week) ?? new Set<string>()
    set.add(id)
    perWeekSessions.set(week, set)
  }
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.session_id || seen.has(r.session_id)) continue
    seen.add(r.session_id)
    bump(weekStartISO(r.date), r.session_id)
  }
  for (const d of flexDates) bump(weekStartISO(d), `flex:${d}`)

  const perWeek = new Map<string, number>()
  for (const [wk, set] of perWeekSessions) perWeek.set(wk, set.size)

  if (perWeek.size === 0) return { activeStreak: 0, doubleStreak: 0, freezeCredits: 0 }

  const currentWeek = weekStartISO(toISODate(today))
  // ISO date strings sort chronologically, so the min key is the earliest active week.
  const firstWeek = [...perWeek.keys()].sort()[0]
  const weeks = enumerateWeeks(firstWeek, currentWeek)

  let credits = 0
  let active = 0
  let dbl = 0

  for (const wk of weeks) {
    const count = perWeek.get(wk) ?? 0
    const isCurrent = wk === currentWeek

    // Spend at most one credit per completed missed (0-workout) week.
    const bridged = count === 0 && !isCurrent && credits > 0
    if (bridged) credits -= 1

    // Active streak.
    if (count >= 1) active += 1
    else if (isCurrent || bridged) {
      /* pending or bridged — keep the run */
    } else active = 0

    // Double streak.
    if (count >= 2) dbl += 1
    else if (isCurrent || bridged) {
      /* pending or bridged — keep the run */
    } else dbl = 0

    // Earn a credit at the end of a completed week with 3+ workouts.
    if (!isCurrent && count >= 3) credits += 1
  }

  return { activeStreak: active, doubleStreak: dbl, freezeCredits: credits }
}

/**
 * Whether the active streak is currently at risk: no workout logged yet this
 * (in-progress) week, and we're at/after `atRiskFromDay` (default Friday = 5).
 */
export function isStreakAtRisk(
  rows: WorkoutRow[],
  today: Date = new Date(),
  atRiskFromDay = 5,
  flexDates: string[] = [],
): boolean {
  const currentWeek = weekStartISO(toISODate(today))
  const hasThisWeek =
    rows.some((r) => r.session_id && weekStartISO(r.date) === currentWeek) ||
    flexDates.some((d) => weekStartISO(d) === currentWeek)
  const dow = today.getDay() === 0 ? 7 : today.getDay() // Mon=1 … Sun=7
  return !hasThisWeek && dow >= atRiskFromDay
}
