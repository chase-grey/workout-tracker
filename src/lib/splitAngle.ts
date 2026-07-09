export type Pt = { x: number; y: number }

// MediaPipe Pose landmark indices we use.
export const POSE = {
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const

/** Treat vectors shorter than this as zero-length (guards against divide-by-zero). */
const EPSILON = 1e-9

/**
 * Angle (degrees, 0..180) between the two legs, measured at the hip midpoint.
 * vertex = midpoint(hipL, hipR); armA = ankleL - vertex; armB = ankleR - vertex;
 * angle = acos( (armA·armB) / (|armA||armB|) ), clamped, in degrees.
 *
 * Returns 0 if either arm has ~zero length.
 */
export function straddleAngleDeg(hipL: Pt, hipR: Pt, ankleL: Pt, ankleR: Pt): number {
  const vertex: Pt = {
    x: (hipL.x + hipR.x) / 2,
    y: (hipL.y + hipR.y) / 2,
  }

  const armA: Pt = { x: ankleL.x - vertex.x, y: ankleL.y - vertex.y }
  const armB: Pt = { x: ankleR.x - vertex.x, y: ankleR.y - vertex.y }

  const magA = Math.hypot(armA.x, armA.y)
  const magB = Math.hypot(armB.x, armB.y)

  if (magA < EPSILON || magB < EPSILON) {
    return 0
  }

  const dot = armA.x * armB.x + armA.y * armB.y
  const cos = Math.min(1, Math.max(-1, dot / (magA * magB)))
  const deg = (Math.acos(cos) * 180) / Math.PI

  return Math.round(deg * 10) / 10
}

/**
 * Convenience: pull the needed points from a full landmark array and compute.
 * Return null if the array is too short or any needed point is missing.
 */
export function straddleAngleFromLandmarks(lms: Pt[]): number | null {
  if (lms.length <= POSE.RIGHT_ANKLE) {
    return null
  }

  const hipL = lms[POSE.LEFT_HIP]
  const hipR = lms[POSE.RIGHT_HIP]
  const ankleL = lms[POSE.LEFT_ANKLE]
  const ankleR = lms[POSE.RIGHT_ANKLE]

  if (
    hipL === undefined ||
    hipR === undefined ||
    ankleL === undefined ||
    ankleR === undefined
  ) {
    return null
  }

  return straddleAngleDeg(hipL, hipR, ankleL, ankleR)
}
