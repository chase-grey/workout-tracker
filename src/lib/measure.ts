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
 * The handle a mode's plumb line hangs from, for a mode measured off vertical
 * rather than off a second body line. Without the line drawn, the number on the
 * photo has nothing to be read against. Null when both of the mode's lines are
 * body lines and the angle between them is visible on its own.
 */
export const VERTICAL_REF: Record<MeasureMode, string | null> = {
  split: null,
  tailors: 'center',
}

/** Shortest plumb line worth drawing, as a fraction of the photo's height. */
const MIN_GUIDE = 0.14

/**
 * The plumb line to draw for this mode: from its reference handle, straight up
 * to the height of the highest handle measured against it (and never so short
 * it can't be seen). In normalized coords, like the handles.
 */
export function verticalGuide(mode: MeasureMode, h: Handles): { from: Pt; toY: number } | null {
  const key = VERTICAL_REF[mode]
  if (!key) return null
  const from = h[key]
  if (!from) return null
  const ends = SEGMENTS[mode]
    .filter((s) => s.from === key)
    .map((s) => h[s.to])
    .filter((p): p is Pt => p !== undefined)
  if (ends.length === 0) return null
  return { from, toY: Math.min(...ends.map((p) => p.y), from.y - MIN_GUIDE) }
}

/**
 * Where a reading actually sits on the photo: the vertex the angle opens from,
 * the two rays that bound it, and which way to put the arc and the number.
 */
export type AngleMark = {
  vertex: Pt
  /** Unit directions of the two bounding rays. */
  rays: [Pt, Pt]
  /** Unit direction bisecting them — the middle of the wedge. */
  bisector: Pt
  /** How far the nearer bounding ray reaches, so an arc can be sized to fit. */
  reach: number
  deg: number
  /** The line this reading belongs to, for coloring it to match. */
  role: Segment['role']
}

const vec = (from: Pt, to: Pt): Pt => ({ x: to.x - from.x, y: to.y - from.y })

const unitVec = (p: Pt): Pt | null => {
  const m = Math.hypot(p.x, p.y)
  return m < 1e-9 ? null : { x: p.x / m, y: p.y / m }
}

/**
 * Direction bisecting two unit rays. Opposite rays — a straight 180° reading,
 * which is the whole point of the split — sum to nothing and have two bisectors,
 * so fall back to a perpendicular, taking the downward one: on a photo of either
 * pose the body is above the vertex and the wedge opens below it.
 */
function bisect(a: Pt, b: Pt): Pt {
  const sum = unitVec({ x: a.x + b.x, y: a.y + b.y })
  if (sum) return sum
  const perp = { x: -a.y, y: a.x }
  return perp.y < 0 ? { x: -perp.x, y: -perp.y } : perp
}

/**
 * The angles to annotate on a measured photo, in the order they're read.
 *
 * Pass handles in a space where both axes share a scale — pixels, not the
 * per-axis normalized handles. Both are the same space up to a uniform scale
 * (see `sub`), so a pixel-space arc spans exactly the angle that was logged;
 * hand it the raw normalized handles and it would draw a different angle than
 * the number beside it. Readings whose handles are missing, or sat on top of
 * their vertex, are left out rather than drawn somewhere arbitrary.
 */
export function angleMarks(mode: MeasureMode, h: Handles, r: MeasureResult): AngleMark[] {
  if (mode === 'split') {
    const { hip, ankleL, ankleR } = h
    if (!hip || !ankleL || !ankleR || r.splitDeg == null) return []
    const legL = vec(hip, ankleL)
    const legR = vec(hip, ankleR)
    const a = unitVec(legL)
    const b = unitVec(legR)
    if (!a || !b) return []
    // The split is one angle across both legs, so it takes the neutral color
    // rather than either leg's.
    return [
      {
        vertex: hip,
        rays: [a, b],
        bisector: bisect(a, b),
        reach: Math.min(Math.hypot(legL.x, legL.y), Math.hypot(legR.x, legR.y)),
        deg: r.splitDeg,
        role: 'ref',
      },
    ]
  }

  const center = h.center
  if (!center) return []
  const sides = [
    { key: 'kneeL', deg: r.tailorsLeftDeg, role: 'a' as const },
    { key: 'kneeR', deg: r.tailorsRightDeg, role: 'b' as const },
  ]
  const marks: AngleMark[] = []
  for (const s of sides) {
    const knee = h[s.key]
    if (!knee || s.deg == null) continue
    const leg = vec(center, knee)
    const u = unitVec(leg)
    if (!u) continue
    // Measured off straight up, so the plumb line is the angle's other ray.
    marks.push({
      vertex: center,
      rays: [UP, u],
      bisector: bisect(UP, u),
      reach: Math.hypot(leg.x, leg.y),
      deg: s.deg,
      role: s.role,
    })
  }
  return marks
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
 *
 * `mirrored` says the photo is a mirror image of the body — a front-camera
 * selfie. The detector names sides from what it sees, and a mirrored body looks
 * like an ordinary one facing the lens, so the knee it calls left is the one you
 * call right. Swapping the pairs back keeps a handle labelled "left" on the side
 * you'd call left, which is the side the angle gets logged under.
 */
export function handlesFromLandmarks(
  mode: MeasureMode,
  lms: Landmark[],
  mirrored = false,
): Handles | null {
  if (lms.length <= POSE.RIGHT_ANKLE) return null
  const sides = <T,>(l: T, r: T): [T, T] => (mirrored ? [r, l] : [l, r])

  if (mode === 'split') {
    const [iAnkleL, iAnkleR] = sides(POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE)
    const hipL = lms[POSE.LEFT_HIP]
    const hipR = lms[POSE.RIGHT_HIP]
    const ankleL = lms[iAnkleL]
    const ankleR = lms[iAnkleR]
    if (![hipL, hipR, ankleL, ankleR].every(seen)) return null
    return {
      hip: midpoint(hipL, hipR),
      ankleL: { x: ankleL.x, y: ankleL.y },
      ankleR: { x: ankleR.x, y: ankleR.y },
    }
  }

  const need = [POSE.LEFT_KNEE, POSE.RIGHT_KNEE, POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE]
  if (!need.every((i) => seen(lms[i]))) return null
  const [iKneeL, iKneeR] = sides(POSE.LEFT_KNEE, POSE.RIGHT_KNEE)
  return {
    center: midpoint(lms[POSE.LEFT_ANKLE], lms[POSE.RIGHT_ANKLE]),
    kneeL: { x: lms[iKneeL].x, y: lms[iKneeL].y },
    kneeR: { x: lms[iKneeR].x, y: lms[iKneeR].y },
  }
}

/** The left/right handle pair each mode has, if any. */
const SIDE_PAIR: Record<MeasureMode, [string, string] | null> = {
  split: null, // the split is one angle across both legs — sides don't change it
  tailors: ['kneeL', 'kneeR'],
}

/** Whether swapping sides would change what gets logged for this mode. */
export const hasSides = (mode: MeasureMode): boolean => SIDE_PAIR[mode] !== null

/**
 * Trade the left and right handles, for when a photo's mirroring wasn't what we
 * assumed and the two angles came out under the wrong sides.
 */
export function swapSides(mode: MeasureMode, h: Handles): Handles {
  const pair = SIDE_PAIR[mode]
  if (!pair) return h
  const [a, b] = pair
  if (!h[a] || !h[b]) return h
  return { ...h, [a]: h[b], [b]: h[a] }
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
