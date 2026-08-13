/**
 * The coil of the 'spiral' rest shape (see components/RestShapes).
 *
 * The shape is a rope paying out: an Archimedean spiral whose outer end retracts
 * inward as the rest runs down, so the radius of what's left is the reading.
 *
 * That radius is the whole problem this module exists to solve. Drawing the coil
 * is easy — one `stroke-dasharray` on an SVG path — but a dash is measured in
 * *arc length*, and a spiral's outer turns are far longer than its inner ones. Cut
 * the dash straight from the remaining fraction and the coil would sit at nearly
 * full radius for most of the rest and then collapse in the last few seconds: the
 * time would be honest and the shape would be a lie.
 *
 * So the spiral is sampled once, the length of every step along it is accumulated,
 * and `shareAt` converts "this far out by radius" into "this far along by length".
 * Radius then falls linearly with the countdown, which is what a glance reads,
 * while the dash still lands exactly at zero. Same trick as the perimeter shape's
 * fixed edge weights, measured rather than declared.
 */

export type SpiralPoint = { x: number; y: number }

/** A sampled spiral, ready to draw and to look up positions along. */
export type Spiral = {
  /** Points from the inner end to the outer, evenly spaced in radius. */
  points: SpiralPoint[]
  /**
   * Cumulative length at each point as a share of the whole: 0 at the inner end,
   * 1 at the outer. Rises slowly at first and then faster, because the outer
   * turns are longer.
   */
  shares: number[]
  /** What it was built from, so a position along it can be worked out exactly. */
  spec: Required<SpiralSpec>
}

export type SpiralSpec = {
  cx: number
  cy: number
  /** Radius of the inner end, where the coil finishes. */
  inner: number
  /** Radius of the outer end, where it starts. */
  outer: number
  /** Turns between the two. */
  turns: number
  /** Angle of the inner end, in radians — rotates the whole coil. */
  start?: number
  /**
   * Points sampled along the coil. Enough that the polyline reads as a smooth
   * curve at phone size and that the accumulated length is accurate to well
   * under a pixel.
   */
  samples?: number
}

const DEFAULT_SAMPLES = 240

/**
 * Sample a spiral. Radius is linear in the parameter `t`, so `t` *is* the reading:
 * `pointAt(spiral, f)` is where the free end sits with `f` of the rest left, and
 * `shareAt(spiral, f)` is the dash that draws the coil up to it.
 */
export function createSpiral(spec: SpiralSpec): Spiral {
  const resolved: Required<SpiralSpec> = {
    start: -Math.PI / 2,
    ...spec,
    samples: Math.max(2, Math.floor(spec.samples ?? DEFAULT_SAMPLES)),
  }
  const { samples } = resolved
  const points: SpiralPoint[] = []
  for (let i = 0; i < samples; i++) {
    points.push(curveAt(resolved, i / (samples - 1)))
  }

  // Straight-line distance between neighbours: with this many samples the chord
  // and the arc differ by orders of magnitude less than the stroke width.
  const lengths = [0]
  let total = 0
  for (let i = 1; i < samples; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    lengths.push(total)
  }
  // A degenerate spiral (inner === outer and no turns) has no length at all; give
  // it evenly spread shares rather than a row of NaNs.
  const shares =
    total > 0 ? lengths.map((l) => l / total) : lengths.map((_, i) => i / (samples - 1))
  return { points, shares, spec: resolved }
}

/** The point at radius-parameter `t` on the true curve, not on the sampled one. */
function curveAt(spec: Required<SpiralSpec>, t: number): SpiralPoint {
  const { cx, cy, inner, outer, turns, start } = spec
  const r = inner + (outer - inner) * t
  const angle = start + t * turns * 2 * Math.PI
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

/** The coil as an SVG path, inner end first — so a dash from the start keeps the inside. */
export function spiralPath(spiral: Spiral): string {
  const round = (n: number) => Math.round(n * 100) / 100
  const [first, ...rest] = spiral.points
  return [
    `M ${round(first.x)} ${round(first.y)}`,
    ...rest.map((p) => `L ${round(p.x)} ${round(p.y)}`),
  ].join(' ')
}

/** Where `t` (0 inner end, 1 outer) falls between two samples. */
function locate(count: number, t: number): { i: number; frac: number } {
  const clamped = Math.max(0, Math.min(1, t))
  const exact = clamped * (count - 1)
  const i = Math.min(count - 2, Math.floor(exact))
  return { i, frac: exact - i }
}

/**
 * How much of the coil's length lies inside radius-parameter `t` — the value to
 * hand `stroke-dasharray` on a path drawn with `pathLength={1}`.
 */
export function shareAt(spiral: Spiral, t: number): number {
  const { shares } = spiral
  if (shares.length < 2) return 0
  const { i, frac } = locate(shares.length, t)
  return shares[i] + (shares[i + 1] - shares[i]) * frac
}

/**
 * The point at radius-parameter `t` — where to park the tracer at the free end.
 *
 * Worked out from the spec rather than interpolated between samples. A straight
 * line between two samples cuts *inside* the curve, and it cuts deepest where the
 * spiral is turning tightest, which is at the small radii: interpolating made the
 * tracer creep in fractionally faster near the middle than it did at the rim. Small,
 * but the one thing this shape claims is that the end travels at a steady rate, so
 * it may as well be exactly true.
 */
export function pointAt(spiral: Spiral, t: number): SpiralPoint {
  return curveAt(spiral.spec, Math.max(0, Math.min(1, t)))
}
