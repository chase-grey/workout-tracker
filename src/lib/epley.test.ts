import { describe, expect, it } from 'vitest'
import { bestSet1RM, bestSetWeight, epley1RM, sessionVolume } from './epley'
import type { SetLog } from '../types'

const sets: SetLog[] = [
  { setNumber: 1, weightLbs: 100, reps: 10 },
  { setNumber: 2, weightLbs: 120, reps: 5 },
  { setNumber: 3, weightLbs: null, reps: 12 },
]

describe('epley1RM', () => {
  it('applies weight × (1 + reps/30)', () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.333, 2)
    expect(epley1RM(135, 1)).toBeCloseTo(139.5, 2)
  })
  it('returns 0 for non-positive reps', () => {
    expect(epley1RM(100, 0)).toBe(0)
  })
})

describe('bestSet1RM / bestSetWeight', () => {
  it('takes the max estimate, ignoring blank-weight sets', () => {
    // 120×5 → 140 beats 100×10 → 133.3
    expect(bestSet1RM(sets)).toBeCloseTo(140, 2)
    expect(bestSetWeight(sets)).toBe(120)
  })
})

describe('sessionVolume', () => {
  it('sums weight × reps, treating blank weight as 0', () => {
    expect(sessionVolume(sets)).toBe(100 * 10 + 120 * 5 + 0 * 12)
  })
})
