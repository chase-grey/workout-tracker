import { describe, expect, it } from 'vitest'
import { targetAtEta } from './goalLine'

describe('targetAtEta', () => {
  it('carries a moving target forward to the ETA at the projected gain', () => {
    expect(targetAtEta({ target: 167.4, targetSlopePerWeek: 0.5, etaWeeks: 6 })).toBe(170.4)
  })

  it('rounds to a tenth', () => {
    expect(targetAtEta({ target: 170, targetSlopePerWeek: 1.5, etaWeeks: 10 / 3 })).toBe(175)
    expect(targetAtEta({ target: 170, targetSlopePerWeek: 0.5, etaWeeks: 2.5 })).toBe(171.3)
  })

  it('is today\'s target when the target holds still', () => {
    expect(targetAtEta({ target: 200, etaWeeks: 8 })).toBe(200)
    expect(targetAtEta({ target: 200, targetSlopePerWeek: 0, etaWeeks: 8 })).toBe(200)
  })

  it('is today\'s target when there is no ETA to carry it to', () => {
    expect(targetAtEta({ target: 167.4, targetSlopePerWeek: 0.5, etaWeeks: null })).toBe(167.4)
  })
})
