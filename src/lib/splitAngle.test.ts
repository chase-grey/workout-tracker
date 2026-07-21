import { describe, it, expect } from 'vitest'
import {
  straddleAngleDeg,
  straddleAngleFromLandmarks,
  angleBetweenVectors,
  tailorsAnglesDeg,
  tailorsAnglesFromLandmarks,
  midpoint,
  POSE,
  type Pt,
} from './splitAngle'

describe('straddleAngleDeg', () => {
  it('returns ~180 for a full split (legs form a straight horizontal line)', () => {
    const angle = straddleAngleDeg(
      { x: 0.4, y: 0.5 }, // hipL
      { x: 0.6, y: 0.5 }, // hipR
      { x: 0.05, y: 0.5 }, // ankleL (far left)
      { x: 0.95, y: 0.5 }, // ankleR (far right)
    )
    expect(angle).toBeCloseTo(180, 0)
    expect(angle).toBeGreaterThanOrEqual(179)
  })

  it('returns ~0 for legs together pointing down', () => {
    const angle = straddleAngleDeg(
      { x: 0.45, y: 0.5 }, // hipL
      { x: 0.55, y: 0.5 }, // hipR
      { x: 0.5, y: 0.9 }, // ankleL (near center-bottom)
      { x: 0.5, y: 0.9 }, // ankleR (near center-bottom)
    )
    expect(angle).toBeCloseTo(0, 0)
    expect(angle).toBeLessThanOrEqual(2)
  })

  it('returns ~90 for arms at a right angle', () => {
    // vertex = midpoint of hips = (0.5, 0.5).
    // armA points straight down; armB points straight to the right.
    const angle = straddleAngleDeg(
      { x: 0.45, y: 0.5 }, // hipL
      { x: 0.55, y: 0.5 }, // hipR
      { x: 0.5, y: 0.9 }, // ankleL -> straight down from vertex
      { x: 0.9, y: 0.5 }, // ankleR -> straight to the side from vertex
    )
    expect(angle).toBeCloseTo(90, 0)
  })

  it('returns 0 when an arm has ~zero length (ankle at the vertex)', () => {
    const angle = straddleAngleDeg(
      { x: 0.4, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.5, y: 0.5 }, // ankleL sits on the vertex => zero-length arm
      { x: 0.95, y: 0.5 },
    )
    expect(angle).toBe(0)
  })
})

describe('straddleAngleFromLandmarks', () => {
  it('returns null for a short array', () => {
    const short: Pt[] = [{ x: 0, y: 0 }]
    expect(straddleAngleFromLandmarks(short)).toBeNull()
  })

  it('returns a number for a full 33-length landmark array', () => {
    const lms: Pt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }))
    lms[POSE.LEFT_HIP] = { x: 0.4, y: 0.5 }
    lms[POSE.RIGHT_HIP] = { x: 0.6, y: 0.5 }
    lms[POSE.LEFT_ANKLE] = { x: 0.05, y: 0.5 }
    lms[POSE.RIGHT_ANKLE] = { x: 0.95, y: 0.5 }

    const angle = straddleAngleFromLandmarks(lms)
    expect(typeof angle).toBe('number')
    expect(angle).toBeCloseTo(180, 0)
  })
})

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

describe('tailorsAnglesDeg', () => {
  // Spine points straight up; each knee line runs from the ankle-center outward.
  const hipC: Pt = { x: 0.5, y: 0.6 }
  const shoulderC: Pt = { x: 0.5, y: 0.3 } // above hips => spine vector points up
  const ankleC: Pt = { x: 0.5, y: 0.7 }

  it('is ~90 per side when knees are level with the ankles (legs horizontal)', () => {
    const { left, right } = tailorsAnglesDeg(
      hipC,
      shoulderC,
      ankleC,
      { x: 0.3, y: 0.7 }, // kneeL straight out to the left
      { x: 0.7, y: 0.7 }, // kneeR straight out to the right
    )
    expect(left).toBeCloseTo(90, 0)
    expect(right).toBeCloseTo(90, 0)
  })

  it('is small when knees are high/together (inflexible)', () => {
    const { left, right } = tailorsAnglesDeg(
      hipC,
      shoulderC,
      ankleC,
      { x: 0.45, y: 0.45 }, // kneeL nearly above the ankle
      { x: 0.55, y: 0.45 }, // kneeR nearly above the ankle
    )
    expect(left).toBeLessThan(30)
    expect(right).toBeLessThan(30)
  })
})

describe('tailorsAnglesFromLandmarks', () => {
  it('returns null for a short array', () => {
    expect(tailorsAnglesFromLandmarks([{ x: 0, y: 0 }])).toBeNull()
  })

  it('computes both sides from a full landmark array', () => {
    const lms: Pt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }))
    lms[POSE.LEFT_SHOULDER] = { x: 0.45, y: 0.3 }
    lms[POSE.RIGHT_SHOULDER] = { x: 0.55, y: 0.3 }
    lms[POSE.LEFT_HIP] = { x: 0.45, y: 0.6 }
    lms[POSE.RIGHT_HIP] = { x: 0.55, y: 0.6 }
    lms[POSE.LEFT_ANKLE] = { x: 0.48, y: 0.7 }
    lms[POSE.RIGHT_ANKLE] = { x: 0.52, y: 0.7 }
    lms[POSE.LEFT_KNEE] = { x: 0.3, y: 0.7 }
    lms[POSE.RIGHT_KNEE] = { x: 0.7, y: 0.7 }

    const res = tailorsAnglesFromLandmarks(lms)
    expect(res).not.toBeNull()
    expect(res!.left).toBeGreaterThan(70)
    expect(res!.right).toBeGreaterThan(70)
  })
})
