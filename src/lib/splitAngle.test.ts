import { describe, it, expect } from 'vitest'
import {
  straddleAngleDeg,
  straddleAngleFromLandmarks,
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
