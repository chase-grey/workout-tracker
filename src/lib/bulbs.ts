/**
 * The curvy sand timer of the 'bulbs' rest shape (see components/RestShapes).
 *
 * The rest set already has two straight-sided sand timers — RestTimer's `sandglass`
 * and its full-screen `hourglass`, both a pair of triangles whose level is the
 * reading. This is the same object drawn the way an hourglass is actually blown:
 * two bulbs swelling away from a narrow waist in one continuous curve, with no
 * frame, no caps and no glass. Flat, abstract, and curved everywhere.
 *
 * The curve is why this module exists. Once the walls bow outward, a level falling
 * at a steady rate stops meaning a steady rate of *sand*: the shoulder is several
 * times wider than the neck, so an even fall would drain most of the charge in the
 * first third of the rest and a sliver in the last. The straight shapes get away
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
  /** The top rim and the base — the two widest points. */
  top: number
  bottom: number
  /** Half-width at those rims. */
  rimHalf: number
  /** Half-width at the waist, halfway between them. */
  waistHalf: number
  /**
   * How the wall swells as it leaves the waist, as an exponent on the distance from
   * it. Above 1 holds the neck narrow for longer and throws the swell up into the
   * shoulder, which is the hourglass silhouette; at 1 the wall is an even S-curve
   * from waist to rim.
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
  const resolved: Required<BulbsSpec> = {
    swell: 1.1,
    ...spec,
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
 * The wall: the waist's half-width opening out to the rim's along a cosine ease,
 * which leaves the wall flat where it meets the waist and flat again where it meets
 * the rim. Both flats matter — the first is the neck and the second the shoulder,
 * and a profile with a corner at either end reads as a funnel rather than as blown
 * glass.
 */
function halfWidth(spec: Required<BulbsSpec>, y: number): number {
  const { top, bottom, rimHalf, waistHalf, swell } = spec
  const waist = (top + bottom) / 2
  const span = waist - top
  if (span <= 0) return rimHalf
  // Distance from the waist as a share of the way out to a rim. Symmetric by
  // construction: the lower bulb is the upper one upside down.
  const u = clamp01(Math.abs(y - waist) / span)
  const ease = (1 - Math.cos(Math.PI * u ** swell)) / 2
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
 * One bulb as a closed SVG path: in along one wall, back out along the other.
 *
 * Drawn as the bulb and used to clip the sand inside it, which is what gives the
 * sand its curved sides for nothing — the surface is a straight line and the walls
 * it stops at are the shape's own.
 */
export function bulbPath(bulbs: Bulbs, which: Bulb): string {
  const { points, spec } = bulbs
  const middle = (points.length - 1) / 2
  // Both walls listed from the flat end in toward the waist, so the two lists meet
  // there and the path closes without a seam.
  const wall = which === 'upper' ? points.slice(0, middle + 1) : points.slice(middle).reverse()
  const down = wall.map((p) => `L ${round(spec.cx - p.half)} ${round(p.y)}`)
  const up = [...wall].reverse().map((p) => `L ${round(spec.cx + p.half)} ${round(p.y)}`)
  const start = wall[0]
  return [`M ${round(spec.cx - start.half)} ${round(start.y)}`, ...down.slice(1), ...up, 'Z'].join(
    ' ',
  )
}
