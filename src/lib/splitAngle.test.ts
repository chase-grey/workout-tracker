import { describe, it, expect } from 'vitest'
import { angleBetweenVectors, midpoint } from './splitAngle'

describe('angleBetweenVectors', () => {
  it('is 90 for perpendicular vectors', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90, 0)
  })
  it('is 0 for parallel vectors', () => {
    expect(angleBetweenVectors({ x: 2, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(0, 0)
  })
  it('is 180 for opposite vectors', () => {
    expect(angleBetweenVectors({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180, 0)
  })
  it('is 0 when either vector is ~zero length', () => {
    expect(angleBetweenVectors({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(0)
  })
})

describe('midpoint', () => {
  it('averages the two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 1, y: 1 })).toEqual({ x: 0.5, y: 0.5 })
  })
})
