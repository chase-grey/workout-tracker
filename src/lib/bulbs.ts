/**
 * The curvy sand timer of the 'bulbs' rest shape (see components/RestShapes).
 *
 * The rest set already has two straight-sided sand timers — RestTimer's `sandglass`
 * and its full-screen `hourglass`, both a pair of triangles whose level is the
 * reading. This is the same object drawn the way an hourglass is actually blown:
 * two bulbs swelling away from a waist so narrow they all but meet at a point,
 * each one rolling over a rounded shoulder into a flat end, with no frame, no caps
 * and no glass. Flat, abstract, and curved everywhere.
 *
 * The curve is why this module exists. Once the walls bow outward, a level falling
 * at a steady rate stops meaning a steady rate of *sand*: the shoulder is twenty
 * times the width of the neck, so an even fall would drain most of the charge in
 * the first third of the rest and a sliver in the last. The straight shapes get away
 * with mapping the countdown onto the level because on a triangle a glance reads
 * the level; here a glance reads the *area* — how much colour is still up there —
 * and so that is what the countdown drives. The sand's area falls linearly with the
 * rest, which is also what a real sand timer does, its sand leaving at a fixed rate
 * whatever the glass is doing around it.
 *
 * The price is that neither surface moves at a constant speed, and that is the
 * shape rather than a flaw: the upper one eases down through the wide shoulder and
 * quickens as the wall closes in, while the pile below rises slowly off the broad
 * base and then runs up the neck. It finishes with a rush none of the other shapes
 * have, and the area it finishes from was honest the whole way.
 *
 * So the silhouette is sampled once, the area between neighbouring samples is
 * accumulated down it, and `sandLevels` inverts that: "this much sand left" becomes
 * "the surface sits here". Measured rather than declared, like the coil in
 * lib/spiral and the perimeter shape's edge weights.
 */

export type BulbsSpec = {
  /** The centre line the whole shape is symmetric about. */
  cx: number
  /** The flat top and the flat base. */
  top: number
  bottom: number
  /**
   * Half-width at the widest point of each bulb — its shoulder, which sits a
   * corner's depth in from the flat end rather than on it.
   */
  rimHalf: number
  /**
   * Half-width at the waist, halfway between the ends. Small: the bulbs are meant
   * to look like they meet at a point, and this is how blunt that point is.
   */
  waistHalf: number
  /**
   * How far in from each flat end its shoulder sits, and so the radius of the
   * quarter circle that turns the one into the other. 0 for a square corner.
   */
  corner?: number
  /**
   * How hard the wall swells as it leaves the waist, as an exponent on the distance
   * left to the shoulder. Above 1 opens the bulb out fast off the waist and then
   * eases into the shoulder, which is what makes the middle read as a point and the
   * ends as bulbs; at 1 the wall is a straight taper.
   */
  swell?: number
  /**
   * Points sampled down the shape. Forced odd so the waist lands exactly on a
   * sample and each bulb owns half of them: enough that the polyline reads as a
   * curve at phone size and that the accumulated area is accurate to far under a
   * pixel of level.
   */
  samples?: number
}

/** Which half of the shape — the bulb that drains, or the one that fills. */
export type Bulb = 'upper' | 'lower'

export type BulbsPoint = { y: number; half: number }

/** A sampled silhouette, ready to draw and to look levels up in. */
export type Bulbs = {
  /** Points from the top rim down to the base, evenly spaced in y. */
  points: BulbsPoint[]
  /**
   * How much of the shape lies above each point: 0 at the top rim, the whole area
   * at the base. Climbs fast through the shoulders and slowly through the waist,
   * which is the whole reason it is worth accumulating once and keeping.
   */
  areas: number[]
  /** What it was built from, so a width can be worked out exactly. */
  spec: Required<BulbsSpec>
}

const DEFAULT_SAMPLES = 401

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Sample a silhouette and accumulate its area, top rim to base. */
export function createBulbs(spec: BulbsSpec): Bulbs {
  const asked = Math.max(5, Math.floor(spec.samples ?? DEFAULT_SAMPLES))
  const halfHeight = Math.abs(spec.bottom - spec.top) / 2
  const resolved: Required<BulbsSpec> = {
    swell: 2,
    ...spec,
    // A corner as deep as the bulb is tall would eat the taper it is supposed to
    // turn into, so it never gets more than most of the way there.
    corner: Math.max(0, Math.min(spec.corner ?? 0, halfHeight * 0.9)),
    // Odd, so `points[(samples - 1) / 2]` is the waist itself. An even count would
    // straddle it and quietly leave the two bulbs different sizes.
    samples: asked % 2 === 0 ? asked + 1 : asked,
  }

  const points: BulbsPoint[] = []
  for (let i = 0; i < resolved.samples; i++) {
    const y = resolved.top + (resolved.bottom - resolved.top) * (i / (resolved.samples - 1))
    points.push({ y, half: halfWidth(resolved, y) })
  }

  // Trapezoids: the strip between two samples is `dy` tall and `2·half` wide at
  // each end, so its area is `(half + half) · dy`.
  const dy = (resolved.bottom - resolved.top) / (resolved.samples - 1)
  const areas = [0]
  for (let i = 1; i < points.length; i++) {
    areas.push(areas[i - 1] + (points[i - 1].half + points[i].half) * dy)
  }
  return { points, areas, spec: resolved }
}

/** Half the width of the shape at height `y`, off the spec rather than the samples. */
export function halfWidthAt(bulbs: Bulbs, y: number): number {
  return halfWidth(bulbs.spec, y)
}

/**
 * The wall, in two pieces that meet without a crease.
 *
 * Out at the flat end is the corner: a quarter circle tangent to the end, so the
 * wall leaves it perfectly horizontal, and tangent to the widest point a corner's
 * depth in, so it arrives at the shoulder perfectly vertical. That is what stops
 * the flat top reading as a lid stuck on the shape — the end and the wall are one
 * curve, and the widest point of the bulb sits below the rim the way blown glass
 * does.
 *
 * In from the shoulder is the taper: the waist's half-width opening out to the
 * shoulder's, eased so that it arrives vertical there and so meets the corner's
 * tangent exactly. It leaves the waist at a *slope*, though, and that corner is the
 * point of the whole thing: two walls closing at an angle onto a waist barely wider
 * than the stroke read as bulbs meeting at a point, where a neck flat on both sides
 * reads as a tube between them.
 */
function halfWidth(spec: Required<BulbsSpec>, y: number): number {
  const { top, bottom, rimHalf, waistHalf, corner, swell } = spec
  const waist = (top + bottom) / 2
  // Depth in from whichever end is nearer: the lower bulb is the upper one upside
  // down, so one profile measured from the nearer end serves both.
  const depth = Math.min(y - top, bottom - y)
  if (depth <= 0) return rimHalf - corner
  if (depth < corner) {
    return rimHalf - corner + Math.sqrt(Math.max(0, corner ** 2 - (corner - depth) ** 2))
  }
  const span = waist - top - corner
  if (span <= 0) return rimHalf
  // How far out of the waist the taper has come, as a share of the way to a shoulder.
  const u = clamp01(Math.abs(y - waist) / span)
  const ease = 1 - (1 - u) ** swell
  return waistHalf + (rimHalf - waistHalf) * ease
}

/** The waist's height — where the bulbs meet, and where both surfaces end at zero. */
export function waistY(bulbs: Bulbs): number {
  const { top, bottom } = bulbs.spec
  return (top + bottom) / 2
}

/** The area one bulb holds full. Half the shape's, by symmetry. */
export function bulbArea(bulbs: Bulbs): number {
  return bulbs.areas[bulbs.areas.length - 1] / 2
}

/**
 * Where the two sand surfaces sit with `fraction` of the rest left (1 at the start,
 * 0 when it's up).
 *
 * `upper` is the top of the sand still to fall, which rests on the waist and so
 * sinks from the top rim down to it. `lower` is the top of the sand already fallen,
 * which rests on the base and so climbs from there up to the waist. Both come out
 * of the same area, so at every moment the sand above the waist is exactly
 * `fraction` of a bulb and the sand below it is exactly the rest: one reading told
 * twice, either half of it the whole time.
 */
export function sandLevels(bulbs: Bulbs, fraction: number): { upper: number; lower: number } {
  const spent = 1 - clamp01(fraction)
  const drained = spent * bulbArea(bulbs)
  const whole = bulbs.areas[bulbs.areas.length - 1]
  return {
    // The empty part of the upper bulb is what has drained: measured from the top.
    upper: levelAtArea(bulbs, drained),
    // The full part of the lower bulb is that same sand: measured up from the base.
    lower: levelAtArea(bulbs, whole - drained),
  }
}

/**
 * The height with `area` of the shape above it — the inverse of `areas`.
 *
 * Interpolated straight between two samples: inside a single strip the accumulated
 * area is very nearly linear in y, and at this sampling the difference sits orders
 * of magnitude below the stroke width. The two ends are exact either way.
 */
export function levelAtArea(bulbs: Bulbs, area: number): number {
  const { areas, points } = bulbs
  const total = areas[areas.length - 1]
  if (total <= 0) return points[0].y
  const target = Math.max(0, Math.min(total, area))

  // Binary search for the strip it lands in, since `areas` only increases.
  let lo = 0
  let hi = areas.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (areas[mid] <= target) lo = mid
    else hi = mid
  }
  const grown = areas[hi] - areas[lo]
  const share = grown > 0 ? (target - areas[lo]) / grown : 0
  return points[lo].y + (points[hi].y - points[lo].y) * share
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * One bulb as a closed SVG path: out along the flat end, round the corner, in along
 * one wall to the waist, and back out the other.
 *
 * Drawn as the bulb and used to clip the sand inside it, which is what gives the
 * sand its curved sides for nothing — the surface is a straight line and the walls
 * it stops at are the shape's own.
 *
 * The corners are arcs rather than samples of the profile. Everywhere else the
 * polyline is finer than the stroke, but a circle turning through ninety degrees in
 * a couple of units of height outruns any sampling even in y, and a visibly clipped
 * corner is exactly the thing the rounding is there to avoid.
 */
export function bulbPath(bulbs: Bulbs, which: Bulb): string {
  const { points, spec } = bulbs
  const { cx, rimHalf, corner } = spec
  const middle = (points.length - 1) / 2
  // Both walls listed from the flat end in toward the waist, so the two lists meet
  // there and the path closes without a seam.
  const wall = which === 'upper' ? points.slice(0, middle + 1) : points.slice(middle).reverse()
  const flat = wall[0].y
  // The whole shape lies one way from that end, and the path runs anticlockwise
  // around the upper bulb and clockwise around the lower one, which is what decides
  // both corners' sweep.
  const inward = which === 'upper' ? 1 : -1
  const shoulder = flat + inward * corner
  const sweep = which === 'upper' ? 0 : 1
  const arc = (x: number, y: number) =>
    `A ${round(corner)} ${round(corner)} 0 0 ${sweep} ${round(x)} ${round(y)}`

  // The shoulder exactly, then every sample the corner does not already cover.
  const taper = [
    { y: shoulder, half: rimHalf },
    ...wall.filter((p) => Math.abs(p.y - flat) > corner),
  ]
  const down = taper.map((p) => `L ${round(cx - p.half)} ${round(p.y)}`)
  const up = [...taper].reverse().map((p) => `L ${round(cx + p.half)} ${round(p.y)}`)

  if (corner <= 0) {
    return [`M ${round(cx - rimHalf)} ${round(flat)}`, ...down.slice(1), ...up, 'Z'].join(' ')
  }
  return [
    `M ${round(cx - rimHalf + corner)} ${round(flat)}`,
    arc(cx - rimHalf, shoulder),
    ...down.slice(1),
    ...up,
    arc(cx + rimHalf - corner, flat),
    'Z',
  ].join(' ')
}
