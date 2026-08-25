import { describe, expect, it } from 'vitest'
import { BOXED_GLASS, chamberFill, glassPaths, TALL_GLASS, waterLines } from './waterclock'

const GLASSES = [
  ['tall', TALL_GLASS],
  ['boxed', BOXED_GLASS],
] as const

describe('waterLines', () => {
  it('starts full above and empty below', () => {
    for (const [, glass] of GLASSES) {
      const { upper, lower } = waterLines(glass, 1)
      expect(upper).toBe(glass.top)
      expect(lower).toBe(glass.bottom)
    }
  })

  it('ends with both lines at the waist', () => {
    for (const [, glass] of GLASSES) {
      const { upper, lower } = waterLines(glass, 0)
      expect(upper).toBe(glass.waist)
      expect(lower).toBe(glass.waist)
    }
  })

  it('empties the chamber above by exactly what it fills below', () => {
    for (const [, glass] of GLASSES) {
      for (const level of [0.9, 0.5, 0.25, 0.1]) {
        const { upper, lower } = waterLines(glass, level)
        const emptied = (upper - glass.top) / (glass.waist - glass.top)
        const filled = (glass.bottom - lower) / (glass.bottom - glass.waist)
        // Either line alone says how much rest is left, so they have to agree.
        expect(emptied).toBeCloseTo(filled)
        expect(emptied).toBeCloseTo(1 - level)
      }
    }
  })

  it('holds at the ends rather than running past them', () => {
    for (const [, glass] of GLASSES) {
      expect(waterLines(glass, 2).upper).toBe(glass.top)
      expect(waterLines(glass, -1).lower).toBe(glass.waist)
    }
  })
})

describe('glassPaths', () => {
  it('meets at the waist, chamber to chamber', () => {
    for (const [, glass] of GLASSES) {
      const { upper, lower } = glassPaths(glass)
      const neck = `${glass.width / 2 - glass.waistHalf} ${glass.waist}`
      expect(upper).toContain(neck)
      expect(lower).toContain(neck)
    }
  })

  it('caps the boxed glass and leaves the tall one bare', () => {
    expect(glassPaths(TALL_GLASS).caps).toHaveLength(0)
    const caps = glassPaths(BOXED_GLASS).caps
    expect(caps).toHaveLength(2)
    // One above the glass and one below it, neither over the water.
    expect(caps[0].y + caps[0].height).toBeLessThanOrEqual(BOXED_GLASS.top)
    expect(caps[1].y).toBeGreaterThanOrEqual(BOXED_GLASS.bottom)
    // And both reach past the chamber's shoulders, the way a frame does.
    for (const cap of caps) {
      expect(cap.x).toBeLessThan(BOXED_GLASS.wall)
      expect(cap.x + cap.width).toBeGreaterThan(BOXED_GLASS.width - BOXED_GLASS.wall)
    }
  })

  it('keeps the whole glass inside its own box', () => {
    for (const [, glass] of GLASSES) {
      const { caps } = glassPaths(glass)
      for (const cap of caps) {
        expect(cap.y).toBeGreaterThanOrEqual(0)
        expect(cap.y + cap.height).toBeLessThanOrEqual(glass.height)
      }
      expect(glass.bottom).toBeLessThan(glass.height)
      expect(glass.waist).toBeGreaterThan(glass.top)
      expect(glass.waist).toBeLessThan(glass.bottom)
    }
  })
})

describe('chamberFill', () => {
  it('runs past both walls, so its clipped edges never show', () => {
    const fill = chamberFill(TALL_GLASS, 40, TALL_GLASS.waist)
    const numbers = fill.split(' ').map(Number).filter((n) => !Number.isNaN(n))
    expect(Math.min(...numbers)).toBeLessThan(0)
    expect(Math.max(...numbers)).toBeGreaterThan(TALL_GLASS.width)
  })

  it('is flat-topped at the surface it was given', () => {
    const fill = chamberFill(TALL_GLASS, 40, 75)
    expect(fill.startsWith('M -10 40')).toBe(true)
    expect(fill).toContain('V 75')
  })
})
