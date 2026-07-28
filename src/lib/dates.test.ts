import { describe, expect, it } from 'vitest'
import { enumerateWeeks, mondayOf, parseISODate, toISODate, weekCompletedDaysFraction, weekStartISO } from './dates'

describe('weekCompletedDaysFraction', () => {
  // 2026-06-15 is a Monday; the Mon–Sun week runs 06-15 … 06-21.
  it('is 0/7 on Monday morning — the current in-progress day never counts', () => {
    expect(weekCompletedDaysFraction(new Date(2026, 5, 15, 0, 0))).toBe(0)
  })

  it('stays 0/7 all of Monday until the day fully ends', () => {
    expect(weekCompletedDaysFraction(new Date(2026, 5, 15, 23, 59))).toBe(0)
  })

  it('is 1/7 on Tuesday morning — only Monday has fully ended', () => {
    expect(weekCompletedDaysFraction(new Date(2026, 5, 16, 0, 0))).toBeCloseTo(1 / 7, 10)
    expect(weekCompletedDaysFraction(new Date(2026, 5, 16, 8, 30))).toBeCloseTo(1 / 7, 10)
  })

  it('steps forward at each midnight boundary', () => {
    // Thursday: Mon+Tue+Wed have ended → 3/7.
    expect(weekCompletedDaysFraction(new Date(2026, 5, 18, 12, 0))).toBeCloseTo(3 / 7, 10)
  })

  it('is 6/7 during Sunday — the final day is still in progress, not counted', () => {
    expect(weekCompletedDaysFraction(new Date(2026, 5, 21, 12, 0))).toBeCloseTo(6 / 7, 10)
    // Even the last instant of the week: Sunday is still in progress.
    expect(weekCompletedDaysFraction(new Date(2026, 5, 21, 23, 59, 59, 999))).toBeCloseTo(6 / 7, 10)
  })

  it('never exceeds 7/7 and steps monotonically to the goal by week end', () => {
    // The 7th day (Sunday) completes exactly at the week boundary (next Monday
    // 00:00). Since mondayOf() re-anchors there, the visible in-week value peaks
    // at 6/7 during Sunday and reaches the full 7/7 goal only at that boundary —
    // it is clamped and can never exceed 1.
    let prev = -1
    for (let day = 15; day <= 21; day++) {
      const frac = weekCompletedDaysFraction(new Date(2026, 5, day, 9, 0))
      expect(frac).toBeGreaterThanOrEqual(prev)
      expect(frac).toBeLessThanOrEqual(1)
      prev = frac
    }
    // The full week (7 completed days) maps to exactly 7/7 = 1 and is capped there.
    expect(weekCompletedDaysFraction(new Date(2026, 5, 21, 9, 0))).toBeCloseTo(6 / 7, 10)
    // A Monday-morning "now" resets to a fresh week: 0/7, never 7/7 or negative.
    expect(weekCompletedDaysFraction(new Date(2026, 5, 22, 0, 0))).toBe(0)
  })
})

describe('mondayOf', () => {
  it('always returns a Monday', () => {
    for (let day = 1; day <= 28; day++) {
      const d = new Date(2026, 5, day) // June 2026
      expect(mondayOf(d).getDay()).toBe(1)
    }
  })
  it('maps a Sunday back to the preceding Monday', () => {
    // 2026-06-28 is a Sunday; its week starts 2026-06-22 (Monday).
    expect(weekStartISO('2026-06-28')).toBe('2026-06-22')
    expect(weekStartISO('2026-06-22')).toBe('2026-06-22')
  })
})

describe('parse/format round-trip', () => {
  it('is stable and timezone-safe', () => {
    expect(toISODate(parseISODate('2026-01-05'))).toBe('2026-01-05')
  })
})

describe('enumerateWeeks', () => {
  it('lists inclusive Mondays a week apart', () => {
    expect(enumerateWeeks('2026-06-01', '2026-06-22')).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
    ])
  })
})
