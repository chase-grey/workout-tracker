import {
  POSE,
  midpoint,
  angleBetweenVectors,
  type Pt,
} from './splitAngle'
import type { Landmark } from './pose'

/**
 * Photo-based angle measurement: the two supported poses, how their draggable
 * handles map to landmarks, and how the handles turn back into logged angles.
 *
 * Handles are stored in normalized image coordinates (0..1, origin top-left) so
 * they render the same regardless of the photo's pixel size. Because x and y are
 * each normalized against a different dimension, every angle has to be computed
 * with the photo's aspect ratio — see `anglesFromHandles`.
 */

export type MeasureMode = 'split' | 'tailors'

/** Whether a shot is a cold or warm reading; absent when it's neither. */
export type MeasureTemp = 'cold' | 'warm'

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

/** Colors each segment/handle role is drawn in (shared by editor + saved photo). */
export const ROLE_COLOR: Record<Segment['role'], string> = {
  a: '#22c55e', // accent green — left arm
  b: '#38bdf8', // sky — right arm
  ref: '#e5e5e5', // neutral — reference line
}

/** Straight up in image coords (y grows downward), the vertical we measure off. */
export const UP: Pt = { x: 0, y: -1 }

export const MEASURE_LABEL: Record<MeasureMode, string> = {
  split: 'side split',
  tailors: "tailor's pose",
}

/** Handles the user can drag, per mode (also the order they render). */
export const HANDLES: Record<MeasureMode, HandleSpec[]> = {
  split: [
    { key: 'hip', label: 'hips' },
    { key: 'ankleL', label: 'left ankle' },
    { key: 'ankleR', label: 'right ankle' },
  ],
  // Tailor's is measured off vertical, so no spine reference line: each knee
  // line runs from the tip of that knee down to a single dot between the feet.
  tailors: [
    { key: 'center', label: 'between feet' },
    { key: 'kneeL', label: 'left knee' },
    { key: 'kneeR', label: 'right knee' },
  ],
}

/** Lines drawn between handles, per mode. */
export const SEGMENTS: Record<MeasureMode, Segment[]> = {
  split: [
    { from: 'hip', to: 'ankleL', role: 'a' },
    { from: 'hip', to: 'ankleR', role: 'b' },
  ],
  tailors: [
    { from: 'center', to: 'kneeL', role: 'a' },
    { from: 'center', to: 'kneeR', role: 'b' },
  ],
}

/**
 * Fallback handle positions when pose detection fails. Placed where a full-body
 * phone shot of each pose usually lands — the dots still need dragging, but from
 * roughly the right part of the body rather than the middle of the frame.
 */
export function defaultHandles(mode: MeasureMode): Handles {
  if (mode === 'split') {
    return {
      hip: { x: 0.5, y: 0.55 },
      ankleL: { x: 0.14, y: 0.88 },
      ankleR: { x: 0.86, y: 0.88 },
    }
  }
  return {
    center: { x: 0.5, y: 0.88 },
    kneeL: { x: 0.3, y: 0.8 },
    kneeR: { x: 0.7, y: 0.8 },
  }
}

/**
 * Below this, MediaPipe is telling us the point is occluded or out of frame and
 * its position is a guess — better to fall back to draggable defaults than to
 * present a guessed landmark as a measurement.
 */
const MIN_VISIBILITY = 0.5

const seen = (p: Landmark | undefined): p is Landmark =>
  p !== undefined && (p.visibility === undefined || p.visibility >= MIN_VISIBILITY)

/**
 * Build initial handles from detected landmarks. Returns null when the points
 * this pose needs are missing or were not confidently seen, which the caller
 * reports rather than quietly papering over.
 */
export function handlesFromLandmarks(mode: MeasureMode, lms: Landmark[]): Handles | null {
  if (lms.length <= POSE.RIGHT_ANKLE) return null

  if (mode === 'split') {
    const hipL = lms[POSE.LEFT_HIP]
    const hipR = lms[POSE.RIGHT_HIP]
    const ankleL = lms[POSE.LEFT_ANKLE]
    const ankleR = lms[POSE.RIGHT_ANKLE]
    if (![hipL, hipR, ankleL, ankleR].every(seen)) return null
    return {
      hip: midpoint(hipL, hipR),
      ankleL: { x: ankleL.x, y: ankleL.y },
      ankleR: { x: ankleR.x, y: ankleR.y },
    }
  }

  const need = [POSE.LEFT_KNEE, POSE.RIGHT_KNEE, POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE]
  if (!need.every((i) => seen(lms[i]))) return null
  return {
    center: midpoint(lms[POSE.LEFT_ANKLE], lms[POSE.RIGHT_ANKLE]),
    kneeL: { x: lms[POSE.LEFT_KNEE].x, y: lms[POSE.LEFT_KNEE].y },
    kneeR: { x: lms[POSE.RIGHT_KNEE].x, y: lms[POSE.RIGHT_KNEE].y },
  }
}

/**
 * Difference of two handles in units where both axes share a scale. Handles are
 * normalized per-axis, so on a portrait photo one normalized step across is a
 * much shorter distance than one step down; scaling x by the aspect ratio
 * (width / height) undoes that stretch. Skip it and the angle we report is not
 * the angle between the lines the user drew.
 */
const sub = (a: Pt, b: Pt, aspect: number): Pt => ({
  x: (a.x - b.x) * aspect,
  y: a.y - b.y,
})

/**
 * Compute the logged angle(s) from the current handle positions.
 * `aspect` is the photo's width / height.
 */
export function anglesFromHandles(mode: MeasureMode, h: Handles, aspect: number): MeasureResult {
  if (mode === 'split') {
    return {
      splitDeg: angleBetweenVectors(
        sub(h.ankleL, h.hip, aspect),
        sub(h.ankleR, h.hip, aspect),
      ),
    }
  }
  // Each knee line's angle off straight-up: knee directly overhead = 0°, knee
  // dropped out to the side = 90° (bigger = more open hip).
  return {
    tailorsLeftDeg: angleBetweenVectors(UP, sub(h.kneeL, h.center, aspect)),
    tailorsRightDeg: angleBetweenVectors(UP, sub(h.kneeR, h.center, aspect)),
  }
}

/** Short human summary of a result, e.g. "92°" or "L 55° · R 54°". */
export function summarizeResult(mode: MeasureMode, r: MeasureResult): string {
  if (mode === 'split') return `${r.splitDeg ?? 0}°`
  return `L ${r.tailorsLeftDeg ?? 0}° · R ${r.tailorsRightDeg ?? 0}°`
}
