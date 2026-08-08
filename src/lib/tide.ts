/**
 * The water surface of the 'tide' rest shape (see components/RestTimer).
 *
 * The surface is a row of nodes strung together like a chain of springs: each one
 * is pulled toward its neighbours (so a disturbance travels sideways), pulled
 * gently back to flat (so it can't drift), and slowed a little every step (so it
 * settles). A bubble breaking through lifts the water above it and the rest of
 * the surface answers — the bump spreads out, rebounds off the walls and rings
 * down to flat over a couple of seconds.
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
 */
const SPREAD = 0.25

/** Pull back toward flat, so the surface has a rest position to return to. */
const RESTORE = 0.002

/**
 * Speed kept per step: 0.988^120 ≈ 0.24, so a splash loses about three quarters
 * of its motion every second and is visually flat a couple of seconds after the
 * pop — long enough to read as water, calm again before the next bubble.
 */
const DAMPING = 0.988

/**
 * Ceiling on the steps one call may run. A backgrounded tab hands back a huge
 * `dt`; catching up on all of it would stall a frame replaying motion nobody saw,
 * so the backlog is dropped instead.
 */
const MAX_STEPS_PER_CALL = 16

/** Half-width of the bump a bursting bubble leaves, in nodes. */
const IMPULSE_WIDTH = 1.8

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
 * shove, so the peak of the splash is exactly as tall as its strength says.
 */
export function impulseWave(wave: Wave, at: number, amplitude: number): void {
  const n = wave.y.length
  const centre = Math.max(0, Math.min(1, at)) * (n - 1)
  for (let i = 0; i < n; i++) {
    const d = (i - centre) / IMPULSE_WIDTH
    wave.y[i] -= amplitude * Math.exp(-d * d)
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

/** Smallest splash, as a fraction of a full one — still visible, just modest. */
const SPLASH_MIN = 0.32

/** Higher means more of the draws land near the small end. */
const SPLASH_BIAS = 2.6

/**
 * How big a splash a surfacing bubble makes, from a 0–1 random draw. Skewed hard
 * toward the bottom of the range: most bubbles barely dent the surface and only
 * the occasional one throws a full crown, which is what makes a big one worth
 * catching.
 */
export function splashStrength(random: number): number {
  const r = Math.max(0, Math.min(1, random))
  return SPLASH_MIN + (1 - SPLASH_MIN) * r ** SPLASH_BIAS
}
