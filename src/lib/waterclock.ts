/**
 * The geometry of the water-clock rest shapes (see components/WaterGlass): two
 * tapered chambers, the neck between them, and where each chamber's water line
 * sits with `level` of the rest still to run.
 *
 * The same silhouette as the sand hourglasses in components/RestTimer, and
 * deliberately not the same numbers. Sand needs no gap at the waist — nothing is
 * ever drawn crossing it — where the whole point of a water clock is the drop
 * falling through, so the neck here is opened up wide enough to hold one and the
 * chambers are pulled off the walls far enough that a wave has somewhere to break.
 *
 * Everything is in the glass's own SVG user units, and both glasses are 100 wide,
 * so every horizontal number is also a percentage of the glass.
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export type Glass = {
  width: number
  height: number
  /** The upper chamber's top edge, and the lower chamber's floor. */
  top: number
  bottom: number
  /** Where the two chambers meet. */
  waist: number
  /** Half-width of the opening there: the neck a drop falls through. */
  waistHalf: number
  /** How far the chambers sit inside the box, leaving room for the stroke. */
  wall: number
  /**
   * Whether the glass wears end caps. The boxed shape shares the middle of the
   * screen with a dozen other small shapes and needs them to read as a timer
   * object at that size; the full-bleed one is the height of the screen and reads
   * as one without any help, so it stays bare.
   */
  caps: boolean
}

/** A cap: a rounded bar across one end of the glass. */
export type Cap = {
  x: number
  y: number
  width: number
  height: number
  r: number
}

export type GlassPaths = {
  /** The two chambers, each a flat edge tapering in straight lines to the waist. */
  upper: string
  lower: string
  caps: readonly Cap[]
}

/**
 * The full-bleed water clock: tall, bare, standing the whole height of the rest
 * screen. Proportions match the sand hourglass it stands beside, so the two read
 * as the same object holding different stuff.
 */
export const TALL_GLASS: Glass = {
  width: 100,
  height: 150,
  top: 5,
  bottom: 145,
  waist: 75,
  waistHalf: 4.5,
  wall: 8,
  caps: false,
} as const

/**
 * And the boxed one, which takes its turn in the square in the middle of the
 * screen: squarer, capped top and bottom, and a slightly wider neck, since the
 * whole glass is a third of the size and the drop still has to be visible in it.
 */
export const BOXED_GLASS: Glass = {
  width: 100,
  height: 100,
  top: 14,
  bottom: 86,
  waist: 50,
  waistHalf: 5,
  wall: 12,
  caps: true,
} as const

/** How far the fill is run past the box, so its clipped side edges never show. */
const OVERHANG = 10

/** How tall a cap is, and how far past the chamber's shoulder it reaches. */
const CAP_HEIGHT = 4.5
const CAP_REACH = 3

/**
 * The two chambers, mirrored about the waist, plus whatever caps the glass wears.
 * Straight lines only and no depth of any kind: this is the *sign* for a water
 * clock rather than a drawing of one.
 */
export function glassPaths(g: Glass): GlassPaths {
  const left = g.wall
  const right = g.width - g.wall
  const neckL = g.width / 2 - g.waistHalf
  const neckR = g.width / 2 + g.waistHalf
  const cap = (y: number): Cap => ({
    x: left - CAP_REACH,
    y,
    width: right - left + CAP_REACH * 2,
    height: CAP_HEIGHT,
    r: CAP_HEIGHT / 2,
  })
  return {
    upper: [
      `M ${left} ${g.top}`,
      `L ${right} ${g.top}`,
      `L ${neckR} ${g.waist}`,
      `L ${neckL} ${g.waist}`,
      'Z',
    ].join(' '),
    lower: [
      `M ${neckL} ${g.waist}`,
      `L ${neckR} ${g.waist}`,
      `L ${right} ${g.bottom}`,
      `L ${left} ${g.bottom}`,
      'Z',
    ].join(' '),
    caps: g.caps ? [cap(g.top - CAP_HEIGHT - 1), cap(g.bottom + 1)] : [],
  }
}

/**
 * A body of water with a flat top at `surfaceY`, filled down to `floorY`. Run
 * wider than the box on both sides and cropped to the chamber it lives in, which
 * is what lets its edges meet the tapered walls exactly wherever they happen to
 * be.
 */
export function chamberFill(g: Glass, surfaceY: number, floorY: number): string {
  return `M ${-OVERHANG} ${surfaceY} H ${g.width + OVERHANG} V ${floorY} H ${-OVERHANG} Z`
}

/**
 * Where the two water lines sit with `level` of the rest still to run (1 at the
 * start, 0 when it's up): the upper chamber's surface sinks toward the waist and
 * the lower chamber's rises off the floor by exactly the same share of its own
 * chamber, so either line alone says how much rest is left.
 */
export function waterLines(g: Glass, level: number): { upper: number; lower: number } {
  const spent = 1 - clamp01(level)
  return {
    upper: g.top + (g.waist - g.top) * spent,
    lower: g.bottom - (g.bottom - g.waist) * spent,
  }
}
