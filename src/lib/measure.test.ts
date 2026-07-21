import { describe, it, expect } from 'vitest'
import {
  HANDLES,
  SEGMENTS,
  anglesFromHandles,
  defaultHandles,
  handlesFromLandmarks,
  summarizeResult,
  type Handles,
} from './measure'
import { POSE, type Pt } from './splitAngle'

describe('defaultHandles', () => {
  it('provides every handle key each mode declares', () => {
    for (const mode of ['split', 'tailors'] as const) {
      const h = defaultHandles(mode)
      for (const spec of HANDLES[mode]) expect(h[spec.key]).toBeDefined()
    }
  })

  it('references only known handle keys in its segments', () => {
    for (const mode of ['split', 'tailors'] as const) {
      const keys = new Set(HANDLES[mode].map((s) => s.key))
      for (const seg of SEGMENTS[mode]) {
        expect(keys.has(seg.from)).toBe(true)
        expect(keys.has(seg.to)).toBe(true)
      }
    }
  })
})

describe('anglesFromHandles', () => {
  it('split: straight horizontal line is ~180°', () => {
    const h: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleL: { x: 0.1, y: 0.5 },
      ankleR: { x: 0.9, y: 0.5 },
    }
    expect(anglesFromHandles('split', h).splitDeg).toBeCloseTo(180, 0)
  })

  it('tailors: knees level with the center dot read ~90° off vertical', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.7 },
      kneeL: { x: 0.3, y: 0.7 },
      kneeR: { x: 0.7, y: 0.7 },
    }
    const r = anglesFromHandles('tailors', h)
    expect(r.tailorsLeftDeg).toBeCloseTo(90, 0)
    expect(r.tailorsRightDeg).toBeCloseTo(90, 0)
  })

  it('tailors: a knee straight above the center dot reads ~0°', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.7 },
      kneeL: { x: 0.5, y: 0.4 },
      kneeR: { x: 0.7, y: 0.55 },
    }
    const r = anglesFromHandles('tailors', h)
    expect(r.tailorsLeftDeg).toBeCloseTo(0, 0)
  })
})

describe('handlesFromLandmarks', () => {
  it('returns null for a short array', () => {
    expect(handlesFromLandmarks('split', [{ x: 0, y: 0 }])).toBeNull()
    expect(handlesFromLandmarks('tailors', [{ x: 0, y: 0 }])).toBeNull()
  })

  it('split: sets the hip handle to the hip midpoint', () => {
    const lms: Pt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }))
    lms[POSE.LEFT_HIP] = { x: 0.4, y: 0.5 }
    lms[POSE.RIGHT_HIP] = { x: 0.6, y: 0.5 }
    lms[POSE.LEFT_ANKLE] = { x: 0.1, y: 0.6 }
    lms[POSE.RIGHT_ANKLE] = { x: 0.9, y: 0.6 }

    const h = handlesFromLandmarks('split', lms)
    expect(h).not.toBeNull()
    expect(h!.hip).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('summarizeResult', () => {
  it('formats split and tailors results', () => {
    expect(summarizeResult('split', { splitDeg: 92 })).toBe('92°')
    expect(summarizeResult('tailors', { tailorsLeftDeg: 55, tailorsRightDeg: 54 })).toBe('L 55° · R 54°')
  })
})
