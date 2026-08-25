/**
 * The surface of the 'tide' rest shape's water (see components/RestTimer). What
 * disturbs it — the bubbles — is simulated in lib/bubbles; this is only the water
 * line's own behaviour once something has hit it.
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

/**
 * How far the surface is displaced at `at` (0 = left wall, 1 = right wall),
 * interpolated between the two nodes either side of it. The bubbles read the water
 * line through this, so what pops one is the wave over it rather than the flat line
 * underneath: a trough rolling past lets a bubble out early, a crest holds it under.
 */
export function waveHeightAt(wave: Wave, at: number): number {
  const y = wave.y
  const n = y.length
  const pos = Math.max(0, Math.min(1, at)) * (n - 1)
  const i = Math.min(n - 2, Math.floor(pos))
  const t = pos - i
  return y[i] + (y[i + 1] - y[i]) * t
}

const round = (n: number) => Math.round(n * 100) / 100
