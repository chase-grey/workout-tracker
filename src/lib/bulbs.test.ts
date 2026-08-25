import { describe, expect, it } from 'vitest'
import {
  bulbArea,
  bulbPath,
  createBulbs,
  halfWidthAt,
  levelAtArea,
  sandLevels,
  waistY,
  type Bulbs,
  type BulbsSpec,
} from './bulbs'

const SPEC: BulbsSpec = { cx: 50, top: 8, bottom: 92, rimHalf: 30, waistHalf: 3.5 }

/**
 * The area of the shape between two heights, integrated independently of the
 * module's own accumulation so the two have to agree. Fine enough that any
 * disagreement is the module's, not the integrator's.
 */
function areaBetween(bulbs: Bulbs, from: number, to: number, steps = 20000): number {
  const dy = (to - from) / steps
  let total = 0
  for (let i = 0; i < steps; i++) {
    const a = halfWidthAt(bulbs, from + i * dy)
    const b = halfWidthAt(bulbs, from + (i + 1) * dy)
    total += (a + b) * dy
  }
  return total
}

describe('createBulbs', () => {
  it('is widest at both rims and narrowest at the waist', () => {
    const bulbs = createBulbs(SPEC)
    const { points } = bulbs
    expect(points[0].half).toBeCloseTo(SPEC.rimHalf, 6)
    expect(points[points.length - 1].half).toBeCloseTo(SPEC.rimHalf, 6)
    expect(halfWidthAt(bulbs, waistY(bulbs))).toBeCloseTo(SPEC.waistHalf, 6)
  })

  it('pinches in all the way to the waist and swells all the way back out', () => {
    const { points } = createBulbs(SPEC)
    const middle = (points.length - 1) / 2
    for (let i = 1; i <= middle; i++) {
      expect(points[i].half).toBeLessThan(points[i - 1].half)
    }
    for (let i = middle + 1; i < points.length; i++) {
      expect(points[i].half).toBeGreaterThan(points[i - 1].half)
    }
  })

  it('mirrors about the waist, so the bulbs match', () => {
    const bulbs = createBulbs(SPEC)
    const waist = waistY(bulbs)
    for (const d of [1, 7, 19, 33, 42]) {
      expect(halfWidthAt(bulbs, waist - d)).toBeCloseTo(halfWidthAt(bulbs, waist + d), 6)
    }
    expect(bulbArea(bulbs) * 2).toBeCloseTo(bulbs.areas[bulbs.areas.length - 1], 6)
  })

  it('lands the waist on a sample however many were asked for', () => {
    for (const samples of [2, 40, 41, 400]) {
      const bulbs = createBulbs({ ...SPEC, samples })
      expect(bulbs.spec.samples % 2).toBe(1)
      const middle = (bulbs.points.length - 1) / 2
      expect(bulbs.points[middle].y).toBeCloseTo(waistY(bulbs), 6)
    }
  })

  it('accumulates area that matches an independent integral', () => {
    const bulbs = createBulbs(SPEC)
    expect(bulbs.areas[0]).toBe(0)
    expect(bulbs.areas[bulbs.areas.length - 1]).toBeCloseTo(
      areaBetween(bulbs, SPEC.top, SPEC.bottom),
      3,
    )
  })
})

describe('sandLevels', () => {
  const bulbs = createBulbs(SPEC)
  const waist = waistY(bulbs)

  it('starts with a full upper bulb and an empty lower one', () => {
    const { upper, lower } = sandLevels(bulbs, 1)
    expect(upper).toBeCloseTo(SPEC.top, 6)
    expect(lower).toBeCloseTo(SPEC.bottom, 6)
  })

  it('ends with both surfaces at the waist', () => {
    const { upper, lower } = sandLevels(bulbs, 0)
    expect(upper).toBeCloseTo(waist, 6)
    expect(lower).toBeCloseTo(waist, 6)
  })

  it('clamps a fraction outside the rest', () => {
    expect(sandLevels(bulbs, 4).upper).toBeCloseTo(SPEC.top, 6)
    // Overtime: rest is up and stays up, rather than the sand carrying on through
    // the waist.
    expect(sandLevels(bulbs, -2).upper).toBeCloseTo(waist, 6)
    expect(sandLevels(bulbs, -2).lower).toBeCloseTo(waist, 6)
  })

  it('keeps the sand still to fall proportional to the rest left', () => {
    // The reading the shape actually makes: the area above the waist, not where its
    // edge happens to be.
    const full = bulbArea(bulbs)
    for (const fraction of [1, 0.9, 0.75, 0.5, 0.25, 0.1, 0]) {
      const { upper } = sandLevels(bulbs, fraction)
      expect(areaBetween(bulbs, upper, waist) / full).toBeCloseTo(fraction, 3)
    }
  })

  it('gives the lower bulb exactly the sand the upper one has lost', () => {
    const full = bulbArea(bulbs)
    for (const fraction of [1, 0.8, 0.5, 0.3, 0]) {
      const { upper, lower } = sandLevels(bulbs, fraction)
      const left = areaBetween(bulbs, upper, waist)
      const fallen = areaBetween(bulbs, lower, SPEC.bottom)
      expect(left + fallen).toBeCloseTo(full, 3)
    }
  })

  it('moves both surfaces one way only, all the way down the rest', () => {
    let last = sandLevels(bulbs, 1)
    for (let i = 199; i >= 0; i--) {
      const now = sandLevels(bulbs, i / 200)
      expect(now.upper).toBeGreaterThan(last.upper)
      expect(now.lower).toBeLessThan(last.lower)
      last = now
    }
  })

  it('runs the surfaces faster through the neck than through the shoulders', () => {
    // The consequence of driving area instead of level, and the thing that makes the
    // shape finish with a rush: equal slices of time move the sand further where the
    // glass is narrow.
    const step = 0.05
    const early = sandLevels(bulbs, 1).upper - sandLevels(bulbs, 1 - step).upper
    const late = sandLevels(bulbs, step).upper - sandLevels(bulbs, 0).upper
    expect(Math.abs(late)).toBeGreaterThan(Math.abs(early) * 3)
  })
})

describe('levelAtArea', () => {
  const bulbs = createBulbs(SPEC)

  it('answers the rims exactly', () => {
    expect(levelAtArea(bulbs, 0)).toBeCloseTo(SPEC.top, 6)
    expect(levelAtArea(bulbs, bulbs.areas[bulbs.areas.length - 1])).toBeCloseTo(SPEC.bottom, 6)
  })

  it('puts half the shape above the waist', () => {
    expect(levelAtArea(bulbs, bulbArea(bulbs))).toBeCloseTo(waistY(bulbs), 3)
  })

  it('holds still rather than running off the ends', () => {
    expect(levelAtArea(bulbs, -500)).toBeCloseTo(SPEC.top, 6)
    expect(levelAtArea(bulbs, 1e6)).toBeCloseTo(SPEC.bottom, 6)
  })

  it('survives a shape with no height at all', () => {
    const flat = createBulbs({ ...SPEC, top: 50, bottom: 50 })
    expect(levelAtArea(flat, 3)).toBe(50)
    expect(sandLevels(flat, 0.5).upper).toBe(50)
  })
})

describe('bulbPath', () => {
  const bulbs = createBulbs({ ...SPEC, samples: 41 })

  it('closes each bulb between its flat end and the waist', () => {
    for (const which of ['upper', 'lower'] as const) {
      const path = bulbPath(bulbs, which)
      expect(path.startsWith('M ')).toBe(true)
      expect(path.endsWith('Z')).toBe(true)
      expect(path).not.toMatch(/NaN|undefined/)
    }
  })

  it('starts each bulb at the outer corner it is measured from', () => {
    // The lower bulb's path has to reach exactly the base, or the parked sand block
    // that rides up out of it would show a sliver of surface with nothing under it.
    expect(bulbPath(bulbs, 'upper')).toContain(`M ${SPEC.cx - SPEC.rimHalf} ${SPEC.top}`)
    expect(bulbPath(bulbs, 'lower')).toContain(`M ${SPEC.cx - SPEC.rimHalf} ${SPEC.bottom}`)
  })

  it('spans the full width and no more', () => {
    const xs = [...bulbPath(bulbs, 'upper').matchAll(/[ML] (-?[\d.]+) /g)].map((m) => Number(m[1]))
    expect(Math.min(...xs)).toBeCloseTo(SPEC.cx - SPEC.rimHalf, 6)
    expect(Math.max(...xs)).toBeCloseTo(SPEC.cx + SPEC.rimHalf, 6)
  })
})
