import { describe, expect, it } from 'vitest'
import type { WorkoutRow } from '../types'
import { isChallenge, metBaselines, sessionChallenges, type ChallengeOpts } from './challenge'

function row(p: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-07-21',
    day_type: 'push',
    exercise: 'flat_bench',
    set_number: 1,
    weight_lbs: null,
    reps: 0,
    notes: '',
    is_historical: false,
    ...p,
  }
}

const BENCH: ChallengeOpts = { repMin: 6, repMax: 10, increment: 5 }
const PULLUP: ChallengeOpts = { repMin: 10, repMax: 15, bodyweight: true }

describe('isChallenge', () => {
  it('is false with no prior history', () => {
    expect(isChallenge([], 'flat_bench', { weightLbs: 100, reps: 6 })).toBe(false)
  })

  it('is true for more reps at the same weight', () => {
    const prev = [row({ weight_lbs: 135, reps: 8 })]
    // next target would be 135×9 — a step up
    expect(isChallenge(prev, 'flat_bench', { weightLbs: 135, reps: 9 })).toBe(true)
  })

  it('is true for heavier weight even if reps reset lower', () => {
    const prev = [row({ weight_lbs: 135, reps: 10 })]
    expect(isChallenge(prev, 'flat_bench', { weightLbs: 140, reps: 6 })).toBe(true)
  })

  it('is false when the target does not exceed last session', () => {
    const prev = [row({ weight_lbs: 135, reps: 8 })]
    expect(isChallenge(prev, 'flat_bench', { weightLbs: 135, reps: 8 })).toBe(false)
  })

  it('handles bodyweight (reps-only) progression', () => {
    const prev = [row({ exercise: 'pullup', weight_lbs: null, reps: 12 })]
    expect(isChallenge(prev, 'pullup', { weightLbs: null, reps: 13 })).toBe(true)
    expect(isChallenge(prev, 'pullup', { weightLbs: null, reps: 12 })).toBe(false)
  })
})

describe('sessionChallenges', () => {
  const opts = new Map<string, ChallengeOpts>([
    ['flat_bench', BENCH],
    ['pullup', PULLUP],
  ])

  it('reports a met challenge when a completed set beats the target', () => {
    const prev = [row({ date: '2026-07-14', weight_lbs: 135, reps: 8 })] // target → 135×9
    const added = [row({ weight_lbs: 135, reps: 9 })]
    const result = sessionChallenges(prev, added, opts)
    expect(result).toHaveLength(1)
    expect(result[0].met).toBe(true)
    expect(metBaselines(result)).toEqual(['flat bench press'])
  })

  it('reports an unmet challenge when no set reaches the target', () => {
    const prev = [row({ date: '2026-07-14', weight_lbs: 135, reps: 8 })] // target → 135×9
    const added = [row({ weight_lbs: 135, reps: 8 })]
    const result = sessionChallenges(prev, added, opts)
    expect(result).toHaveLength(1)
    expect(result[0].met).toBe(false)
    expect(metBaselines(result)).toEqual([])
  })

  it('skips exercises with no plan entry and non-challenges (no history)', () => {
    const added = [row({ exercise: 'mystery', weight_lbs: 50, reps: 5 }), row({ weight_lbs: 100, reps: 6 })]
    expect(sessionChallenges([], added, opts)).toHaveLength(0)
  })

  it('counts a met bodyweight challenge', () => {
    const prev = [row({ exercise: 'pullup', date: '2026-07-14', weight_lbs: null, reps: 12 })] // target → 13 reps
    const added = [row({ exercise: 'pullup', weight_lbs: null, reps: 14 })]
    const result = sessionChallenges(prev, added, opts)
    expect(result[0].met).toBe(true)
  })
})
