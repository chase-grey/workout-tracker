/**
 * The root system of the 'roots' rest shape (see components/NatureRest).
 *
 * Real roots aren't a mirrored fan. A handful of structural roots leave the crown
 * at whatever angles the soil allowed — some shallow and wide, one diving — and
 * bend down under gravity as they go. Each sprouts laterals off its flanks, those
 * sprout their own, and the last order is a wisp of tendrils that wanders more
 * than it aims. Nothing is symmetrical: one side usually wins.
 *
 * And a root thickens with age, not with length. The part of a root that has been
 * in the ground longest is the thickest, so the structural roots at the top keep
 * swelling the whole rest while the tips — and the late tendrils at the bottom —
 * stay hair-thin. Taper falls out of that on its own: a root's base is older than
 * its tip.
 *
 * The countdown is the growth: everything is born and fully grown out between the
 * start of rest and its end, so the system completes exactly as rest is up.
 *
 * Geometry is in the 0–100 viewBox the shape is drawn in. Widths are screen pixels,
 * since the shape stretches to fill the screen and draws non-scaling strokes.
 */

export type Point = { x: number; y: number }

export type Root = {
  /** 0 for a structural root off the crown, rising for each generation of lateral. */
  order: number
  /** The path, one step apart. */
  points: Point[]
  /** Elapsed-rest fraction at which the root starts growing. */
  born: number
  /** Viewbox units of length grown per unit of elapsed-rest fraction. */
  speed: number
  /** The width its oldest part swells to by the end of rest, in pixels. */
  girth: number
}

/** A drawable piece of a root: a short polyline at one width. */
export type RootStroke = { key: string; d: string; width: number }

/** Where the roots leave the stem. */
export const CROWN: Point = { x: 50, y: 3 }

/** Length of one step along a root. */
const STEP = 2

/** Deepest order of lateral. The last is the tendrils. */
const MAX_ORDER = 3

/** Growth speed by order: the structural roots run, the tendrils creep. */
const SPEED = [150, 115, 95, 80]

/** Peak width by order, before each root's own share. */
const GIRTH = [10, 3.6, 1.5, 0.7]

/** Width of a tip just grown, by order. */
const TIP = [1.3, 0.9, 0.6, 0.4]

/** Steps per drawn stroke, by order: the roots whose width varies most get finer pieces. */
const CHUNK = [2, 3, 6, 100]

/** How hard each order bends toward straight down. Tendrils barely care. */
const GRAVITY = [0.03, 0.045, 0.04, 0.015]

/** How much each order wanders, per step. */
const WANDER = [0.12, 0.18, 0.28, 0.45]

/** Elapsed fraction a part of a root takes to reach its full width: all of rest, so the top never stops swelling. */
const THICKEN = 1

/** Nothing is born so late it couldn't show before rest ends. */
const LAST_BIRTH = 0.93

const DOWN = Math.PI / 2

/**
 * How many times taller a viewbox unit down is than one across, roughly, on the
 * screen the shape fills. Steps across are stretched by it so that a heading
 * reads on screen as the angle it is.
 */
const ASPECT = 1.6

/** A deterministic random source, so one seed always grows the same roots. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Grow the whole system. Every root is in the list, parents before children. */
export function growRoots(rng: () => number = Math.random): Root[] {
  const roots: Root[] = []
  // One side gets the stronger roots: they reach further and swell thicker.
  const favored = rng() < 0.5 ? -1 : 1
  const count = 5 + Math.floor(rng() * 3)
  // And the whole fan leans its way, so the counts can't even it back out.
  // A smaller heading points further right.
  const lean = -favored * (0.04 + rng() * 0.08) * Math.PI
  for (let i = 0; i < count; i++) {
    // Spread across the lower half-circle, unevenly: jitter each slot hard.
    const slot = (i + 0.5) / count
    const heading = Math.PI * (0.06 + 0.88 * slot) + (rng() - 0.5) * (0.55 / count) * Math.PI + lean
    // Which side this one leans to: right of straight down is +1.
    const side = Math.cos(heading) >= 0 ? 1 : -1
    const strong = side === favored ? 1.15 : 0.8
    // Shallow roots run wide near the surface; steep ones dive.
    const shallow = 1 - Math.abs(Math.sin(heading))
    const length = (90 + rng() * 50) * strong * (1 + shallow * 0.3)
    sprout(roots, rng, {
      order: 0,
      start: CROWN,
      heading,
      length,
      born: rng() * 0.06,
      girth: GIRTH[0] * strong * (0.75 + rng() * 0.4) * (0.7 + shallow * 0.5),
    })
  }
  return roots
}

function sprout(
  roots: Root[],
  rng: () => number,
  seed: { order: number; start: Point; heading: number; length: number; born: number; girth: number },
): void {
  const { order, born, girth } = seed
  const speed = SPEED[order]
  // Cut the root short rather than let it still be growing when rest ends.
  const length = Math.min(seed.length, (1 - born) * speed)
  if (length < STEP * 2) return

  const points: Point[] = [seed.start]
  let heading = seed.heading
  let { x, y } = seed.start
  const steps = Math.floor(length / STEP)
  for (let s = 0; s < steps; s++) {
    heading += (rng() - 0.5) * WANDER[order]
    heading += (DOWN - heading) * GRAVITY[order]
    // Roots can run level, never back up toward the surface.
    heading = Math.max(-0.15, Math.min(Math.PI + 0.15, heading))
    x += Math.cos(heading) * STEP * ASPECT
    y += Math.sin(heading) * STEP
    points.push({ x, y })
    if (x < -8 || x > 108 || y > 104) break
  }
  const root: Root = { order, points, born, speed, girth }
  roots.push(root)
  if (order >= MAX_ORDER) return

  // Laterals come off both flanks at intervals, more often the deeper the soil,
  // so the bottom of the screen fills with fine stuff and the top stays open.
  const grown = (points.length - 1) * STEP
  let at = (order === 0 ? 12 : 5) + rng() * 6
  while (at < grown - STEP * 2) {
    const index = Math.round(at / STEP)
    const point = points[index]
    const along = points[Math.min(index + 1, points.length - 1)]
    const here = Math.atan2(along.y - point.y, along.x - point.x)
    const flank = rng() < 0.5 ? -1 : 1
    const depth = Math.max(0, Math.min(1, point.y / 100))
    const childBorn = born + at / speed + 0.01 + rng() * 0.04
    if (childBorn <= LAST_BIRTH) {
      const reach = (grown - at) * (0.35 + rng() * 0.35) * (order === MAX_ORDER - 1 ? 0.6 : 1)
      sprout(roots, rng, {
        order: order + 1,
        start: point,
        heading: here + flank * (0.35 + rng() * 0.6),
        length: Math.max(8 + rng() * 10, reach),
        born: childBorn,
        girth: GIRTH[order + 1] * (0.7 + rng() * 0.6),
      })
    }
    // Sparse near the crown, dense lower down.
    at += (order === 0 ? 14 : 9) * (1.3 - depth * 0.9) * (0.6 + rng() * 0.8)
  }

  // A growing tip frays into a brush of tendrils where it stops.
  if (order <= 1) {
    const tip = points[points.length - 1]
    const before = points[points.length - 2]
    const here = Math.atan2(tip.y - before.y, tip.x - before.x)
    const tipBorn = born + grown / speed
    const brush = 2 + Math.floor(rng() * 3)
    for (let i = 0; i < brush && tipBorn <= LAST_BIRTH; i++) {
      sprout(roots, rng, {
        order: MAX_ORDER,
        start: tip,
        heading: here + (rng() - 0.5) * 1.4,
        length: 10 + rng() * 14,
        born: tipBorn + rng() * 0.03,
        girth: GIRTH[MAX_ORDER] * (0.7 + rng() * 0.6),
      })
    }
  }
}

/** How much of a root has grown by elapsed fraction `p`, in units of length. */
export function grownLength(root: Root, p: number): number {
  const total = (root.points.length - 1) * STEP
  return Math.max(0, Math.min(total, (p - root.born) * root.speed))
}

/**
 * The width of a root at a point `distance` along it, at elapsed fraction `p`. A
 * part just reached is tip-thin; it swells toward the root's girth as it ages, and
 * the far end of a root never gets as thick as its base.
 */
export function widthAt(root: Root, distance: number, p: number): number {
  const reached = root.born + distance / root.speed
  const age = Math.max(0, Math.min(1, (p - reached) / THICKEN))
  const total = (root.points.length - 1) * STEP
  const taper = 1 - 0.65 * (distance / total)
  const tip = TIP[root.order]
  const full = Math.max(tip, root.girth * taper)
  // Ease out: a young root fattens quickly, an old one slowly.
  return tip + (full - tip) * (1 - (1 - age) ** 1.6)
}

/**
 * Everything to draw at elapsed fraction `p`. Parents come before their laterals,
 * so a tendril lies on top of the root it leaves, and each piece keeps its key
 * from one moment to the next.
 */
export function rootStrokes(roots: readonly Root[], p: number): RootStroke[] {
  const strokes: RootStroke[] = []
  roots.forEach((root, r) => {
    const grown = grownLength(root, p)
    if (grown <= 0) return
    const chunk = CHUNK[root.order]
    const lastFull = Math.floor(grown / STEP)
    for (let start = 0; start * STEP < grown; start += chunk) {
      const end = Math.min(start + chunk, lastFull)
      const pts = root.points.slice(start, end + 1)
      // The tip: the part of the next step grown so far.
      if (end === lastFull && lastFull < root.points.length - 1) {
        const a = root.points[lastFull]
        const b = root.points[lastFull + 1]
        const t = grown / STEP - lastFull
        if (t > 0) pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      }
      if (pts.length < 2) continue
      const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join('')
      strokes.push({ key: `${r}-${start}`, d, width: widthAt(root, start * STEP, p) })
    }
  })
  return strokes
}
