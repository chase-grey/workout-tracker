export type Pt = { x: number; y: number }

// MediaPipe Pose landmark indices we use.
export const POSE = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const

/** Treat vectors shorter than this as zero-length (guards against divide-by-zero). */
const EPSILON = 1e-9

/** Midpoint of two points. */
export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Angle (degrees, 0..180) between two vectors, rounded to 0.1°.
 * Returns 0 if either vector has ~zero length.
 */
export function angleBetweenVectors(a: Pt, b: Pt): number {
  const magA = Math.hypot(a.x, a.y)
  const magB = Math.hypot(b.x, b.y)
  if (magA < EPSILON || magB < EPSILON) return 0

  const dot = a.x * b.x + a.y * b.y
  const cos = Math.min(1, Math.max(-1, dot / (magA * magB)))
  const deg = (Math.acos(cos) * 180) / Math.PI
  return Math.round(deg * 10) / 10
}

/**
 * Angle (degrees, 0..180) between the two legs, measured at the hip midpoint.
 * vertex = midpoint(hipL, hipR); armA = ankleL - vertex; armB = ankleR - vertex;
 * angle = acos( (armA·armB) / (|armA||armB|) ), clamped, in degrees.
 *
 * Returns 0 if either arm has ~zero length.
 */
export function straddleAngleDeg(hipL: Pt, hipR: Pt, ankleL: Pt, ankleR: Pt): number {
  const vertex = midpoint(hipL, hipR)
  const armA: Pt = { x: ankleL.x - vertex.x, y: ankleL.y - vertex.y }
  const armB: Pt = { x: ankleR.x - vertex.x, y: ankleR.y - vertex.y }
  return angleBetweenVectors(armA, armB)
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

/**
 * Tailor's-pose (butterfly) openness, per side, in degrees (0..180).
 *
 * Convention (front-on shot): one reference line runs up the spine
 * (hip-center → shoulder-center); each side's line runs from the ankle-center
 * to that knee. The angle between the spine line and a knee line grows as the
 * knee drops down/outward, so a larger number means a more open (more flexible)
 * hip. Left uses the left knee, right uses the right knee.
 */
export function tailorsAnglesDeg(
  hipCenter: Pt,
  shoulderCenter: Pt,
  ankleCenter: Pt,
  kneeL: Pt,
  kneeR: Pt,
): { left: number; right: number } {
  const spine: Pt = { x: shoulderCenter.x - hipCenter.x, y: shoulderCenter.y - hipCenter.y }
  const legL: Pt = { x: kneeL.x - ankleCenter.x, y: kneeL.y - ankleCenter.y }
  const legR: Pt = { x: kneeR.x - ankleCenter.x, y: kneeR.y - ankleCenter.y }
  return {
    left: angleBetweenVectors(spine, legL),
    right: angleBetweenVectors(spine, legR),
  }
}

/**
 * Convenience: derive tailor's angles from a full landmark array. Uses the
 * shoulder/hip/knee/ankle midpoints. Returns null if the array is too short.
 */
export function tailorsAnglesFromLandmarks(
  lms: Pt[],
): { left: number; right: number } | null {
  if (lms.length <= POSE.RIGHT_ANKLE) return null
  const need = [
    POSE.LEFT_SHOULDER,
    POSE.RIGHT_SHOULDER,
    POSE.LEFT_HIP,
    POSE.RIGHT_HIP,
    POSE.LEFT_KNEE,
    POSE.RIGHT_KNEE,
    POSE.LEFT_ANKLE,
    POSE.RIGHT_ANKLE,
  ]
  if (need.some((i) => lms[i] === undefined)) return null

  return tailorsAnglesDeg(
    midpoint(lms[POSE.LEFT_HIP], lms[POSE.RIGHT_HIP]),
    midpoint(lms[POSE.LEFT_SHOULDER], lms[POSE.RIGHT_SHOULDER]),
    midpoint(lms[POSE.LEFT_ANKLE], lms[POSE.RIGHT_ANKLE]),
    lms[POSE.LEFT_KNEE],
    lms[POSE.RIGHT_KNEE],
  )
}
