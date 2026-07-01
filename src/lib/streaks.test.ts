import { describe, expect, it } from 'vitest'
import { computeStreaks, isStreakAtRisk } from './streaks'
import { mondayOf, toISODate } from './dates'
import type { WorkoutRow } from '../types'

const TODAY = new Date(2026, 6, 1) // Wed 2026-07-01

/** A date sitting inside the week `weeksAgo` weeks before TODAY. */
function dayInWeek(weeksAgo: number): string {
  const m = mondayOf(TODAY)
  m.setDate(m.getDate() - 7 * weeksAgo + 2) // Wednesday of that week
  return toISODate(m)
}

function row(sessionId: string, date: string): WorkoutRow {
  return {
    session_id: sessionId,
    date,
    day_type: 'push',
    exercise: 'incline_barbell_press',
    set_number: 1,
    weight_lbs: 135,
    reps: 8,
    notes: '',
    is_historical: false,
  }
}

/** `count` distinct sessions in the week `weeksAgo` weeks before TODAY. */
function week(weeksAgo: number, count: number): WorkoutRow[] {
  const date = dayInWeek(weeksAgo)
  return Array.from({ length: count }, (_, i) => row(`s${weeksAgo}-${i}`, date))
}

describe('computeStreaks', () => {
  it('returns zeros for no data', () => {
    expect(computeStreaks([], TODAY)).toEqual({ activeStreak: 0, doubleStreak: 0, freezeCredits: 0 })
  })

  it('counts consecutive ≥1-workout weeks as the active streak', () => {
    const rows = [...week(0, 1), ...week(1, 1), ...week(2, 1)]
    expect(computeStreaks(rows, TODAY)).toMatchObject({ activeStreak: 3, doubleStreak: 0 })
  })

  it('counts consecutive ≥2-workout weeks as the double streak', () => {
    const rows = [...week(0, 2), ...week(1, 2)]
    expect(computeStreaks(rows, TODAY)).toMatchObject({ activeStreak: 2, doubleStreak: 2 })
  })

  it('earns a freeze credit at 3+ workouts and spends it to bridge a missed week', () => {
    // week3: 3 workouts (earns credit); week2: 0 (bridged); week1 & week0: 1 each
    const rows = [...week(3, 3), ...week(1, 1), ...week(0, 1)]
    const s = computeStreaks(rows, TODAY)
    // Weeks 3, 1 and 0 had workouts (week 2 was bridged by the credit, not counted).
    expect(s.activeStreak).toBe(3)
    expect(s.freezeCredits).toBe(0) // earned 1, spent 1
    // Sanity: without the earned credit the missed week would have reset the run.
    const noCredit = computeStreaks([...week(3, 1), ...week(1, 1), ...week(0, 1)], TODAY)
    expect(noCredit.activeStreak).toBe(2) // only weeks 1 and 0 survive the gap

  })

  it('does not break the streak just because the current week is empty', () => {
    const rows = [...week(1, 1)] // last week only, nothing yet this week
    expect(computeStreaks(rows, TODAY).activeStreak).toBe(1)
  })

  it('breaks the streak on an unbridged missed week', () => {
    const rows = [...week(3, 1)] // then two empty weeks, no credits
    expect(computeStreaks(rows, TODAY).activeStreak).toBe(0)
  })
})

describe('isStreakAtRisk', () => {
  it('is false when a workout is already logged this week', () => {
    expect(isStreakAtRisk([...week(0, 1)], TODAY, 1)).toBe(false)
  })
  it('is true when the current week is empty and we are past the threshold day', () => {
    expect(isStreakAtRisk([...week(1, 1)], TODAY, 1)).toBe(true)
  })
})
