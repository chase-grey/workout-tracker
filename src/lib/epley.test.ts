import { describe, expect, it } from 'vitest'
import { bestSet1RM, bestSetWeight, epley1RM, repsForE1RM, sessionVolume } from './epley'
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

describe('repsForE1RM', () => {
  it('is the inverse of epley1RM at a fixed weight, rounded up to a whole rep', () => {
    // 100 × 26 → 186.7 is the first whole rep count past a 185 estimate.
    expect(repsForE1RM(185, 100)).toBe(26)
    expect(epley1RM(100, 26)).toBeGreaterThanOrEqual(185)
    expect(epley1RM(100, 25)).toBeLessThan(185)
    // Two plates off a pair of 50s is thirty reps exactly.
    expect(repsForE1RM(200, 100)).toBe(30)
    expect(epley1RM(100, 30)).toBe(200)
  })
  it('asks for a single when the weight already meets the estimate', () => {
    expect(repsForE1RM(100, 100)).toBe(1)
    expect(repsForE1RM(90, 100)).toBe(1)
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
