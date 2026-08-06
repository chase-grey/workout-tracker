import { describe, it, expect } from 'vitest'
import {
  HANDLES,
  SEGMENTS,
  anglesFromHandles,
  defaultHandles,
  handlesFromLandmarks,
  hasSides,
  summarizeResult,
  swapSides,
  type Handles,
} from './measure'
import { POSE, type Pt } from './splitAngle'
import type { Landmark } from './pose'

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
    expect(anglesFromHandles('split', h, 1).splitDeg).toBeCloseTo(180, 0)
  })

  it('split: reads the angle drawn on the photo, not the normalized one', () => {
    // Same handles, 45° apart from vertical on a square photo. A 3:4 portrait
    // shot squeezes the horizontal reach, so the real angle is narrower.
    const h: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleL: { x: 0.2, y: 0.8 },
      ankleR: { x: 0.8, y: 0.8 },
    }
    expect(anglesFromHandles('split', h, 1).splitDeg).toBeCloseTo(90, 0)
    expect(anglesFromHandles('split', h, 0.75).splitDeg).toBeCloseTo(73.7, 1)
  })

  it('tailors: knees level with the center dot read ~90° off vertical', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.7 },
      kneeL: { x: 0.3, y: 0.7 },
      kneeR: { x: 0.7, y: 0.7 },
    }
    const r = anglesFromHandles('tailors', h, 0.75)
    expect(r.tailorsLeftDeg).toBeCloseTo(90, 0)
    expect(r.tailorsRightDeg).toBeCloseTo(90, 0)
  })

  it('tailors: a knee straight above the center dot reads ~0°', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.7 },
      kneeL: { x: 0.5, y: 0.4 },
      kneeR: { x: 0.7, y: 0.55 },
    }
    const r = anglesFromHandles('tailors', h, 0.75)
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

  it('rejects landmarks the detector says it could not see', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
    expect(handlesFromLandmarks('split', lms)).not.toBeNull()

    lms[POSE.LEFT_ANKLE] = { x: 0.1, y: 0.6, visibility: 0.1 }
    expect(handlesFromLandmarks('split', lms)).toBeNull()
  })

  it('tailors: needs both knees and both ankles seen', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
    expect(handlesFromLandmarks('tailors', lms)).not.toBeNull()

    lms[POSE.RIGHT_KNEE] = { x: 0.7, y: 0.8, visibility: 0.2 }
    expect(handlesFromLandmarks('tailors', lms)).toBeNull()
  })

  it('tailors: reads a mirrored photo onto the side the body calls left', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0.9 }))
    lms[POSE.LEFT_KNEE] = { x: 0.7, y: 0.8, visibility: 0.9 }
    lms[POSE.RIGHT_KNEE] = { x: 0.3, y: 0.8, visibility: 0.9 }

    expect(handlesFromLandmarks('tailors', lms)!.kneeL.x).toBe(0.7)
    // A front-camera shot flips the body, so the detector's "left knee" is the
    // knee the user calls right.
    expect(handlesFromLandmarks('tailors', lms, true)!.kneeL.x).toBe(0.3)
    expect(handlesFromLandmarks('tailors', lms, true)!.kneeR.x).toBe(0.7)
  })

  it('split: mirroring swaps the ankles but leaves the hip midpoint alone', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
    lms[POSE.LEFT_HIP] = { x: 0.4, y: 0.5, visibility: 0.9 }
    lms[POSE.RIGHT_HIP] = { x: 0.6, y: 0.5, visibility: 0.9 }
    lms[POSE.LEFT_ANKLE] = { x: 0.9, y: 0.6, visibility: 0.9 }
    lms[POSE.RIGHT_ANKLE] = { x: 0.1, y: 0.6, visibility: 0.9 }

    const h = handlesFromLandmarks('split', lms, true)!
    expect(h.hip).toEqual({ x: 0.5, y: 0.5 })
    expect(h.ankleL.x).toBe(0.1)
    expect(h.ankleR.x).toBe(0.9)
  })
})

describe('swapSides', () => {
  it('trades the two tailors knees, and reverses the logged angles with them', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.9 },
      kneeL: { x: 0.5, y: 0.6 },
      kneeR: { x: 0.2, y: 0.9 },
    }
    const before = anglesFromHandles('tailors', h, 0.75)
    const after = anglesFromHandles('tailors', swapSides('tailors', h), 0.75)
    expect(after.tailorsLeftDeg).toBe(before.tailorsRightDeg)
    expect(after.tailorsRightDeg).toBe(before.tailorsLeftDeg)
  })

  it('leaves the split alone — it has one angle across both legs', () => {
    expect(hasSides('split')).toBe(false)
    expect(hasSides('tailors')).toBe(true)
    const h = defaultHandles('split')
    expect(swapSides('split', h)).toBe(h)
  })
})

describe('summarizeResult', () => {
  it('formats split and tailors results', () => {
    expect(summarizeResult('split', { splitDeg: 92 })).toBe('92°')
    expect(summarizeResult('tailors', { tailorsLeftDeg: 55, tailorsRightDeg: 54 })).toBe('L 55° · R 54°')
  })
})
