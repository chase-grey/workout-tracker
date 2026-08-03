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

/**
 * Fixed "today", a week after the fixture sessions. Without it these tests would
 * drift into the stale-history branch — which repeats the last set rather than
 * stepping up, so nothing reads as a challenge — as real time moves past the
 * fixture dates.
 */
const TODAY = new Date(2026, 6, 21)

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
    const result = sessionChallenges(prev, added, opts, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].met).toBe(true)
    expect(metBaselines(result)).toEqual(['flat bench press'])
  })

  it('reports an unmet challenge when no set reaches the target', () => {
    const prev = [row({ date: '2026-07-14', weight_lbs: 135, reps: 8 })] // target → 135×9
    const added = [row({ weight_lbs: 135, reps: 8 })]
    const result = sessionChallenges(prev, added, opts, TODAY)
    expect(result).toHaveLength(1)
    expect(result[0].met).toBe(false)
    expect(metBaselines(result)).toEqual([])
  })

  it('skips exercises with no plan entry and non-challenges (no history)', () => {
    const added = [row({ exercise: 'mystery', weight_lbs: 50, reps: 5 }), row({ weight_lbs: 100, reps: 6 })]
    expect(sessionChallenges([], added, opts, TODAY)).toHaveLength(0)
  })

  it('counts a met bodyweight challenge', () => {
    const prev = [row({ exercise: 'pullup', date: '2026-07-14', weight_lbs: null, reps: 12 })] // target → 13 reps
    const added = [row({ exercise: 'pullup', weight_lbs: null, reps: 14 })]
    const result = sessionChallenges(prev, added, opts, TODAY)
    expect(result[0].met).toBe(true)
  })

  /**
   * The point of the A/B slots: a press has to be judged against the days it was
   * trained the same way. Read the wrong slot and the second press of the day is
   * credited with beating a number it set fresh, while the fresh one is called
   * challenged for matching a tired session.
   */
  describe('across A/B slots', () => {
    it('judges the second press against past second presses', () => {
      const prev = [
        // Fresh, leading variant B a week ago.
        row({ session_id: 'b1', date: '2026-07-14', variant: 'B', weight_lbs: 185, reps: 8 }),
        // Tired, following four exercises in variant A.
        row({ session_id: 'a1', date: '2026-07-16', variant: 'A', weight_lbs: 165, reps: 8 }),
      ]
      // Today is another variant A: the target is 165×9, and 165×9 meets it.
      const added = [row({ session_id: 'a2', variant: 'A', weight_lbs: 165, reps: 9 })]
      const result = sessionChallenges(prev, added, opts, TODAY)
      expect(result).toHaveLength(1)
      expect(result[0].target).toEqual({ weightLbs: 165, reps: 9 })
      expect(result[0].met).toBe(true)
    })

    it('does not call it a challenge when the slot has no history to beat', () => {
      // Only the fresh slot has been trained, so the tired one repeats its weight
      // rather than being asked to add a rep to it — no step up, no challenge.
      const prev = [
        row({ session_id: 'b1', date: '2026-07-14', variant: 'B', weight_lbs: 185, reps: 8 }),
      ]
      const added = [row({ session_id: 'a1', variant: 'A', weight_lbs: 185, reps: 8 })]
      expect(sessionChallenges(prev, added, opts, TODAY)).toHaveLength(0)
    })
  })
})
