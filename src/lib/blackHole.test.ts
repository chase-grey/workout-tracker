import { describe, expect, it } from 'vitest'
import {
  BLACK_HOLE_DEBRIS,
  HORIZON_REST,
  INNER_ORBIT,
  debrisState,
  horizonRadius,
  isConsumed,
  orbitPeriod,
  unitArc,
} from './blackHole'

describe('the field', () => {
  it('starts everything on or outside the inner orbit', () => {
    for (const p of BLACK_HOLE_DEBRIS) expect(p.radius).toBeGreaterThanOrEqual(INNER_ORBIT)
  })

  it('consumes pieces one after another, the last just before rest ends', () => {
    const times = BLACK_HOLE_DEBRIS.map((p) => p.consumedAt)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(times.at(-1)).toBeCloseTo(0.98)
    expect(BLACK_HOLE_DEBRIS.filter((p) => isConsumed(p, 0))).toHaveLength(0)
    expect(BLACK_HOLE_DEBRIS.filter((p) => isConsumed(p, 0.98))).toHaveLength(18)
  })
})

describe('orbitPeriod', () => {
  it('makes inner orbits faster than outer ones', () => {
    expect(orbitPeriod(23)).toBeLessThan(orbitPeriod(44))
    expect(orbitPeriod(23)).toBeGreaterThan(10)
    expect(orbitPeriod(44)).toBeLessThan(35)
  })
})

describe('horizonRadius', () => {
  it('rests at its base radius and only grows', () => {
    expect(horizonRadius(0)).toBe(HORIZON_REST)
    let last = 0
    for (let eaten = 0; eaten <= 1; eaten += 0.01) {
      const r = horizonRadius(eaten)
      expect(r).toBeGreaterThanOrEqual(last)
      last = r
    }
  })

  it('about doubles on a full meal but never reaches the inner orbit', () => {
    const full = horizonRadius(1)
    expect(full).toBeGreaterThan(16)
    expect(full).toBeLessThan(INNER_ORBIT - 5)
  })
})

describe('debrisState', () => {
  const piece = BLACK_HOLE_DEBRIS[0]

  it('sits on its orbit before anything has happened', () => {
    const s = debrisState(piece, 0, HORIZON_REST)
    expect(s.radius).toBe(piece.radius)
  })

  it('keeps its drawn size as it falls, rather than shrinking with its orbit', () => {
    const far = debrisState(piece, 0, HORIZON_REST)
    const nearer = debrisState(piece, piece.consumedAt * 0.4, HORIZON_REST)
    // The dot's radius is a fraction of the orbit radius; the product is the drawn size.
    expect(nearer.size * nearer.radius).toBeCloseTo(far.size * far.radius, 1)
  })

  it('is still a round dot of the same size at the horizon, with its wake unchanged', () => {
    const start = debrisState(piece, 0, HORIZON_REST)
    const s = debrisState(piece, piece.consumedAt * 0.95, HORIZON_REST)
    expect(s.size * s.radius).toBeCloseTo(start.size * start.radius, 1)
    expect(s.wake).toBe(start.wake)
  })

  it('is only just hidden when it counts as eaten, so the swell lands as it vanishes', () => {
    for (const p of BLACK_HOLE_DEBRIS) {
      // The horizon as it stood before this piece went in.
      const horizon = horizonRadius(p.consumedAt - 1e-9)
      const s = debrisState(p, p.consumedAt, horizon)
      const farEdge = s.radius + s.size * s.radius
      expect(farEdge).toBeLessThan(horizon)
      expect(farEdge).toBeGreaterThan(horizon - 1)
    }
  })

})

describe('unitArc', () => {
  it('draws from the trailing angle up to the piece at angle zero', () => {
    expect(unitArc(-90, 0)).toBe('M 0.0000 -1.0000 A 1 1 0 0 1 1.0000 0.0000')
  })
})
