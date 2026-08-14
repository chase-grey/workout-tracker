import { describe, expect, it } from 'vitest'
import { enumerateWeeks, mondayOf, parseISODate, toISODate, weekStartISO } from './dates'

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
