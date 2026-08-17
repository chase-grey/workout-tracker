/**
 * The vessels the 'tide' rest shape pours its water into (see components/RestTimer).
 *
 * The tide reads its time as a water line falling from the top of its container to
 * the bottom, and that container used to be a circle every time. It doesn't need to
 * be: a square, a wide oval, a triangle standing on its base, a polygon nobody has
 * seen before — the line falls through all of them just the same, and the vessel
 * changing rest to rest is one more reason to look at the shape.
 *
 * Every vessel lives in a 100 × 100 box (the tide's own square), so each number
 * here is also a percentage of it, and offers three things:
 *
 * - `clip`, a CSS clip-path, which is what actually cuts the water and its bubbles
 *   to the vessel's outline. Percentages throughout, so it scales with the box.
 * - `outline`, the same edge as an SVG path, drawn over the water as the glass.
 * - `top`/`bottom` and `spanAt`, its geometry: the water line is mapped into the
 *   vertical bounds so a full vessel is *full* and an empty one empty whatever the
 *   shape, and the span at a height is how much room a bubble has there — a vessel
 *   that narrows toward the floor gets bubbles rising up its middle rather than
 *   through its walls.
 */

/** How much of the box the vessel leaves clear, so its outline isn't cropped. */
const MARGIN = 2

/** Corner-to-corner radius of the shapes built as regular polygons. */
const RADIUS = 50 - MARGIN

/** How many corners a randomly drawn vessel gets. */
const RANDOM_CORNERS = { min: 5, max: 9 } as const

/**
 * How far in a random vessel's corners may be pulled, as a share of the radius.
 * Kept well off zero: the point is an unfamiliar outline, not a star.
 */
const RANDOM_REACH = { min: 0.64, max: 1 } as const

/** How far a corner may slide around the circle, as a share of the gap to the next. */
const RANDOM_SKEW = 0.5

/** A point in the vessel's box: x across, y down from the top. */
type Point = readonly [number, number]

/** The horizontal room available at some height: left wall, right wall. */
export type Span = readonly [number, number]

export type Vessel = {
  kind: VesselKind
  /** CSS clip-path for the interior, in percentages of the box. */
  clip: string
  /** The edge as an SVG path in the 100 × 100 box. */
  outline: string
  /** Highest and lowest point of the interior, y down from the box's top. */
  top: number
  bottom: number
  /** Where the walls are at height `y`, or null above the vessel and below it. */
  spanAt: (y: number) => Span | null
}

/**
 * The vessels in the rotation. 'polygon' is not one shape but a fresh random one
 * every time it comes up, which is what keeps the set from being learnable.
 */
export const VESSEL_KINDS = [
  'circle',
  'oval',
  'square',
  'rectangle',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'polygon',
] as const

export type VesselKind = (typeof VESSEL_KINDS)[number]

/**
 * Build a vessel. `rng` is only consulted by the random polygon, and is injectable
 * so the tests can check a known one rather than whatever came up.
 */
export function createVessel(kind: VesselKind, rng: () => number = Math.random): Vessel {
  switch (kind) {
    case 'oval':
      // Wider than it is tall: the same water spread out, which reads as more of it.
      return ellipse(kind, 50, 50, 50 - MARGIN, 34)
    case 'square':
      return polygon(kind, box(MARGIN, MARGIN, 100 - MARGIN, 100 - MARGIN))
    case 'rectangle':
      return polygon(kind, box(8, 22, 92, 78))
    case 'triangle':
      // Standing on its base, so the water widens as it drains rather than pinching.
      return polygon(kind, [
        [50, MARGIN],
        [100 - MARGIN, 100 - MARGIN],
        [MARGIN, 100 - MARGIN],
      ])
    case 'diamond':
      return polygon(kind, [
        [50, MARGIN],
        [100 - MARGIN, 50],
        [50, 100 - MARGIN],
        [MARGIN, 50],
      ])
    case 'pentagon':
      return polygon(kind, regular(5))
    case 'hexagon':
      return polygon(kind, regular(6))
    case 'polygon':
      return polygon(kind, randomCorners(rng))
    case 'circle':
    default:
      return ellipse('circle', 50, 50, 50 - MARGIN, 50 - MARGIN)
  }
}

/**
 * The room a bubble has over a stretch of the vessel, from `y0` to `y1`: the walls
 * at their closest anywhere in that band, so a bubble placed inside it stays inside
 * the glass for the whole climb rather than only where it started.
 *
 * Sampled rather than solved. For the convex vessels the narrowest point is always
 * one of the two ends, and for a random polygon a handful of samples is close
 * enough — the clip path catches anything that does stray.
 */
export function spanBetween(vessel: Vessel, y0: number, y1: number, samples = 5): Span | null {
  const lo = Math.min(y0, y1)
  const hi = Math.max(y0, y1)
  const steps = Math.max(2, Math.floor(samples))
  let left = -Infinity
  let right = Infinity
  for (let i = 0; i < steps; i++) {
    const span = vessel.spanAt(lo + ((hi - lo) * i) / (steps - 1))
    if (!span) return null
    left = Math.max(left, span[0])
    right = Math.min(right, span[1])
  }
  return right > left ? [left, right] : null
}

/** A rectangle's four corners, clockwise from its top left. */
function box(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
}

/** A regular `sides`-gon filling the box, corner up. */
function regular(sides: number): Point[] {
  return Array.from({ length: sides }, (_, i) => at(-Math.PI / 2 + (i * 2 * Math.PI) / sides, RADIUS))
}

/**
 * Corners for a one-off vessel: evenly spaced around the box, then each slid a
 * little around the circle and pulled a little toward the middle. Because the
 * corners stay in angle order the outline can't cross itself, so whatever comes out
 * still holds water.
 */
function randomCorners(rng: () => number): Point[] {
  const sides =
    RANDOM_CORNERS.min + Math.floor(rng() * (RANDOM_CORNERS.max - RANDOM_CORNERS.min + 1))
  const step = (2 * Math.PI) / sides
  return Array.from({ length: sides }, (_, i) => {
    const angle = -Math.PI / 2 + i * step + (rng() - 0.5) * step * RANDOM_SKEW
    const reach = RANDOM_REACH.min + rng() * (RANDOM_REACH.max - RANDOM_REACH.min)
    return at(angle, RADIUS * reach)
  })
}

/** A point `r` from the centre of the box at `angle`. */
function at(angle: number, r: number): Point {
  return [50 + r * Math.cos(angle), 50 + r * Math.sin(angle)]
}

/**
 * Slide a shape until it sits in the middle of the box. Corners spread round a
 * circle don't put the *shape* in the centre — a flat-bottomed pentagon hangs a
 * twentieth of the box high, and a random one leans whichever way its corners fell
 * — and a vessel a little off-centre reads as a mistake rather than as a shape.
 * Shifting a bounding box to the middle can't take it outside a box it already fits.
 */
function centred(points: readonly Point[]): Point[] {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const dx = 50 - (Math.min(...xs) + Math.max(...xs)) / 2
  const dy = 50 - (Math.min(...ys) + Math.max(...ys)) / 2
  return points.map(([x, y]) => [x + dx, y + dy])
}

function polygon(kind: VesselKind, corners: Point[]): Vessel {
  const points = centred(corners)
  const ys = points.map(([, y]) => y)
  return {
    kind,
    clip: `polygon(${points.map(([x, y]) => `${round(x)}% ${round(y)}%`).join(', ')})`,
    outline: `M ${points.map(([x, y]) => `${round(x)} ${round(y)}`).join(' L ')} Z`,
    top: Math.min(...ys),
    bottom: Math.max(...ys),
    spanAt: (y) => polygonSpanAt(points, y),
  }
}

/**
 * Where a horizontal line at `y` cuts the outline: the leftmost and rightmost
 * crossing, so a vessel with a dent in one wall is still measured to its walls.
 * Null where the line misses the shape, or catches nothing but a single corner.
 */
function polygonSpanAt(points: readonly Point[], y: number): Span | null {
  let left = Infinity
  let right = -Infinity
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    if (y1 === y2) {
      // A wall the line runs along: both ends of it count as crossings.
      if (y1 !== y) continue
      left = Math.min(left, x1, x2)
      right = Math.max(right, x1, x2)
      continue
    }
    const t = (y - y1) / (y2 - y1)
    if (t < 0 || t > 1) continue
    const x = x1 + t * (x2 - x1)
    left = Math.min(left, x)
    right = Math.max(right, x)
  }
  return right > left ? [left, right] : null
}

function ellipse(kind: VesselKind, cx: number, cy: number, rx: number, ry: number): Vessel {
  return {
    kind,
    clip: `ellipse(${round(rx)}% ${round(ry)}% at ${round(cx)}% ${round(cy)}%)`,
    // Two same-sweep half arcs, which between them close the whole ellipse.
    outline: [
      `M ${round(cx - rx)} ${round(cy)}`,
      `A ${round(rx)} ${round(ry)} 0 1 0 ${round(cx + rx)} ${round(cy)}`,
      `A ${round(rx)} ${round(ry)} 0 1 0 ${round(cx - rx)} ${round(cy)}`,
      'Z',
    ].join(' '),
    top: cy - ry,
    bottom: cy + ry,
    spanAt: (y) => {
      const t = (y - cy) / ry
      if (Math.abs(t) >= 1) return null
      const half = rx * Math.sqrt(1 - t * t)
      return [cx - half, cx + half]
    },
  }
}

const round = (n: number) => Math.round(n * 100) / 100
