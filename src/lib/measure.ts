import {
  POSE,
  midpoint,
  angleBetweenVectors,
  type Pt,
} from './splitAngle'
import type { Landmark } from './pose'

/**
 * Photo-based angle measurement: the poses that can be measured, how their
 * draggable handles map to landmarks, and how the handles turn back into logged
 * angles.
 *
 * Every mode is one entry in {@link MODE} rather than a branch inside each
 * function. The five poses differ only in their handles, their lines and which
 * field they produce, so a spec table keeps those differences in one readable
 * place — and the per-mode records the UI reads (`HANDLES`, `SEGMENTS`, …) are
 * projections of it, so a mode can't be half-added.
 *
 * Handles are stored in normalized image coordinates (0..1, origin top-left) so
 * they render the same regardless of the photo's pixel size. Because x and y are
 * each normalized against a different dimension, every angle has to be computed
 * with the photo's aspect ratio — see `anglesFromHandles`.
 */

export type MeasureMode =
  | 'split'
  | 'tailors'
  | 'toe_touch'
  | 'leg_lift_left'
  | 'leg_lift_right'

/** Every mode, in the order a picker should offer them. */
export const MEASURE_MODES: MeasureMode[] = [
  'split',
  'tailors',
  'toe_touch',
  'leg_lift_left',
  'leg_lift_right',
]

/** Whether a shot is a cold or warm reading; absent when it's neither. */
export type MeasureTemp = 'cold' | 'warm'

/** Named draggable points, keyed by handle id, in normalized (0..1) coords. */
export type Handles = Record<string, Pt>

/** The angle fields a measurement can produce (a subset of FlexMeasurement). */
export type MeasureResult = {
  splitDeg?: number | null
  tailorsLeftDeg?: number | null
  tailorsRightDeg?: number | null
  toeTouchDeg?: number | null
  legLiftLeftDeg?: number | null
  legLiftRightDeg?: number | null
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
 * The reading a pose whose two lines are both body lines produces: the angle at
 * `vertex` between the handles at `to1` and `to2`. Shared by the split, the toe
 * touch and both leg lifts, which differ only in the handles they name.
 */
const angleAtVertex = (
  h: Handles,
  vertex: string,
  to1: string,
  to2: string,
  aspect: number,
): number | null => {
  if (!h[vertex] || !h[to1] || !h[to2]) return null
  return angleBetweenVectors(sub(h[to1], h[vertex], aspect), sub(h[to2], h[vertex], aspect))
}

/**
 * The single mark such a pose draws: an arc at the vertex spanning the two body
 * lines, sized to whichever of them is shorter. Nothing is drawn when a handle is
 * missing, the reading is absent, or a line collapsed onto its vertex — better
 * than an arc somewhere arbitrary.
 */
function vertexMark(
  h: Handles,
  vertex: string,
  to1: string,
  to2: string,
  deg: number | null | undefined,
  role: Segment['role'],
): AngleMark[] {
  const v = h[vertex]
  const p1 = h[to1]
  const p2 = h[to2]
  if (!v || !p1 || !p2 || deg == null) return []
  const l1 = vec(v, p1)
  const l2 = vec(v, p2)
  const a = unitVec(l1)
  const b = unitVec(l2)
  if (!a || !b) return []
  return [
    {
      vertex: v,
      rays: [a, b],
      bisector: bisect(a, b),
      reach: Math.min(Math.hypot(l1.x, l1.y), Math.hypot(l2.x, l2.y)),
      deg,
      role,
    },
  ]
}

/**
 * Below this, MediaPipe is telling us the point is occluded or out of frame and
 * its position is a guess — better to fall back to draggable defaults than to
 * present a guessed landmark as a measurement.
 */
const MIN_VISIBILITY = 0.5

const seen = (p: Landmark | undefined): p is Landmark =>
  p !== undefined && (p.visibility === undefined || p.visibility >= MIN_VISIBILITY)

const pt = (l: Landmark): Pt => ({ x: l.x, y: l.y })

/** Everything that differs between one measurable pose and the next. */
type ModeSpec = {
  /** Human name, as the camera header and the saved photo's caption say it. */
  label: string
  /** Handles the user can drag (also the order they render). */
  handles: HandleSpec[]
  /** Lines drawn between handles. */
  segments: Segment[]
  /**
   * The handle a plumb line hangs from, for a pose measured off vertical rather
   * than off a second body line. Without the line drawn, the number on the photo
   * has nothing to be read against. Null when both of the pose's lines are body
   * lines and the angle between them is visible on its own.
   */
  verticalRef: string | null
  /** The left/right handle pair the pose has, if any — what `swapSides` trades. */
  sidePair: [string, string] | null
  /**
   * Fallback handle positions when pose detection fails. Placed where a full-body
   * phone shot of the pose usually lands — the dots still need dragging, but from
   * roughly the right part of the body rather than the middle of the frame.
   */
  defaults: Handles
  /**
   * Handles from detected landmarks, or null when the points this pose needs are
   * missing or weren't confidently seen. `mirrored` says the photo is a mirror
   * image of the body — see `handlesFromLandmarks`.
   */
  fromLandmarks: (lms: Landmark[], mirrored: boolean) => Handles | null
  /** The logged angle(s) the current handles produce. */
  angles: (h: Handles, aspect: number) => MeasureResult
  /** Where each reading sits on the photo (pixel-space handles — see `angleMarks`). */
  marks: (h: Handles, r: MeasureResult) => AngleMark[]
  /** Short human summary, e.g. "92°" or "L 55° · R 54°". */
  summarize: (r: MeasureResult) => string
  /**
   * The readings to spell out under the photo while the handles are being
   * dragged — one row per number the pose produces, so the editor shows what
   * the mode measures without knowing which mode it is.
   */
  readings: (r: MeasureResult) => { label: string; deg: number }[]
}

/**
 * One leg lift per side rather than one mode with a side flag: you can only lift
 * one leg per photo, so the side is the shot. Two captures each producing one
 * field keeps `angles` and `summarize` free of side branching — and the handle
 * labels and the landmark mapping genuinely differ per side.
 */
function legLift(side: 'left' | 'right'): ModeSpec {
  const field = side === 'left' ? 'legLiftLeftDeg' : 'legLiftRightDeg'
  // The lifted leg takes the side's own color, so the reading and the line that
  // moved are the same green or blue; the standing leg is the reference.
  const role: Segment['role'] = side === 'left' ? 'a' : 'b'
  return {
    label: `${side} leg lift`,
    handles: [
      { key: 'hip', label: 'hips' },
      { key: 'ankleStand', label: 'standing ankle' },
      { key: 'ankleLift', label: 'lifted ankle' },
    ],
    segments: [
      { from: 'hip', to: 'ankleStand', role: 'ref' },
      { from: 'hip', to: 'ankleLift', role },
    ],
    // The standing leg *is* the reference, which self-corrects for a tilted
    // camera in a way a plumb line does not.
    verticalRef: null,
    // The side is the mode, so there's no pair within a shot to trade.
    sidePair: null,
    defaults: {
      hip: { x: 0.5, y: 0.5 },
      ankleStand: { x: 0.52, y: 0.9 },
      // Front-on, and the front camera mirrors, so your left reads on the left.
      ankleLift: { x: side === 'left' ? 0.25 : 0.75, y: 0.62 },
    },
    fromLandmarks: (lms, mirrored) => {
      const own = side === 'left' ? POSE.LEFT_ANKLE : POSE.RIGHT_ANKLE
      const other = side === 'left' ? POSE.RIGHT_ANKLE : POSE.LEFT_ANKLE
      const [iLift, iStand] = mirrored ? [other, own] : [own, other]
      const hipL = lms[POSE.LEFT_HIP]
      const hipR = lms[POSE.RIGHT_HIP]
      const lift = lms[iLift]
      const stand = lms[iStand]
      if (![hipL, hipR, lift, stand].every(seen)) return null
      return { hip: midpoint(hipL, hipR), ankleStand: pt(stand), ankleLift: pt(lift) }
    },
    angles: (h, aspect) => ({ [field]: angleAtVertex(h, 'hip', 'ankleStand', 'ankleLift', aspect) }),
    marks: (h, r) => vertexMark(h, 'hip', 'ankleStand', 'ankleLift', r[field], role),
    summarize: (r) => `${r[field] ?? 0}°`,
    readings: (r) => [{ label: `${side} leg lift`, deg: r[field] ?? 0 }],
  }
}

const MODE: Record<MeasureMode, ModeSpec> = {
  split: {
    label: 'side split',
    handles: [
      { key: 'hip', label: 'hips' },
      { key: 'ankleL', label: 'left ankle' },
      { key: 'ankleR', label: 'right ankle' },
    ],
    segments: [
      { from: 'hip', to: 'ankleL', role: 'a' },
      { from: 'hip', to: 'ankleR', role: 'b' },
    ],
    verticalRef: null,
    // The split is one angle across both legs — sides don't change it.
    sidePair: null,
    defaults: {
      hip: { x: 0.5, y: 0.55 },
      ankleL: { x: 0.14, y: 0.88 },
      ankleR: { x: 0.86, y: 0.88 },
    },
    fromLandmarks: (lms, mirrored) => {
      const [iAnkleL, iAnkleR] = mirrored
        ? [POSE.RIGHT_ANKLE, POSE.LEFT_ANKLE]
        : [POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE]
      const hipL = lms[POSE.LEFT_HIP]
      const hipR = lms[POSE.RIGHT_HIP]
      const ankleL = lms[iAnkleL]
      const ankleR = lms[iAnkleR]
      if (![hipL, hipR, ankleL, ankleR].every(seen)) return null
      return { hip: midpoint(hipL, hipR), ankleL: pt(ankleL), ankleR: pt(ankleR) }
    },
    angles: (h, aspect) => ({ splitDeg: angleAtVertex(h, 'hip', 'ankleL', 'ankleR', aspect) }),
    // One angle across both legs, so it takes the neutral color rather than
    // either leg's.
    marks: (h, r) => vertexMark(h, 'hip', 'ankleL', 'ankleR', r.splitDeg, 'ref'),
    summarize: (r) => `${r.splitDeg ?? 0}°`,
    readings: (r) => [{ label: 'side split', deg: r.splitDeg ?? 0 }],
  },

  tailors: {
    label: "tailor's pose",
    // Tailor's is measured off vertical, so no spine reference line: each knee
    // line runs from the tip of that knee down to a single dot between the feet.
    handles: [
      { key: 'center', label: 'between feet' },
      { key: 'kneeL', label: 'left knee' },
      { key: 'kneeR', label: 'right knee' },
    ],
    segments: [
      { from: 'center', to: 'kneeL', role: 'a' },
      { from: 'center', to: 'kneeR', role: 'b' },
    ],
    verticalRef: 'center',
    sidePair: ['kneeL', 'kneeR'],
    defaults: {
      center: { x: 0.5, y: 0.88 },
      kneeL: { x: 0.3, y: 0.8 },
      kneeR: { x: 0.7, y: 0.8 },
    },
    fromLandmarks: (lms, mirrored) => {
      const need = [POSE.LEFT_KNEE, POSE.RIGHT_KNEE, POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE]
      if (!need.every((i) => seen(lms[i]))) return null
      const [iKneeL, iKneeR] = mirrored
        ? [POSE.RIGHT_KNEE, POSE.LEFT_KNEE]
        : [POSE.LEFT_KNEE, POSE.RIGHT_KNEE]
      return {
        center: midpoint(lms[POSE.LEFT_ANKLE], lms[POSE.RIGHT_ANKLE]),
        kneeL: pt(lms[iKneeL]),
        kneeR: pt(lms[iKneeR]),
      }
    },
    // Each knee line's angle off straight-up: knee directly overhead = 0°, knee
    // dropped out to the side = 90° (bigger = more open hip).
    angles: (h, aspect) => ({
      tailorsLeftDeg: angleBetweenVectors(UP, sub(h.kneeL, h.center, aspect)),
      tailorsRightDeg: angleBetweenVectors(UP, sub(h.kneeR, h.center, aspect)),
    }),
    marks: (h, r) => {
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
    },
    summarize: (r) => `L ${r.tailorsLeftDeg ?? 0}° · R ${r.tailorsRightDeg ?? 0}°`,
    readings: (r) => [
      { label: 'left', deg: r.tailorsLeftDeg ?? 0 },
      { label: 'right', deg: r.tailorsRightDeg ?? 0 },
    ],
  },

  // Side-on photo of a standing forward fold, read at the hip between the torso
  // and the legs: standing upright = 180°, folded flat = 0°, so this is the one
  // reading in the app where SMALLER is deeper (see lib/flexMetrics).
  toe_touch: {
    label: 'toe touch',
    handles: [
      { key: 'shoulder', label: 'shoulders' },
      { key: 'hip', label: 'hips' },
      { key: 'ankle', label: 'ankles' },
    ],
    segments: [
      { from: 'hip', to: 'shoulder', role: 'a' },
      { from: 'hip', to: 'ankle', role: 'b' },
    ],
    verticalRef: null,
    // One angle between the torso and the legs — there's no pair to trade, and a
    // side-on shot has only the near side of the body to measure anyway.
    sidePair: null,
    defaults: {
      shoulder: { x: 0.32, y: 0.6 },
      hip: { x: 0.5, y: 0.45 },
      ankle: { x: 0.52, y: 0.9 },
    },
    // Midpoints throughout, so a mirrored shot measures the same fold.
    fromLandmarks: (lms) => {
      const need = [
        POSE.LEFT_SHOULDER,
        POSE.RIGHT_SHOULDER,
        POSE.LEFT_HIP,
        POSE.RIGHT_HIP,
        POSE.LEFT_ANKLE,
        POSE.RIGHT_ANKLE,
      ]
      if (!need.every((i) => seen(lms[i]))) return null
      return {
        shoulder: midpoint(lms[POSE.LEFT_SHOULDER], lms[POSE.RIGHT_SHOULDER]),
        hip: midpoint(lms[POSE.LEFT_HIP], lms[POSE.RIGHT_HIP]),
        ankle: midpoint(lms[POSE.LEFT_ANKLE], lms[POSE.RIGHT_ANKLE]),
      }
    },
    angles: (h, aspect) => ({ toeTouchDeg: angleAtVertex(h, 'hip', 'shoulder', 'ankle', aspect) }),
    // One angle across the torso and the legs, so — like the split — it takes the
    // neutral color rather than either line's.
    marks: (h, r) => vertexMark(h, 'hip', 'shoulder', 'ankle', r.toeTouchDeg, 'ref'),
    summarize: (r) => `${r.toeTouchDeg ?? 0}°`,
    readings: (r) => [{ label: 'toe touch', deg: r.toeTouchDeg ?? 0 }],
  },

  leg_lift_left: legLift('left'),
  leg_lift_right: legLift('right'),
}

/** Project one field of every mode's spec into the per-mode record the UI reads. */
function byMode<T>(pick: (spec: ModeSpec) => T): Record<MeasureMode, T> {
  const out = {} as Record<MeasureMode, T>
  for (const mode of MEASURE_MODES) out[mode] = pick(MODE[mode])
  return out
}

export const MEASURE_LABEL = byMode((s) => s.label)

/** Handles the user can drag, per mode (also the order they render). */
export const HANDLES = byMode((s) => s.handles)

/** Lines drawn between handles, per mode. */
export const SEGMENTS = byMode((s) => s.segments)

/** The handle each mode's plumb line hangs from, or null — see ModeSpec. */
export const VERTICAL_REF = byMode((s) => s.verticalRef)

/** Shortest plumb line worth drawing, as a fraction of the photo's height. */
const MIN_GUIDE = 0.14

/**
 * The plumb line to draw for this mode: from its reference handle, straight up
 * to the height of the highest handle measured against it (and never so short
 * it can't be seen). In normalized coords, like the handles.
 */
export function verticalGuide(mode: MeasureMode, h: Handles): { from: Pt; toY: number } | null {
  const key = MODE[mode].verticalRef
  if (!key) return null
  const from = h[key]
  if (!from) return null
  const ends = MODE[mode].segments
    .filter((s) => s.from === key)
    .map((s) => h[s.to])
    .filter((p): p is Pt => p !== undefined)
  if (ends.length === 0) return null
  return { from, toY: Math.min(...ends.map((p) => p.y), from.y - MIN_GUIDE) }
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
  return MODE[mode].marks(h, r)
}

/** Fallback handle positions when pose detection fails — see ModeSpec.defaults. */
export function defaultHandles(mode: MeasureMode): Handles {
  // Copied, not shared: the caller drags these, and a mutated spec would hand
  // the next capture wherever the last one left its dots.
  return { ...MODE[mode].defaults }
}

/**
 * Build initial handles from detected landmarks. Returns null when the points
 * this pose needs are missing or were not confidently seen, which the caller
 * reports rather than quietly papering over.
 *
 * `mirrored` says the photo is a mirror image of the body — a front-camera
 * selfie. The detector names sides from what it sees, and a mirrored body looks
 * like an ordinary one facing the lens, so the knee it calls left is the one you
 * call right. Swapping the pairs back keeps a handle labelled "left" on the side
 * you'd call left, which is the side the angle gets logged under. A pose built
 * only from midpoints has no sides to swap and ignores it.
 */
export function handlesFromLandmarks(
  mode: MeasureMode,
  lms: Landmark[],
  mirrored = false,
): Handles | null {
  if (lms.length <= POSE.RIGHT_ANKLE) return null
  return MODE[mode].fromLandmarks(lms, mirrored)
}

/** Whether swapping sides would change what gets logged for this mode. */
export const hasSides = (mode: MeasureMode): boolean => MODE[mode].sidePair !== null

/**
 * Trade the left and right handles, for when a photo's mirroring wasn't what we
 * assumed and the two angles came out under the wrong sides.
 */
export function swapSides(mode: MeasureMode, h: Handles): Handles {
  const pair = MODE[mode].sidePair
  if (!pair) return h
  const [a, b] = pair
  if (!h[a] || !h[b]) return h
  return { ...h, [a]: h[b], [b]: h[a] }
}

/**
 * Compute the logged angle(s) from the current handle positions.
 * `aspect` is the photo's width / height.
 */
export function anglesFromHandles(mode: MeasureMode, h: Handles, aspect: number): MeasureResult {
  return MODE[mode].angles(h, aspect)
}

/** Short human summary of a result, e.g. "92°" or "L 55° · R 54°". */
export function summarizeResult(mode: MeasureMode, r: MeasureResult): string {
  return MODE[mode].summarize(r)
}

/** The numbers a pose produces, labelled — see ModeSpec.readings. */
export function resultReadings(
  mode: MeasureMode,
  r: MeasureResult,
): { label: string; deg: number }[] {
  return MODE[mode].readings(r)
}
