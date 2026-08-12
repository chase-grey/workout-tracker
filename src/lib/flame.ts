/**
 * The flame of the 'candle' rest shape (see components/RestTimer).
 *
 * A real flame never repeats itself. It leans whichever way the air pushes it,
 * stretches and shrinks, brightens on a beat of its own, and every so often a
 * draught catches it and it gutters. A looping keyframe can't do any of that:
 * whatever it does, it does again a second later, and the eye reads that loop as
 * a bob rather than a flicker.
 *
 * So the flame is simulated instead. Three channels — sway, stretch and glow —
 * each ride a spring that is shoved randomly every step and pulled back toward
 * rest. They run at different frequencies off separate random draws, so they
 * never line up: the flame can be tall and dim or short and bright, and it leans
 * on a much slower beat than it twinkles. On top of that, gutters land at random
 * intervals and knock it sideways.
 *
 * Nothing here touches the wax level: the level is the rest countdown. These
 * offsets only ever ride on top of it.
 */

/** Fixed simulation step. Every constant below is tuned against this rate. */
const STEP_SECONDS = 1 / 120

/**
 * Ceiling on the steps one call may run. A backgrounded tab hands back a huge
 * `dt`; catching up on all of it would stall a frame replaying motion nobody
 * saw, so the backlog is dropped instead.
 */
const MAX_STEPS_PER_CALL = 16

/** One sprung channel: a value that gets shoved about and pulled back to zero. */
export type Channel = { x: number; v: number }

/** The fixed character of a channel — how fast it moves and how far it strays. */
type Spec = {
  /** Pull back toward rest, per second squared. */
  stiffness: number
  /** Speed bled off, per second. */
  drag: number
  /** Largest random shove handed to the velocity each step. */
  kick: number
  /** Roughly how far the channel sits from rest at any moment. */
  wander: number
  /** Hard stop on how far it may ever stray, so a run of bad luck can't fling it. */
  limit: number
}

/**
 * Build a channel's constants from how it should *read*: `hz` is how quickly it
 * wobbles, `zeta` how sharply it settles (below 1 it rings), `wander` how far
 * from rest it typically sits.
 *
 * The kick is sized so the channel actually settles at that wander: a
 * noise-driven spring's steady-state variance is `σ²/(4ζω³)`, and a per-step
 * impulse drawn evenly from ±k carries `σ² = k²/(3·STEP_SECONDS)`. Solving the
 * two for k gives the expression below — which is the whole point of deriving it
 * rather than hand-tuning, since the three channels run at frequencies an order
 * of magnitude apart and would otherwise need wildly different hand-picked
 * numbers to end up equally lively.
 */
function spec(hz: number, zeta: number, wander: number, limit: number): Spec {
  const w = 2 * Math.PI * hz
  return {
    stiffness: w * w,
    drag: 2 * zeta * w,
    kick: wander * Math.sqrt(12 * STEP_SECONDS * zeta * w ** 3),
    wander,
    limit,
  }
}

/**
 * Which way the flame is leaning. The slowest channel by far — a flame drifts to
 * one side and stays there for a beat before the air moves it back.
 */
const SWAY = spec(1.05, 0.45, 0.36, 1.6)

/** How tall it is standing. Middling speed: visible, but not a strobe. */
const STRETCH = spec(2.3, 0.5, 0.34, 1.6)

/** How bright it is burning. The fastest channel — this is the twinkle. */
const GLOW = spec(3.6, 0.62, 0.5, 1.8)

const SPECS = { sway: SWAY, stretch: STRETCH, glow: GLOW } as const
type ChannelName = keyof typeof SPECS
const CHANNEL_NAMES = Object.keys(SPECS) as ChannelName[]

/** Seconds between draughts. Wide enough that you can't feel the next one coming. */
const GUTTER_GAP = { min: 1.3, max: 4.8 } as const

/**
 * What a draught does: shoves the flame hard to one side, ducks it and dims it
 * all at once. Several times the size of the ordinary per-step shoves, so a
 * gutter reads as an event rather than as more of the same wandering.
 */
const GUTTER = { sway: 6, duck: 9, dim: 14 } as const

export type Flame = {
  /** Lean, roughly ±1 at the edge of its usual range. Positive is to the right. */
  sway: Channel
  /** Height off its resting height, in the same rough ±1 units. */
  stretch: Channel
  /** Brightness off its resting brightness, same units. */
  glow: Channel
  /** Seconds until the next draught catches it. */
  untilGutter: number
  /** Time handed in but not yet simulated, so odd frame rates stay in step. */
  carry: number
}

/** A random draw in ±1, from a 0–1 source. */
const spread = (random: number) => random * 2 - 1

/**
 * A flame already burning: each channel starts somewhere in its usual range
 * rather than dead still, so the candle is alive on the very first frame instead
 * of spending half a second winding up.
 */
export function createFlame(rng: () => number = Math.random): Flame {
  const channel = (s: Spec): Channel => ({ x: spread(rng()) * s.wander, v: 0 })
  return {
    sway: channel(SWAY),
    stretch: channel(STRETCH),
    glow: channel(GLOW),
    untilGutter: GUTTER_GAP.min + rng() * (GUTTER_GAP.max - GUTTER_GAP.min),
    carry: 0,
  }
}

/**
 * A draught catches the flame: it lurches to `direction` (-1 left, +1 right),
 * ducks, and dims. Applied as velocities rather than positions, so the flame
 * swings through the lurch and climbs back out of it instead of teleporting.
 */
export function gutterFlame(flame: Flame, direction: number): void {
  flame.sway.v += GUTTER.sway * Math.sign(direction || 1)
  flame.stretch.v -= GUTTER.duck
  flame.glow.v -= GUTTER.dim
}

/** One fixed step of a single channel. */
function advance(channel: Channel, s: Spec, rng: () => number): void {
  channel.v +=
    (-s.stiffness * channel.x - s.drag * channel.v) * STEP_SECONDS + spread(rng()) * s.kick
  channel.x += channel.v * STEP_SECONDS
  // Held at the edge rather than allowed to sail past it. The velocity goes with
  // it: a flame that has leaned as far as it leans has stopped moving that way.
  if (channel.x > s.limit) {
    channel.x = s.limit
    channel.v = 0
  } else if (channel.x < -s.limit) {
    channel.x = -s.limit
    channel.v = 0
  }
}

/** Advance the flame by `dt` seconds of real time. */
export function stepFlame(flame: Flame, dt: number, rng: () => number = Math.random): void {
  flame.carry += Math.max(0, dt)
  let steps = 0
  while (flame.carry >= STEP_SECONDS && steps < MAX_STEPS_PER_CALL) {
    for (const name of CHANNEL_NAMES) advance(flame[name], SPECS[name], rng)
    flame.untilGutter -= STEP_SECONDS
    if (flame.untilGutter <= 0) {
      gutterFlame(flame, rng() < 0.5 ? -1 : 1)
      flame.untilGutter = GUTTER_GAP.min + rng() * (GUTTER_GAP.max - GUTTER_GAP.min)
    }
    flame.carry -= STEP_SECONDS
    steps++
  }
  if (flame.carry >= STEP_SECONDS) flame.carry = 0
}

/** Degrees of shear at the flame's full lean. */
const LEAN_DEGREES = 14

/** How much taller than resting height a full stretch makes it. */
const STRETCH_RANGE = 0.13

/** And how much narrower — a flame that draws up also draws in. */
const WIDTH_RANGE = 0.06

/** Opacity at rest, and how far the glow swings it either way. */
const GLOW_BASE = 0.86
const GLOW_RANGE = 0.2

/** Never so faint it looks like the candle went out. */
const GLOW_MIN = 0.5

/** What to paint: ready to drop straight onto the flame element each frame. */
export type FlameLook = { transform: string; opacity: number }

const round = (n: number) => Math.round(n * 1000) / 1000

/**
 * The flame's current shape as a transform, drawn about its base (the wick) —
 * see `.rest-flame` in index.css for the `transform-origin` that pins it there.
 *
 * The lean is a shear, not a shift, so the flame stays rooted on the wick while
 * its tip drifts. CSS shears about the origin and its y axis points down, so a
 * *negative* skew is what carries the tip (which is above the origin) to the
 * right — hence the flipped sign against `sway`.
 */
export function flameLook(flame: Flame): FlameLook {
  const stretch = flame.stretch.x
  return {
    transform:
      `skewX(${round(-flame.sway.x * LEAN_DEGREES)}deg) ` +
      `scale(${round(Math.max(0.6, 1 - stretch * WIDTH_RANGE))}, ` +
      `${round(Math.max(0.6, 1 + stretch * STRETCH_RANGE))})`,
    opacity: round(Math.min(1, Math.max(GLOW_MIN, GLOW_BASE + flame.glow.x * GLOW_RANGE))),
  }
}
