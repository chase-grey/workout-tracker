/**
 * The water of the 'tide' rest shape (see components/RestTimer): its surface, and
 * the bubbles that disturb it.
 *
 * The surface is a row of nodes strung together like a chain of springs: each one
 * is pulled toward its neighbours (so a disturbance travels sideways), pulled
 * gently back to flat (so it can't drift), and slowed a little every step (so it
 * settles). A bubble breaking through lifts the water above it and the rest of
 * the surface answers — the bump spreads out, rebounds off the walls and rings
 * down over several seconds.
 *
 * Everything is tuned slow and long on purpose: wave speed is the only cue for how
 * big a body of water is, and a swell that takes its time reads as a deep vessel
 * where the same shape hurried up reads as a tumbler being shaken.
 *
 * Nothing here touches the water *level*: the level is the rest countdown and
 * comes from the remaining fraction. These offsets only ever ride on top of it.
 */

/**
 * How many points the surface is sampled at. Enough that a splash reads as a
 * localised bump with a couple of ripples running off it rather than a single
 * kink, cheap enough to step twice a frame.
 */
export const WAVE_NODES = 25

/** Fixed simulation step. The constants below are all per-step, not per-second. */
const STEP_SECONDS = 1 / 120

/**
 * How hard each node is pulled toward the average of its neighbours — this is
 * what makes a disturbance travel outward instead of bobbing in place. Must stay
 * below 1 or the chain shakes itself apart.
 *
 * A ripple's speed goes as its square root, so this is also the dial for how big
 * the water reads: a small glass slaps back and forth in an instant, a big body of
 * water takes its time. Deliberately low — a slow, long swell says the vessel
 * holds a lot more than the same wave hurried up would.
 */
const SPREAD = 0.085

/**
 * Pull back toward flat, so the surface has a rest position to return to. Barely
 * there: it exists to stop drift, and anything stronger stiffens the water into
 * something small and springy. Volume is conserved by the impulse itself (see
 * {@link impulseWave}) rather than by this dragging the mean back down.
 */
const RESTORE = 0.0006

/**
 * Speed kept per step: 0.9955^120 ≈ 0.58, so a splash keeps better than half its
 * motion each second and is still visibly rolling five seconds after the pop. Big
 * water doesn't go still quickly, and a surface that is never quite flat is most
 * of what sells the size.
 */
const DAMPING = 0.9955

/**
 * Ceiling on the steps one call may run. A backgrounded tab hands back a huge
 * `dt`; catching up on all of it would stall a frame replaying motion nobody saw,
 * so the backlog is dropped instead.
 */
const MAX_STEPS_PER_CALL = 16

/** Half-width of the bump a bursting bubble leaves, in nodes, if none is given. */
const IMPULSE_WIDTH = 2

/**
 * How much wider the dip around a bump is than the bump itself. The water thrown
 * up has to come from somewhere: the crest is paid for by a broad, shallow trough
 * around it, so a pop moves water rather than adding it.
 */
const TROUGH_SPREAD = 3.2

/** Keeps the crest exactly `amplitude` tall once the trough is subtracted from it. */
const CREST_SCALE = 1 / (1 - 1 / TROUGH_SPREAD)

export type Wave = {
  /**
   * Vertical offset of each node from the flat surface, in whatever units the
   * caller measures the vessel in. Negative is up (SVG's y axis points down).
   */
  y: number[]
  /** Vertical speed of each node, in those units per step. */
  v: number[]
  /** Time handed in but not yet simulated, so odd frame rates stay in step. */
  carry: number
}

export function createWave(nodes: number = WAVE_NODES): Wave {
  return { y: Array(nodes).fill(0), v: Array(nodes).fill(0), carry: 0 }
}

/**
 * A bubble bursting at `at` (0 = left wall, 1 = right wall): the water there is
 * thrown up by `amplitude` and left to settle. A displacement rather than a
 * shove, so the peak of the splash is exactly as tall as its strength says, and
 * `width` (in nodes) is how broad the bump is — a big bubble lifts a wider patch
 * of water than a small one does.
 *
 * The lift comes with a wide, shallow dip around it that exactly pays for it, so
 * the surface as a whole neither gains nor loses water. That matters here beyond
 * looking right: the water line is the countdown, and a surface left sitting a
 * little high after every pop would quietly overstate how much rest is left.
 */
export function impulseWave(
  wave: Wave,
  at: number,
  amplitude: number,
  width: number = IMPULSE_WIDTH,
): void {
  const n = wave.y.length
  const centre = Math.max(0, Math.min(1, at)) * (n - 1)
  for (let i = 0; i < n; i++) {
    const d = (i - centre) / Math.max(0.1, width)
    const crest = Math.exp(-d * d)
    // Same shape spread `TROUGH_SPREAD` times as wide and that much shallower, so
    // the two enclose the same area.
    const trough = Math.exp(-(d * d) / (TROUGH_SPREAD * TROUGH_SPREAD)) / TROUGH_SPREAD
    wave.y[i] -= amplitude * CREST_SCALE * (crest - trough)
  }
}

/**
 * One fixed step of the chain. The end nodes borrow their missing neighbour from
 * the other side, which makes the walls reflect: a ripple bounces off them rather
 * than being swallowed there, the way water in a glass does.
 */
function advance(wave: Wave): void {
  const { y, v } = wave
  const n = y.length
  if (n < 2) return
  for (let i = 0; i < n; i++) {
    const left = y[i === 0 ? 1 : i - 1]
    const right = y[i === n - 1 ? n - 2 : i + 1]
    v[i] = (v[i] + SPREAD * (left + right - 2 * y[i]) - RESTORE * y[i]) * DAMPING
  }
  for (let i = 0; i < n; i++) y[i] += v[i]
}

/** Advance the surface by `dt` seconds of real time. */
export function stepWave(wave: Wave, dt: number): void {
  wave.carry += Math.max(0, dt)
  let steps = 0
  while (wave.carry >= STEP_SECONDS && steps < MAX_STEPS_PER_CALL) {
    advance(wave)
    wave.carry -= STEP_SECONDS
    steps++
  }
  if (wave.carry >= STEP_SECONDS) wave.carry = 0
}

/**
 * The surface as an SVG path: a smooth curve through the nodes, spanning `width`
 * and sitting at `surfaceY` wherever the water is flat. Each segment is a
 * quadratic anchored on the node it leaves and ending at the midpoint of the pair
 * — the usual way to run a soft curve through a set of samples without
 * overshooting any of them.
 */
export function waveSurfacePath(wave: Wave, surfaceY: number, width = 100): string {
  const y = wave.y
  const n = y.length
  const at = (i: number) => (i / (n - 1)) * width
  const parts = [`M 0 ${round(surfaceY + y[0])}`]
  for (let i = 1; i < n; i++) {
    const mx = (at(i - 1) + at(i)) / 2
    const my = surfaceY + (y[i - 1] + y[i]) / 2
    parts.push(`Q ${round(at(i - 1))} ${round(surfaceY + y[i - 1])} ${round(mx)} ${round(my)}`)
  }
  parts.push(`L ${round(width)} ${round(surfaceY + y[n - 1])}`)
  return parts.join(' ')
}

const round = (n: number) => Math.round(n * 100) / 100

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

const between = (range: { min: number; max: number }, at: number) =>
  range.min + clamp01(at) * (range.max - range.min)

/* ---- The bubbles ----
 *
 * Two draws decide a bubble's whole life: how big it is, and how buoyant. Size is
 * the water it carries and buoyancy is how hard it pulls for the surface, and
 * every other number below falls out of those two — so what you see rising tells
 * you what it is about to do.
 *
 * Most bubbles lose: they come apart somewhere in the lower water, the feeble ones
 * barely off the floor. The buoyant few rush the whole depth and burst through the
 * line, and how hard they hit it is size and buoyancy together — a big lazy bubble
 * and a small frantic one both make a middling splash, while a big buoyant one is
 * the crown with droplets that makes watching the water worthwhile. */

/** Bubble diameter as a share of the vessel's width. */
const BUBBLE_SIZE = { min: 2.2, max: 8.6 } as const

/** Higher means more of the draws come out small, so a big bubble is worth seeing. */
const SIZE_BIAS = 1.45

/**
 * Buoyancy above which a bubble reaches the surface. Everything below it comes
 * apart on the way up, so this is really "how rare is a pop" — and it is meant to
 * be rare: the water rings for seconds after one, and a pop every second or two
 * would leave the surface permanently churning with nothing to read.
 */
const SURFACES_ABOVE = 0.74

/** Higher means fewer buoyant bubbles still, on top of the threshold above. */
const BUOYANCY_BIAS = 1.6

/**
 * How long a surfacing bubble takes to climb the water: the most buoyant ones
 * rush it, the ones that only just make it labour all the way up.
 */
const RISE_MS = { min: 1500, max: 3400 } as const

/** And how long one that never makes it lasts before it comes apart. */
const DISSOLVE_MS = { min: 650, max: 2000 } as const

/** How far up the water a bubble that comes apart gets, as a share of the depth. */
const DISSOLVE_CLIMB = { min: 0.08, max: 0.5 } as const

/**
 * Where a surfacing bubble stops, as a share of the depth: just shy of the line,
 * so its body meets the surface rather than its centre pushing out through it.
 */
const SURFACE_CLIMB = 0.94

/** How far the surface is thrown by a full-strength splash, in vessel hundredths. */
const WAVE_LIFT = 11

/** Half-width of the bump left on the surface, in nodes: smallest bubble to largest. */
const BUMP_NODES = { min: 1.3, max: 3.8 } as const

/** How high a splash is thrown, as a multiple of a modest pop. */
const POP_HEIGHT = { min: 0.7, max: 1.8 } as const

/** How far a bubble wanders sideways on the way up, as a share of its own width. */
const DRIFT = { min: -0.75, max: 0.75 } as const

/** Smallest splash, as a fraction of a full one — still visible, just modest. */
const SPLASH_MIN = 0.34

/** How much of a splash is the bubble's size rather than the speed it arrived at. */
const SPLASH_FROM_SIZE = 0.55

/** Higher means more of the splashes land near the small end. */
const SPLASH_BIAS = 1.5

/**
 * How big a splash a surfacing bubble makes. `size` is how big it is across the
 * range bubbles come in and `rush` how far past the surfacing threshold its
 * buoyancy went, both 0–1 — so the biggest crown of the rest needs a big bubble
 * that also came up fast, and either one alone is a dent.
 */
export function splashStrength(size: number, rush: number): number {
  const blend = SPLASH_FROM_SIZE * clamp01(size) + (1 - SPLASH_FROM_SIZE) * clamp01(rush)
  return SPLASH_MIN + (1 - SPLASH_MIN) * blend ** SPLASH_BIAS
}

/** One bubble's whole life, drawn at the moment it leaves the floor. */
export type Bubble = {
  /** Diameter, as a share of the vessel's width. */
  size: number
  /** How hard it pulls for the surface, 0–1. */
  buoyancy: number
  /** Whether it breaks the surface, or comes apart in the water. */
  surfaces: boolean
  /** How long it lives, in ms — its climb if it surfaces, its whole life if not. */
  life: number
  /** How far up the water it gets, as a share of the depth. */
  climb: number
  /** How far it wanders sideways on the way, as a share of its own width. */
  drift: number
  /** How big its splash is, 0–1 of a full crown. Meaningless unless it surfaces. */
  splash: number
  /** How high that splash is thrown, as a multiple of a modest pop. */
  pop: number
  /** How far it throws the surface, in vessel hundredths — see {@link impulseWave}. */
  lift: number
  /** And how broad a bump it leaves there, in wave nodes. */
  bump: number
}

/**
 * Draw a bubble. `rng` is injectable so the tests can drive a whole life from a
 * known pair of draws rather than sampling for one.
 */
export function drawBubble(rng: () => number = Math.random): Bubble {
  // Both draws are skewed low, so the big buoyant bubble is the one you wait for.
  const sizeAt = rng() ** SIZE_BIAS
  const buoyancy = rng() ** BUOYANCY_BIAS
  const size = between(BUBBLE_SIZE, sizeAt)
  const drift = between(DRIFT, rng())
  const surfaces = buoyancy > SURFACES_ABOVE

  if (!surfaces) {
    // How close it came to making it, which is all a doomed bubble's life is: the
    // feeblest barely leaves the floor before it goes, the near-miss gets halfway.
    const effort = buoyancy / SURFACES_ABOVE
    return {
      size,
      buoyancy,
      surfaces,
      life: between(DISSOLVE_MS, effort),
      climb: between(DISSOLVE_CLIMB, effort),
      drift,
      splash: 0,
      pop: 0,
      lift: 0,
      bump: 0,
    }
  }

  const rush = (buoyancy - SURFACES_ABOVE) / (1 - SURFACES_ABOVE)
  const splash = splashStrength(sizeAt, rush)
  return {
    size,
    buoyancy,
    surfaces,
    // The more buoyant, the faster the climb — hence the inverted ends.
    life: between(RISE_MS, 1 - rush),
    climb: SURFACE_CLIMB,
    drift,
    splash,
    pop: between(POP_HEIGHT, rush),
    lift: splash * WAVE_LIFT,
    bump: between(BUMP_NODES, sizeAt),
  }
}
