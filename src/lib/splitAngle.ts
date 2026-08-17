/**
 * Geometry primitives the photo measurement is built out of: the landmark
 * indices, a midpoint, and the angle between two vectors.
 *
 * Nothing here knows about normalized image coordinates. Points must reach
 * `angleBetweenVectors` in a space where x and y share a scale — handles are
 * normalized against a different dimension per axis, so lib/measure converts
 * them with the photo's aspect ratio first. This file used to carry
 * landmarks-to-angle helpers that skipped that step and read every angle wider
 * than it was; they were removed rather than fixed, since lib/measure computes
 * from draggable handles now and nothing else needs them.
 */

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
