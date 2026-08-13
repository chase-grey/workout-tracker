/**
 * The flakes of the 'globe' rest shape (see components/RestShapes).
 *
 * A snow globe reads its own time twice: the drift piling up on the floor, and the
 * flakes still in the air above it. Both come straight from the countdown here —
 * the drift's height is the rest already spent, and every flake carries the
 * fraction at which it settles, so the number still falling is the rest still to
 * come. Neither reading depends on the simulation below.
 *
 * What the simulation does is the *falling*: each flake drifts down at its own
 * pace, swinging slowly side to side on its own beat, and starts again from the top
 * when it reaches the drift. Nothing about it is periodic across the globe as a
 * whole, so the snow never reads as a looping texture the way a keyframed version
 * would.
 *
 * Positions are 0–1 across the globe with y pointing down, and lateral position is
 * kept as a share of however wide the glass is at that height — so a flake near the
 * top or the bottom of the sphere sits near the middle, where there is actually
 * room for it, instead of being clipped off against the curve.
 */

/** Largest step taken in one go. A backgrounded tab hands back a huge `dt`; fast-forwarding the whole gap would teleport every flake to the drift at once. */
const MAX_DT = 1 / 20

/** How much of the glass's half-width at a given height the flakes may use, so they never brush it. */
const GLASS_MARGIN = 0.88

/** Globe-heights per second: slow enough to read as snow in oil rather than rain. */
const FALL = { min: 0.06, max: 0.15 } as const

/** Flake diameter as a share of the globe's width. */
const SIZE = { min: 0.012, max: 0.032 } as const

/** How far a flake swings from its line, in the same ±1 units its position uses. */
const SWAY_AMP = { min: 0.04, max: 0.24 } as const

/** And how quickly — well under a cycle a second, so the swing reads as a drift. */
const SWAY_HZ = { min: 0.07, max: 0.23 } as const

export type Flake = {
  /** Lateral line it falls along: -1 against one side of the glass, +1 the other. */
  u: number
  /** How far down the globe it has fallen. 0 is the top; negative is just above it. */
  y: number
  /** Diameter as a share of the globe's width. */
  size: number
  /** Fall speed, in globe-heights per second. */
  fall: number
  /** The swing it rides: how far, how fast, and where in the cycle it started. */
  swayAmp: number
  swayHz: number
  swayPhase: number
  /**
   * The remaining-rest fraction below which this flake has settled into the drift.
   * Spread across 0–1 at creation, so the number still airborne *is* the fraction
   * of the rest still to come.
   */
  settleAt: number
}

export type Snow = {
  flakes: Flake[]
  /** Seconds simulated so far — the clock the sways are read against. */
  t: number
}

const between = (range: { min: number; max: number }, random: number) =>
  range.min + random * (range.max - range.min)

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Everything about a flake except where it is in its fall. */
function draw(rng: () => number): Omit<Flake, 'y' | 'settleAt'> {
  return {
    u: rng() * 2 - 1,
    size: between(SIZE, rng()),
    fall: between(FALL, rng()),
    swayAmp: between(SWAY_AMP, rng()),
    swayHz: between(SWAY_HZ, rng()),
    swayPhase: rng() * 2 * Math.PI,
  }
}

/**
 * A globe that has already been shaken: the flakes start scattered down the whole
 * height rather than queued at the top, so the snow is falling on the first frame.
 *
 * `settleAt` is drawn one per evenly-spaced slot rather than at random across the
 * range, so the flakes land at a steady rate instead of in clumps — the count in
 * the air tracks the countdown closely, which is the point of it.
 */
export function createSnow(count: number, rng: () => number = Math.random): Snow {
  const n = Math.max(0, Math.floor(count))
  const flakes: Flake[] = []
  for (let i = 0; i < n; i++) {
    flakes.push({ ...draw(rng), y: rng(), settleAt: (i + rng()) / n })
  }
  return { flakes, t: 0 }
}

/** Whether this flake is still in the air with `fraction` of the rest left. */
export function isAirborne(flake: Flake, fraction: number): boolean {
  return flake.settleAt < fraction
}

/**
 * Advance the snow by `dt` seconds. `floor` is where the drift's surface sits
 * (0–1 down the globe) — a flake that reaches it starts again from just above the
 * top as a freshly drawn flake, so a globe watched for a whole rest never shows
 * the same flake falling the same way twice.
 *
 * Its `settleAt` is deliberately *not* redrawn: that is the flake's share of the
 * countdown, and rerolling it would let the number in the air wander off the time.
 */
export function stepSnow(
  snow: Snow,
  dt: number,
  floor: number,
  rng: () => number = Math.random,
): void {
  const step = clamp(dt, 0, MAX_DT)
  snow.t += step
  for (let i = 0; i < snow.flakes.length; i++) {
    const flake = snow.flakes[i]
    flake.y += flake.fall * step
    if (flake.y > floor) {
      snow.flakes[i] = { ...draw(rng), y: -flake.size, settleAt: flake.settleAt }
    }
  }
}

/**
 * Where to paint a flake, as a fraction of the globe's box. The glass is a circle,
 * so the room either side of the middle narrows toward the top and bottom; the
 * flake's lateral position is a share of that room rather than of the whole width,
 * which is what keeps it inside the glass at every height.
 */
export function flakeLook(flake: Flake, t: number): { x: number; y: number } {
  const swung = clamp(flake.u + flake.swayAmp * Math.sin(2 * Math.PI * flake.swayHz * t + flake.swayPhase), -1, 1)
  // Half-width of the circle at this height, in the same 0–1 units (radius ½).
  const room = Math.sqrt(Math.max(0, 0.25 - (flake.y - 0.5) ** 2))
  return { x: 0.5 + swung * room * GLASS_MARGIN, y: flake.y }
}
