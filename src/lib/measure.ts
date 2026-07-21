import {
  POSE,
  midpoint,
  angleBetweenVectors,
  type Pt,
} from './splitAngle'

/**
 * Photo-based angle measurement: the two supported poses, how their draggable
 * handles map to landmarks, and how the handles turn back into logged angles.
 *
 * Handles are stored in normalized image coordinates (0..1, origin top-left) so
 * they render the same regardless of the photo's pixel size.
 */

export type MeasureMode = 'split' | 'tailors'

/** Named draggable points, keyed by handle id, in normalized (0..1) coords. */
export type Handles = Record<string, Pt>

/** The angle fields a measurement can produce (a subset of FlexMeasurement). */
export type MeasureResult = {
  splitDeg?: number | null
  tailorsLeftDeg?: number | null
  tailorsRightDeg?: number | null
}

export type HandleSpec = { key: string; label: string }
/** A line to draw between two handles, with a color role. */
export type Segment = { from: string; to: string; role: 'a' | 'b' | 'ref' }

export const MEASURE_LABEL: Record<MeasureMode, string> = {
  split: 'Side split',
  tailors: "Tailor's pose",
}

/** Handles the user can drag, per mode (also the order they render). */
export const HANDLES: Record<MeasureMode, HandleSpec[]> = {
  split: [
    { key: 'hip', label: 'Hips' },
    { key: 'ankleL', label: 'Left ankle' },
    { key: 'ankleR', label: 'Right ankle' },
  ],
  tailors: [
    { key: 'hipC', label: 'Hips' },
    { key: 'shoulderC', label: 'Shoulders' },
    { key: 'ankleC', label: 'Ankles' },
    { key: 'kneeL', label: 'Left knee' },
    { key: 'kneeR', label: 'Right knee' },
  ],
}

/** Lines drawn between handles, per mode. */
export const SEGMENTS: Record<MeasureMode, Segment[]> = {
  split: [
    { from: 'hip', to: 'ankleL', role: 'a' },
    { from: 'hip', to: 'ankleR', role: 'b' },
  ],
  tailors: [
    { from: 'hipC', to: 'shoulderC', role: 'ref' },
    { from: 'ankleC', to: 'kneeL', role: 'a' },
    { from: 'ankleC', to: 'kneeR', role: 'b' },
  ],
}

/** Fallback handle positions when pose detection fails — a rough centered pose. */
export function defaultHandles(mode: MeasureMode): Handles {
  if (mode === 'split') {
    return {
      hip: { x: 0.5, y: 0.45 },
      ankleL: { x: 0.2, y: 0.6 },
      ankleR: { x: 0.8, y: 0.6 },
    }
  }
  return {
    hipC: { x: 0.5, y: 0.55 },
    shoulderC: { x: 0.5, y: 0.3 },
    ankleC: { x: 0.5, y: 0.72 },
    kneeL: { x: 0.35, y: 0.62 },
    kneeR: { x: 0.65, y: 0.62 },
  }
}

/** Build initial handles from detected landmarks, or null if too few points. */
export function handlesFromLandmarks(mode: MeasureMode, lms: Pt[]): Handles | null {
  if (lms.length <= POSE.RIGHT_ANKLE) return null
  const at = (i: number): Pt | undefined => lms[i]

  if (mode === 'split') {
    const hipL = at(POSE.LEFT_HIP)
    const hipR = at(POSE.RIGHT_HIP)
    const ankleL = at(POSE.LEFT_ANKLE)
    const ankleR = at(POSE.RIGHT_ANKLE)
    if (!hipL || !hipR || !ankleL || !ankleR) return null
    return {
      hip: midpoint(hipL, hipR),
      ankleL: { x: ankleL.x, y: ankleL.y },
      ankleR: { x: ankleR.x, y: ankleR.y },
    }
  }

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
  if (need.some((i) => at(i) === undefined)) return null
  return {
    hipC: midpoint(lms[POSE.LEFT_HIP], lms[POSE.RIGHT_HIP]),
    shoulderC: midpoint(lms[POSE.LEFT_SHOULDER], lms[POSE.RIGHT_SHOULDER]),
    ankleC: midpoint(lms[POSE.LEFT_ANKLE], lms[POSE.RIGHT_ANKLE]),
    kneeL: { x: lms[POSE.LEFT_KNEE].x, y: lms[POSE.LEFT_KNEE].y },
    kneeR: { x: lms[POSE.RIGHT_KNEE].x, y: lms[POSE.RIGHT_KNEE].y },
  }
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })

/** Compute the logged angle(s) from the current handle positions. */
export function anglesFromHandles(mode: MeasureMode, h: Handles): MeasureResult {
  if (mode === 'split') {
    return { splitDeg: angleBetweenVectors(sub(h.ankleL, h.hip), sub(h.ankleR, h.hip)) }
  }
  const spine = sub(h.shoulderC, h.hipC)
  return {
    tailorsLeftDeg: angleBetweenVectors(spine, sub(h.kneeL, h.ankleC)),
    tailorsRightDeg: angleBetweenVectors(spine, sub(h.kneeR, h.ankleC)),
  }
}

/** Short human summary of a result, e.g. "92°" or "L 55° · R 54°". */
export function summarizeResult(mode: MeasureMode, r: MeasureResult): string {
  if (mode === 'split') return `${r.splitDeg ?? 0}°`
  return `L ${r.tailorsLeftDeg ?? 0}° · R ${r.tailorsRightDeg ?? 0}°`
}
