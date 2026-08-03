import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import { nextVariant, otherVariant, sessionsThisWeek, variantForIndex } from './pushVariant'
import { DEAD_BUG } from '../config/plan'

function row(overrides: Partial<WorkoutRow>): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-01-05', // a Monday
    day_type: 'push',
    exercise: 'flat_bench',
    set_number: 1,
    weight_lbs: 135,
    reps: 8,
    notes: '',
    is_historical: false,
    ...overrides,
  }
}

// Week of Mon 2026-01-05 … Sun 2026-01-11.
const WEDNESDAY = new Date(2026, 0, 7)
const NEXT_WEEK = new Date(2026, 0, 14)

describe('variantForIndex', () => {
  it('alternates A, B, A, B by position', () => {
    expect([0, 1, 2, 3].map(variantForIndex)).toEqual(['A', 'B', 'A', 'B'])
  })
})

describe('nextVariant', () => {
  it("starts the week's first push session on A", () => {
    expect(nextVariant([], 'push', WEDNESDAY)).toBe('A')
  })

  it('gives B once one push session is logged this week', () => {
    const rows = [row({ session_id: 's1', date: '2026-01-05' })]
    expect(nextVariant(rows, 'push', WEDNESDAY)).toBe('B')
  })

  it('comes back around to A for a third push session in one week', () => {
    const rows = [
      row({ session_id: 's1', date: '2026-01-05' }),
      row({ session_id: 's2', date: '2026-01-07' }),
    ]
    expect(nextVariant(rows, 'push', WEDNESDAY)).toBe('A')
  })

  it('resets to A next week rather than continuing the alternation', () => {
    // One push session last week; the new week starts from A again, so a
    // once-a-week schedule is always variant A instead of drifting.
    const rows = [row({ session_id: 's1', date: '2026-01-05' })]
    expect(nextVariant(rows, 'push', NEXT_WEEK)).toBe('A')
  })

  it('ignores other day types', () => {
    const rows = [row({ session_id: 's1', day_type: 'pull', exercise: 'barbell_squat' })]
    expect(nextVariant(rows, 'push', WEDNESDAY)).toBe('A')
  })

  it('ignores a supplemental core-only session', () => {
    // Dead bugs alone don't count as training, so they can't shift the rotation.
    const rows = [row({ session_id: 's1', exercise: DEAD_BUG.key, weight_lbs: null })]
    expect(nextVariant(rows, 'push', WEDNESDAY)).toBe('A')
  })

  it('has no variant for days that do not run A/B', () => {
    expect(nextVariant([], 'pull', WEDNESDAY)).toBeNull()
    expect(nextVariant([], 'fullbody', WEDNESDAY)).toBeNull()
  })
})

describe('sessionsThisWeek', () => {
  it('counts distinct sessions inside the current week only', () => {
    const rows = [
      row({ session_id: 's1', date: '2026-01-05', set_number: 1 }),
      row({ session_id: 's1', date: '2026-01-05', set_number: 2 }),
      row({ session_id: 's2', date: '2026-01-07' }),
      row({ session_id: 's0', date: '2025-12-29' }), // previous week
    ]
    expect(sessionsThisWeek(rows, 'push', WEDNESDAY)).toBe(2)
  })
})

describe('otherVariant', () => {
  it('flips between the two', () => {
    expect(otherVariant('A')).toBe('B')
    expect(otherVariant('B')).toBe('A')
  })
})
