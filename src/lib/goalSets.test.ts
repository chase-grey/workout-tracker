import { describe, expect, it } from 'vitest'
import { setsByDate, setsDotRadius, setsNearBest, type DaySets } from './goalSets'
import type { WorkoutRow } from '../types'

function r(over: Partial<WorkoutRow>): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-08-10',
    day_type: 'push',
    exercise: 'weighted_pullups',
    set_number: 1,
    weight_lbs: null,
    reps: 8,
    notes: '',
    is_historical: false,
    ...over,
  }
}

describe('setsByDate', () => {
  it('lists a session set by set, in performed order', () => {
    const sets = setsByDate(
      [
        r({ set_number: 3, reps: 6 }),
        r({ set_number: 1, reps: 9 }),
        r({ set_number: 4, reps: 5 }),
        r({ set_number: 2, reps: 8 }),
      ],
      ['weighted_pullups'],
    )
    expect(sets['2026-08-10']).toEqual([
      { exercise: 'weighted_pullups', sets: [{ weightLbs: null, reps: 9 }, { weightLbs: null, reps: 8 }, { weightLbs: null, reps: 6 }, { weightLbs: null, reps: 5 }] },
    ])
  })

  it('keeps each lift a goal counts separate, in log order', () => {
    const sets = setsByDate(
      [
        r({ exercise: 'incline_bench', weight_lbs: 115, reps: 8 }),
        r({ exercise: 'flat_bench', weight_lbs: 145, reps: 6, set_number: 2 }),
      ],
      ['flat_bench', 'incline_bench'],
    )
    expect(sets['2026-08-10'].map((d) => d.exercise)).toEqual(['incline_bench', 'flat_bench'])
  })

  it('ignores lifts the goal does not count', () => {
    const sets = setsByDate([r({ exercise: 'leg_press', weight_lbs: 300 })], ['weighted_pullups'])
    expect(sets).toEqual({})
  })

  it('keys by date, so two sessions of one lift on a day read as one day', () => {
    const sets = setsByDate(
      [
        r({ session_id: 'a', reps: 9 }),
        r({ session_id: 'b', set_number: 2, reps: 4 }),
        r({ session_id: 'b', date: '2026-08-12', reps: 10 }),
      ],
      ['weighted_pullups'],
    )
    expect(sets['2026-08-10'][0].sets.map((s) => s.reps)).toEqual([9, 4])
    expect(sets['2026-08-12'][0].sets.map((s) => s.reps)).toEqual([10])
  })
})

describe('setsNearBest', () => {
  const day = (...reps: number[]): DaySets[] => [
    { exercise: 'weighted_pullups', sets: reps.map((n) => ({ weightLbs: null, reps: n })) },
  ]

  it('counts every set of a day that held its number', () => {
    expect(setsNearBest(day(7, 7, 7, 7))).toBe(4)
    expect(setsNearBest(day(7))).toBe(1)
  })

  it('counts a set one rep short of the best', () => {
    expect(setsNearBest(day(8, 7, 7, 7))).toBe(4)
  })

  it('leaves out the sets that fell away from the best one', () => {
    expect(setsNearBest(day(10, 3, 3, 3))).toBe(1)
    expect(setsNearBest(day(10, 9, 6, 5))).toBe(2)
  })

  it('is zero for a day with nothing logged', () => {
    expect(setsNearBest(undefined)).toBe(0)
    expect(setsNearBest([])).toBe(0)
  })
})

describe('setsDotRadius', () => {
  it('grows a pixel a set and stops at four', () => {
    expect([0, 1, 2, 3, 4, 6].map(setsDotRadius)).toEqual([2, 2, 3, 4, 5, 5])
  })
})
