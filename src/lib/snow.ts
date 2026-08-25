/**
 * The flakes of the 'globe' rest shape (see components/RestShapes).
 *
 * A snow globe reads its own time three ways, and all three are the same reading:
 * the drift piling up on the floor is the rest already spent, the number of flakes
 * still in the air is the rest still to come, and how low a flake floats is how
 * close its own turn is. All of it comes out of `settleAt` — the one fraction of
 * the countdown a flake owns.
 *
 * The globe starts *shaken*. Every flake is in the air on the first frame, spread
 * from just under the lid down to the drift, and no flake is ever added to the
 * glass or taken out of it mid-rest. What they do is float: each swings side to
 * side on its own beat, bobs up and down on another, and sinks — slowly — toward
 * the drift as its turn approaches.
 *
 * A flake leaves the air only by *landing*: once the countdown passes its
 * `settleAt` it drops the last of the way, touches the drift and melts into the
 * surface there. That is what makes zero legible — the end isn't fewer and fewer
 * dots disappearing mid-air, it is snow that has all come down and is lying on the
 * floor.
 *
 * The drop keeps the swing it was already riding. A flake that stopped wandering
 * the instant its turn came read as a switch being thrown — the same speck, one
 * frame drifting and the next on rails — so the fall only takes the bob's place:
 * the flake goes on swaying at its own beat and its own width, and works up to a
 * sink rate slowly enough that the eye never catches the moment it was called.
 *
 * Nothing recycles. Snow that restarts at the top gives the globe a moving front
 * with a hole opening up behind it, which reads as weather blowing past a window
 * rather than as a globe that was shaken once and is settling. Because a flake's
 * height is its share of the countdown and those shares are spread evenly, the
 * column stays evenly full for the whole rest: there is always snow right above
 * the drift, and always snow above that, however few flakes are left.
 *
 * Positions are 0–1 across the globe with y pointing down, and lateral position is
 * kept as a share of however wide the glass is at that height — so a flake near the
 * top or the bottom of the sphere sits near the middle, where there is actually
 * room for it, instead of being clipped off against the curve.
 */

/** Largest step taken in one go. A backgrounded tab hands back a huge `dt`; fast-forwarding the whole gap would land every flake at once. */
const MAX_DT = 1 / 20

/** How much of the glass's half-width at a given height the flakes may use, so they never brush it. */
const GLASS_MARGIN = 0.88

/** How far below the lid the highest flake floats, so the top of the column reads as snow and not as a seam. */
const TOP_MARGIN = 0.04

/**
 * How far above the drift a flake waits its turn, as a share of the globe's height.
 * Drawn per flake rather than fixed: a single figure would line the lowest flakes
 * up along the surface, and this is also the drop each one has left when the
 * countdown calls it, so a spread of them makes for a spread of landings.
 */
const CLEARANCE = { min: 0.035, max: 0.11 } as const

/** Flake diameter as a share of the globe's width. The floor is what still reads as a flake at arm's length. */
const SIZE = { min: 0.018, max: 0.038 } as const

/** How far a flake swings from its line, in the same ±1 units its lateral position uses. */
const SWAY_AMP = { min: 0.1, max: 0.3 } as const

/** And how quickly — well under a cycle a second, so the swing reads as a drift. */
const SWAY_HZ = { min: 0.1, max: 0.28 } as const

/**
 * The rise and fall a floating flake rides, in globe-heights, and how quickly. This
 * is most of the movement in a globe with plenty of rest left: the sink toward the
 * drift is far too slow to see over a second or two, and without a bob on top of it
 * the snow would read as a field of specks pinned to the glass.
 */
const BOB_AMP = { min: 0.012, max: 0.032 } as const
const BOB_HZ = { min: 0.05, max: 0.14 } as const

/**
 * The time constant of the sink, in seconds. A flake's height is read off the
 * countdown, and the countdown arrives in steps a few times a second; easing toward
 * it rather than snapping to it is what turns those steps into a drift.
 */
const SINK_TAU = 0.45

/**
 * The share of the rest over which flakes are called down. Held below 1 so the
 * globe starts with every flake in the air: settling times drawn right up to 1 take
 * the first flake down within a tick of the rest starting, which reads as snow that
 * never got going rather than snow that has begun to land.
 */
const SETTLE_SPAN = 0.95

/**
 * Globe-heights per second a called-down flake works up to. Slow: the drop it has
 * left is only its `clearance`, and a rate that covers that in a blink reads as the
 * flake being yanked down rather than as snow finding the surface.
 */
const DROP_FALL = 0.26

/** How quickly it gets there — the time constant of the run-up, in seconds. */
const DROP_TAU = 0.55

/** Seconds a flake takes to melt into the drift after touching it. */
const LAND_FADE = 0.5

/** How solid a flake in the air is painted. */
const AIR_ALPHA = 0.85

/** How far a landed flake shrinks as it melts in, so it merges with the drift rather than blinking out. */
const LAND_SHRINK = 0.45

export type Flake = {
  /** Lateral line it floats along: -1 against one side of the glass, +1 the other. */
  u: number
  /** Where it is painted, down the globe. 0 is the lid, 1 the bottom of the glass. */
  y: number
  /** The height its bob rides on: the sink, eased toward where the countdown puts it. */
  sink: number
  /** Diameter as a share of the globe's width. */
  size: number
  /** How far over the drift it floats while it waits, and so the drop it has left. */
  clearance: number
  /** The swing it rides: how far, how fast, and where in the cycle it started. */
  swayAmp: number
  swayHz: number
  swayPhase: number
  /** And the rise and fall, the same three ways. */
  bobAmp: number
  bobHz: number
  bobPhase: number
  /**
   * The remaining-rest fraction below which this flake is called down. Spread
   * across 0–`SETTLE_SPAN` at creation, so the number still airborne *is* the
   * fraction of the rest still to come, and the last flake lands on the tick.
   *
   * It is also where the flake floats: `settleAt / fraction` is how far down the
   * air column it sits, which is 1 — the drift — exactly when its turn comes.
   */
  settleAt: number
  /** What it is falling at, running up to `DROP_FALL` once it has been called down. */
  speed: number
  /** Whether the countdown has called it down. From there it only goes to the drift. */
  dropping: boolean
  /** The `snow.t` at which it reached the drift, or null while it is still in the air. */
  landedAt: number | null
}

export type Snow = {
  flakes: Flake[]
  /** Seconds simulated so far — the clock the sways and bobs are read against. */
  t: number
}

/** Where to paint a flake and how solid it is: a landed one is melting into the drift. */
export type Look = { x: number; y: number; alpha: number; scale: number }

const between = (range: { min: number; max: number }, random: number) =>
  range.min + random * (range.max - range.min)

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

const clamp01 = (n: number) => clamp(n, 0, 1)

/** Everything about a flake except where it floats and when its turn comes. */
function draw(rng: () => number): Omit<Flake, 'y' | 'sink' | 'settleAt'> {
  const swayAmp = between(SWAY_AMP, rng())
  return {
    // The line is drawn inside the room its swing needs, rather than anywhere
    // across the glass: a wide swing starting hard against the side would spend
    // half of every cycle pinned there, which reads as a flake stuck to the glass.
    u: (rng() * 2 - 1) * (1 - swayAmp),
    size: between(SIZE, rng()),
    clearance: between(CLEARANCE, rng()),
    swayAmp,
    swayHz: between(SWAY_HZ, rng()),
    swayPhase: rng() * 2 * Math.PI,
    bobAmp: between(BOB_AMP, rng()),
    bobHz: between(BOB_HZ, rng()),
    bobPhase: rng() * 2 * Math.PI,
    speed: 0,
    dropping: false,
    landedAt: null,
  }
}

/**
 * How far down the air column a flake floats with `fraction` of the rest left: its
 * own share of the countdown against the share that is left. A flake three quarters
 * of the way through its wait is three quarters of the way down, and one whose turn
 * has come is at the bottom, a `clearance` over the drift.
 *
 * Spreading the shares evenly (see `createSnow`) is what spreads the flakes evenly,
 * and it keeps doing so as the glass empties: the flakes that are left always run
 * from the lid down to the drift rather than bunching at either end.
 */
function columnAt(flake: Flake, fraction: number): number {
  return fraction <= 0 ? 1 : clamp01(flake.settleAt / fraction)
}

/** Where the sink is heading: the flake's place in the column, in globe-heights. */
function sinkTarget(flake: Flake, floor: number, fraction: number): number {
  const lid = TOP_MARGIN + flake.size / 2
  const surface = floor - flake.clearance
  return lid + columnAt(flake, fraction) * Math.max(0, surface - lid)
}

/** The rise and fall on top of the sink. */
const bobAt = (flake: Flake, t: number) =>
  flake.bobAmp * Math.sin(2 * Math.PI * flake.bobHz * t + flake.bobPhase)

/** A height kept inside the glass and off the drift. */
const inGlass = (flake: Flake, y: number, floor: number) =>
  clamp(y, flake.size / 2, floor - flake.size / 2)

/**
 * A globe that has just been shaken: every flake in the air at once, spread from
 * under the lid down to the drift, and already swinging.
 *
 * `settleAt` is drawn one per evenly-spaced slot rather than at random across the
 * range, so the flakes land at a steady rate instead of in clumps — the count in
 * the air tracks the countdown closely, which is the point of it, and because a
 * flake's height is read off the same number, an even spread of slots is also what
 * fills the column evenly.
 *
 * The last flake down is pinned to zero rather than given a slot of its own. Its
 * slot is worth a couple of seconds of a long rest, and spent anywhere in that slot
 * it would leave the globe finished and still while the clock was visibly still
 * running. Pinned, it is called on the tick and lands just after it, so the globe
 * comes to rest *on* the end of the rest whatever the rest was set to.
 *
 * The flakes are placed against an empty glass, since a rest that has just started
 * has no drift yet; the first step settles them against whatever floor is really
 * there.
 */
export function createSnow(count: number, rng: () => number = Math.random): Snow {
  const n = Math.max(0, Math.floor(count))
  const flakes: Flake[] = []
  for (let i = 0; i < n; i++) {
    const settleAt = i === 0 ? 0 : (SETTLE_SPAN * (i + rng())) / n
    const flake: Flake = { ...draw(rng), settleAt, sink: 0, y: 0 }
    flake.sink = sinkTarget(flake, 1, 1)
    flake.y = inGlass(flake, flake.sink + bobAt(flake, 0), 1)
    flakes.push(flake)
  }
  return { flakes, t: 0 }
}

/** Whether this flake is still floating with `fraction` of the rest left. */
export function isAirborne(flake: Flake, fraction: number): boolean {
  return flake.settleAt < fraction
}

/** Whether this flake has landed and finished melting into the drift. */
export function isSettled(flake: Flake, t: number): boolean {
  return flake.landedAt !== null && t - flake.landedAt >= LAND_FADE
}

/**
 * Advance the snow by `dt` seconds, with `fraction` of the rest still to come.
 * `floor` is where the drift's surface sits (0–1 down the globe).
 *
 * A flake still floating is placed rather than pushed: the countdown says how far
 * down the column it belongs, and it eases there while bobbing about the spot. That
 * is what keeps the air evenly full — a field of independently falling flakes
 * clumps and gaps within seconds, however evenly it was seeded.
 *
 * A flake the countdown has called down does the opposite: it stops taking its
 * height from the clock and eases into a sink of its own, and the drift keeps it.
 * Only the vertical changes hands — it carries its swing the whole way down — so
 * the drop reads as the same flake still drifting, and what marks the end is that
 * it reaches the snow. The last one touches down as the clock reaches zero, and
 * nothing in the glass is moving.
 */
export function stepSnow(snow: Snow, dt: number, floor: number, fraction: number): void {
  const step = clamp(dt, 0, MAX_DT)
  snow.t += step
  // The run-up to drop speed, and the ease onto the countdown's line, as the share
  // of each gap closed in this step.
  const glide = 1 - Math.exp(-step / DROP_TAU)
  const settle = 1 - Math.exp(-step / SINK_TAU)
  for (const flake of snow.flakes) {
    // A landed flake is done moving; it has only its melt left to run.
    if (flake.landedAt !== null) continue
    if (!isAirborne(flake, fraction)) flake.dropping = true
    if (flake.dropping) {
      flake.speed += (DROP_FALL - flake.speed) * glide
      flake.y += flake.speed * step
      flake.sink = flake.y
      if (flake.y >= floor) {
        flake.y = floor
        flake.landedAt = snow.t
      }
    } else {
      flake.sink += (sinkTarget(flake, floor, fraction) - flake.sink) * settle
      flake.y = inGlass(flake, flake.sink + bobAt(flake, snow.t), floor)
    }
  }
}

/**
 * Where to paint a flake, as a fraction of the globe's box, and how solid to paint
 * it. The glass is a circle, so the room either side of the middle narrows toward
 * the top and bottom; the flake's lateral position is a share of that room rather
 * than of the whole width, which is what keeps it inside the glass at every height.
 *
 * The swing is the one thing a flake keeps from the first frame to the last, at
 * full width even while it is dropping: the sideways drift is what says *snow*, and
 * cutting it at the moment of the call is what made the fall look mechanical.
 *
 * A landed flake reads its sway against the moment it landed rather than against
 * the running clock, so it lies still on the drift while it melts in instead of
 * sliding along the surface.
 */
export function flakeLook(flake: Flake, t: number): Look {
  const clock = flake.landedAt ?? t
  const swung = clamp(
    flake.u + flake.swayAmp * Math.sin(2 * Math.PI * flake.swayHz * clock + flake.swayPhase),
    -1,
    1,
  )
  // Half-width of the circle at this height, in the same 0–1 units (radius ½).
  const room = Math.sqrt(Math.max(0, 0.25 - (flake.y - 0.5) ** 2))
  const melt = flake.landedAt === null ? 0 : clamp((t - flake.landedAt) / LAND_FADE, 0, 1)
  return {
    x: 0.5 + swung * room * GLASS_MARGIN,
    y: flake.y,
    alpha: AIR_ALPHA * (1 - melt),
    scale: 1 - LAND_SHRINK * melt,
  }
}
