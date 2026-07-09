import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import { lastPerformance, nextTarget } from './progression'

/** Build a WorkoutRow with sensible defaults, overriding what a test cares about. */
function row(overrides: Partial<WorkoutRow>): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-01-01',
    day_type: 'push',
    exercise: 'bench',
    set_number: 1,
    weight_lbs: null,
    reps: 0,
    notes: '',
    is_historical: false,
    ...overrides,
  }
}

describe('nextTarget', () => {
  it('returns { weightLbs: null, reps: repMin } when there is no history', () => {
    expect(nextTarget([], 'bench', { repMin: 6, repMax: 10 })).toEqual({
      weightLbs: null,
      reps: 6,
    })
  })

  it('adds a rep at the same weight when below the top of the range', () => {
    const rows = [row({ weight_lbs: 135, reps: 8 })]
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10 })).toEqual({
      weightLbs: 135,
      reps: 9,
    })
  })

  it('bumps weight and resets reps at the top of the range', () => {
    const rows = [row({ weight_lbs: 135, reps: 10 })]
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10, increment: 5 })).toEqual({
      weightLbs: 140,
      reps: 6,
    })
  })

  it('progresses reps only for a bodyweight exercise', () => {
    const rows = [row({ exercise: 'pullup', weight_lbs: null, reps: 12 })]
    expect(nextTarget(rows, 'pullup', { repMin: 10, repMax: 15 })).toEqual({
      weightLbs: null,
      reps: 13,
    })
  })

  it('stays at repMax for a bodyweight exercise already at the top of the range', () => {
    const rows = [row({ exercise: 'pullup', weight_lbs: null, reps: 15 })]
    expect(nextTarget(rows, 'pullup', { repMin: 10, repMax: 15 })).toEqual({
      weightLbs: null,
      reps: 15,
    })
  })

  it('rounds bumped weight to the nearest 0.5', () => {
    const rows = [row({ weight_lbs: 100, reps: 10 })]
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10, increment: 2.75 })).toEqual({
      weightLbs: 103,
      reps: 6,
    })
  })

  it('re-paces from the most recent (lower) session', () => {
    const rows = [
      // Earlier heavy session.
      row({ session_id: 's1', date: '2026-01-01', weight_lbs: 135, reps: 10 }),
      // Most recent session was lighter (user backed off).
      row({ session_id: 's2', date: '2026-01-08', weight_lbs: 125, reps: 7 }),
    ]
    // Target derives from the newer 125x7 session, not the older 135x10 one.
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10 })).toEqual({
      weightLbs: 125,
      reps: 8,
    })
  })
})

describe('lastPerformance', () => {
  it('returns null when the exercise has no rows', () => {
    expect(lastPerformance([], 'bench')).toBeNull()
  })

  it('picks the latest session and its heaviest set', () => {
    const rows = [
      // Older session, heavier absolute weight — must be ignored.
      row({ session_id: 's1', date: '2026-01-01', set_number: 1, weight_lbs: 155, reps: 5 }),
      // Newer session across multiple sets; top set is the heaviest (145), ties→more reps.
      row({ session_id: 's2', date: '2026-01-08', set_number: 1, weight_lbs: 135, reps: 8 }),
      row({ session_id: 's2', date: '2026-01-08', set_number: 2, weight_lbs: 145, reps: 6 }),
      row({ session_id: 's2', date: '2026-01-08', set_number: 3, weight_lbs: 145, reps: 7 }),
    ]
    expect(lastPerformance(rows, 'bench')).toEqual({
      date: '2026-01-08',
      topWeight: 145,
      topReps: 7,
    })
  })

  it('reports max reps and null weight for a bodyweight session', () => {
    const rows = [
      row({ exercise: 'pullup', set_number: 1, weight_lbs: null, reps: 10 }),
      row({ exercise: 'pullup', set_number: 2, weight_lbs: null, reps: 12 }),
    ]
    expect(lastPerformance(rows, 'pullup')).toEqual({
      date: '2026-01-01',
      topWeight: null,
      topReps: 12,
    })
  })
})
