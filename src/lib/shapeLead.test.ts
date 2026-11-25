import { describe, expect, it } from 'vitest'
import { SHAPE_LEAD_MS, shapeFraction } from './shapeLead'
import { createBulbs, sandLevels, waistY } from './bulbs'

/** The countdown's tick and the shapes' transition (see components/RestShapes). */
const TICK_MS = 250
const TRANSITION_MS = 260

describe('shapeFraction', () => {
  it('starts full and ends empty', () => {
    expect(shapeFraction(60_000, 60_000)).toBe(1)
    expect(shapeFraction(0, 60_000)).toBe(0)
  })

  it('stays empty through overtime and full before the start', () => {
    expect(shapeFraction(-5_000, 60_000)).toBe(0)
    expect(shapeFraction(90_000, 60_000)).toBe(1)
  })

  it('only ever falls as the clock runs down', () => {
    let last = shapeFraction(20_000, 20_000)
    for (let ms = 20_000 - TICK_MS; ms >= -TICK_MS; ms -= TICK_MS) {
      const now = shapeFraction(ms, 20_000)
      expect(now).toBeLessThanOrEqual(last)
      last = now
    }
  })

  it('aims at empty on a tick whose transition can finish before zero', () => {
    // Wherever the ticks fall, exactly one lands with between a transition and a
    // transition-plus-a-tick left on the clock. That one has to aim at empty: any
    // later tick starts a move the screen closes on halfway through.
    for (const total of [5_000, 20_000, 90_000, 180_000]) {
      for (let left = TRANSITION_MS; left <= TRANSITION_MS + TICK_MS; left += 7) {
        expect(shapeFraction(left, total)).toBe(0)
      }
    }
  })

  it('leads the clock by more than a tick and the transition together', () => {
    expect(SHAPE_LEAD_MS).toBeGreaterThan(TICK_MS + TRANSITION_MS)
  })

  it('gives a countdown shorter than the lead its whole length', () => {
    expect(shapeFraction(200, 200)).toBe(1)
    expect(shapeFraction(100, 200)).toBeGreaterThan(0)
    expect(shapeFraction(2_000, 2_000)).toBe(1)
    expect(shapeFraction(1_000, 2_000)).toBeGreaterThan(0)
    expect(shapeFraction(0, 200)).toBe(0)
  })

  it('has no countdown to show for a zero or missing length', () => {
    expect(shapeFraction(0, 0)).toBe(0)
    expect(shapeFraction(500, 0)).toBe(0)
    expect(shapeFraction(500, Number.NaN)).toBe(0)
  })

  it('empties the curvy sand timer with a tick and a transition to spare', () => {
    // The shape this was written for: its surface runs fastest through the neck,
    // so a tick of lag is a visible heap of sand rather than a sliver of level.
    const bulbs = createBulbs({ cx: 50, top: 7, bottom: 93, rimHalf: 30, waistHalf: 1.5, corner: 9 })
    for (const total of [20_000, 60_000]) {
      const { upper, lower } = sandLevels(bulbs, shapeFraction(TICK_MS + TRANSITION_MS, total))
      expect(upper).toBeCloseTo(waistY(bulbs), 6)
      expect(lower).toBeCloseTo(waistY(bulbs), 6)
    }
  })
})
