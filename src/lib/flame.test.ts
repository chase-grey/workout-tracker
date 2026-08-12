import { describe, expect, it } from 'vitest'
import { createFlame, flameLook, gutterFlame, stepFlame, type Flame, type FlameLook } from './flame'

/** A repeatable stand-in for Math.random, so a failure can be re-run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Never shoves the flame: the mid draw is zero noise, so only gutters disturb it. */
const calm = () => 0.5

const FRAME = 1 / 60

/** Run `seconds` of simulation the way the render loop does — a frame at a time. */
const run = (flame: Flame, seconds: number, rng: () => number) => {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) stepFlame(flame, FRAME, rng)
}

type Trace = { sway: number[]; stretch: number[]; glow: number[] }

/** The same run, keeping every channel's value at every frame. */
const trace = (flame: Flame, seconds: number, rng: () => number): Trace => {
  const out: Trace = { sway: [], stretch: [], glow: [] }
  for (let t = 0; t < seconds - 1e-9; t += FRAME) {
    stepFlame(flame, FRAME, rng)
    out.sway.push(flame.sway.x)
    out.stretch.push(flame.stretch.x)
    out.glow.push(flame.glow.x)
  }
  return out
}

const peak = (a: number[]) => Math.max(...a.map(Math.abs))
const spread = (a: number[]) => Math.max(...a) - Math.min(...a)
/** Mean distance from rest — the scale the series lives at. */
const mad = (a: number[]) => a.reduce((s, n) => s + Math.abs(n), 0) / a.length

/** How often the channel crosses its resting value: its beat, near enough. */
const crossings = (a: number[]) => {
  let n = 0
  for (let i = 1; i < a.length; i++) if (a[i - 1] < 0 !== a[i] < 0) n++
  return n
}

/** Pearson correlation. 1 means the two move as one; 0 means they don't. */
const correlation = (a: number[], b: number[]) => {
  const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
  const [ma, mb] = [mean(a), mean(b)]
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb)
    va += (a[i] - ma) ** 2
    vb += (b[i] - mb) ** 2
  }
  return cov / Math.sqrt(va * vb)
}

/** How different the series is from itself `lag` frames earlier. */
const selfDifference = (a: number[], lag: number) => {
  let sum = 0
  for (let i = lag; i < a.length; i++) sum += Math.abs(a[i] - a[i - lag])
  return sum / (a.length - lag)
}

const skewOf = (look: FlameLook) => Number(/skewX\((-?[\d.]+)deg\)/.exec(look.transform)![1])
const scaleOf = (look: FlameLook) => {
  const m = /scale\((-?[\d.]+), (-?[\d.]+)\)/.exec(look.transform)!
  return { x: Number(m[1]), y: Number(m[2]) }
}

/** All three channel limits, as declared in flame.ts. */
const LIMITS = { sway: 1.6, stretch: 1.6, glow: 1.8 }

describe('createFlame', () => {
  it('starts already burning rather than dead still', () => {
    const flame = createFlame(seeded(7))
    expect(peak([flame.sway.x, flame.stretch.x, flame.glow.x])).toBeGreaterThan(0)
    expect(flame.untilGutter).toBeGreaterThan(0)
  })

  it('does not light two candles the same way', () => {
    const a = createFlame(seeded(1))
    const b = createFlame(seeded(2))
    expect(a.sway.x).not.toBeCloseTo(b.sway.x, 6)
    expect(a.untilGutter).not.toBeCloseTo(b.untilGutter, 6)
  })
})

describe('stepFlame', () => {
  it('is repeatable for a given source of randomness', () => {
    const a = createFlame(seeded(5))
    const b = createFlame(seeded(5))
    run(a, 4, seeded(99))
    run(b, 4, seeded(99))
    expect(a.sway.x).toBe(b.sway.x)
    expect(a.glow.x).toBe(b.glow.x)
  })

  it('settles back to rest once nothing is shoving it', () => {
    const flame = createFlame(calm)
    flame.sway.x = 1
    flame.stretch.x = 1
    flame.glow.x = 1
    // Short of the first gutter (createFlame's mid draw puts that at 3.05s).
    run(flame, 2.5, calm)
    expect(Math.abs(flame.sway.x)).toBeLessThan(0.05)
    expect(Math.abs(flame.stretch.x)).toBeLessThan(0.05)
    expect(Math.abs(flame.glow.x)).toBeLessThan(0.05)
  })

  it('stays inside its limits however the randomness falls', () => {
    for (const rng of [() => 0, () => 1, seeded(11), seeded(12)]) {
      const flame = createFlame(rng)
      const seen = trace(flame, 20, rng)
      expect(peak(seen.sway)).toBeLessThanOrEqual(LIMITS.sway + 1e-9)
      expect(peak(seen.stretch)).toBeLessThanOrEqual(LIMITS.stretch + 1e-9)
      expect(peak(seen.glow)).toBeLessThanOrEqual(LIMITS.glow + 1e-9)
      expect(Number.isFinite(flame.sway.v)).toBe(true)
    }
  })

  it('drops the backlog rather than replaying a backgrounded tab', () => {
    const caughtUp = createFlame(calm)
    const huge = createFlame(calm)
    // 16 steps is the ceiling, so a 60s gap and a 0.14s one land the same place.
    run(caughtUp, 16 / 120, calm)
    stepFlame(huge, 60, calm)
    expect(huge.untilGutter).toBeCloseTo(caughtUp.untilGutter, 6)
    expect(huge.carry).toBe(0)
  })

  it('lets a draught catch the flame, then climbs back out of it', () => {
    const flame = createFlame(calm)
    const gap = flame.untilGutter
    const before = trace(flame, gap - 0.5, calm)
    // Nothing but a gutter can move it while the draws are all mid-range.
    expect(peak(before.sway)).toBeLessThan(1e-9)

    const after = trace(flame, 1.5, calm)
    expect(peak(after.sway)).toBeGreaterThan(0.2)
    // Rescheduled rather than firing again every step, so it has time to recover.
    expect(flame.untilGutter).toBeGreaterThan(0)
    expect(Math.abs(flame.sway.x)).toBeLessThan(0.15)
  })
})

describe('gutterFlame', () => {
  it('lurches the flame to the side it was pushed', () => {
    const right = createFlame(calm)
    const left = createFlame(calm)
    gutterFlame(right, 1)
    gutterFlame(left, -1)
    expect(right.sway.v).toBeGreaterThan(0)
    expect(left.sway.v).toBe(-right.sway.v)
  })

  it('ducks and dims the flame at the same time', () => {
    const flame = createFlame(calm)
    gutterFlame(flame, 1)
    expect(flame.stretch.v).toBeLessThan(0)
    expect(flame.glow.v).toBeLessThan(0)
  })
})

describe('the flicker itself', () => {
  // The point of the whole simulation: a keyframe loop stretched and brightened
  // the flame on one shared beat, which reads as a bob. These are the properties
  // that stop it reading that way.
  const flame = createFlame(seeded(2024))
  const seen = trace(flame, 30, seeded(2025))

  it('runs its channels on separate beats instead of one shared cycle', () => {
    // A single keyframe set would put these at 1. Anything near zero means the
    // flame can be tall and dim, or short and bright.
    expect(Math.abs(correlation(seen.stretch, seen.glow))).toBeLessThan(0.45)
    expect(Math.abs(correlation(seen.sway, seen.stretch))).toBeLessThan(0.45)
    expect(Math.abs(correlation(seen.sway, seen.glow))).toBeLessThan(0.45)
  })

  it('twinkles faster than it stretches, and stretches faster than it leans', () => {
    expect(crossings(seen.sway)).toBeGreaterThan(10)
    expect(crossings(seen.stretch)).toBeGreaterThan(crossings(seen.sway))
    expect(crossings(seen.glow)).toBeGreaterThan(crossings(seen.stretch))
  })

  it('never repeats itself, at any period', () => {
    // A loop would match itself exactly at its own period; this has to stay
    // roughly as different from its past as two unrelated moments would be.
    for (let lag = 15; lag <= 300; lag += 5) {
      expect(selfDifference(seen.sway, lag)).toBeGreaterThan(mad(seen.sway) * 0.8)
      expect(selfDifference(seen.glow, lag)).toBeGreaterThan(mad(seen.glow) * 0.8)
    }
  })

  it('moves sideways, not only up and down', () => {
    expect(spread(seen.sway)).toBeGreaterThan(0.5)
  })
})

describe('flameLook', () => {
  it('stands the flame straight up when it is at rest', () => {
    const flame = createFlame(calm)
    const look = flameLook(flame)
    expect(skewOf(look)).toBe(0)
    expect(scaleOf(look)).toEqual({ x: 1, y: 1 })
    expect(look.opacity).toBeCloseTo(0.86, 6)
  })

  it('leans the tip to whichever side the flame is swaying', () => {
    const flame = createFlame(calm)
    flame.sway.x = 0.8
    const right = skewOf(flameLook(flame))
    flame.sway.x = -0.8
    const left = skewOf(flameLook(flame))
    // The shear is drawn about the wick and CSS's y axis points down, so the tip
    // goes right on a negative skew. Mirrored either way, and never nothing.
    expect(right).toBeLessThan(0)
    expect(left).toBe(-right)
  })

  it('narrows the flame as it draws up', () => {
    const flame = createFlame(calm)
    flame.stretch.x = 1
    const tall = scaleOf(flameLook(flame))
    expect(tall.y).toBeGreaterThan(1)
    expect(tall.x).toBeLessThan(1)
  })

  it('keeps the flame lit however hard the glow swings', () => {
    const flame = createFlame(calm)
    for (const glow of [-5, -LIMITS.glow, 0, LIMITS.glow, 5]) {
      flame.glow.x = glow
      const { opacity } = flameLook(flame)
      expect(opacity).toBeGreaterThanOrEqual(0.5)
      expect(opacity).toBeLessThanOrEqual(1)
    }
  })

  it('brightens with the glow', () => {
    const flame = createFlame(calm)
    flame.glow.x = -0.5
    const dim = flameLook(flame).opacity
    flame.glow.x = 0.5
    expect(flameLook(flame).opacity).toBeGreaterThan(dim)
  })

  it('paints something different on essentially every frame', () => {
    const flame = createFlame(seeded(31))
    const rng = seeded(32)
    const frames = new Set<string>()
    for (let i = 0; i < 60; i++) {
      stepFlame(flame, FRAME, rng)
      const look = flameLook(flame)
      frames.add(`${look.transform}|${look.opacity}`)
    }
    expect(frames.size).toBeGreaterThan(50)
  })

  it('never emits a broken transform', () => {
    const flame = createFlame(seeded(41))
    const rng = seeded(42)
    for (let i = 0; i < 1200; i++) {
      stepFlame(flame, FRAME, rng)
      const look = flameLook(flame)
      expect(look.transform).not.toContain('NaN')
      expect(Number.isFinite(look.opacity)).toBe(true)
    }
  })
})
