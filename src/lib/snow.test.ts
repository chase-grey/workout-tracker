import { describe, expect, it } from 'vitest'
import { createSnow, flakeLook, isAirborne, stepSnow, type Snow } from './snow'

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

const FRAME = 1 / 60

/** The drift's surface for most of these: a globe a third full. */
const FLOOR = 0.7

/** Run `seconds` of snowfall the way the render loop does — a frame at a time. */
const run = (snow: Snow, seconds: number, rng: () => number, floor = FLOOR) => {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) stepSnow(snow, FRAME, floor, rng)
}

describe('createSnow', () => {
  it('makes the globe already snowing rather than queued at the top', () => {
    const snow = createSnow(20, seeded(3))
    expect(snow.flakes).toHaveLength(20)
    // Scattered down the height, not all sitting at zero.
    expect(Math.max(...snow.flakes.map((f) => f.y))).toBeGreaterThan(0.5)
    expect(new Set(snow.flakes.map((f) => f.y)).size).toBe(20)
  })

  it('gives every flake its own speed and its own swing', () => {
    const snow = createSnow(24, seeded(4))
    for (const key of ['fall', 'swayHz', 'swayPhase'] as const) {
      expect(new Set(snow.flakes.map((f) => f[key])).size).toBeGreaterThan(20)
    }
  })

  it('spreads the settling times across the whole rest', () => {
    const snow = createSnow(30, seeded(5))
    const times = snow.flakes.map((f) => f.settleAt)
    expect(Math.min(...times)).toBeLessThan(0.1)
    expect(Math.max(...times)).toBeGreaterThan(0.9)
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThan(1)
    }
  })

  it('lands them at a steady rate rather than in clumps', () => {
    // One per evenly-spaced slot, so consecutive settling times stay a slot apart
    // give or take — a plain random draw would leave gaps and pile-ups.
    const count = 40
    const times = createSnow(count, seeded(6))
      .flakes.map((f) => f.settleAt)
      .sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBeLessThan(2.5 / count)
    }
  })

  it('shakes two globes differently', () => {
    const a = createSnow(12, seeded(1))
    const b = createSnow(12, seeded(2))
    expect(a.flakes[0].y).not.toBeCloseTo(b.flakes[0].y, 6)
  })

  it('copes with being asked for no snow at all', () => {
    expect(createSnow(0, seeded(7)).flakes).toHaveLength(0)
    expect(createSnow(-4, seeded(7)).flakes).toHaveLength(0)
    // And stepping an empty globe is not an error.
    const empty = createSnow(0, seeded(7))
    expect(() => stepSnow(empty, FRAME, FLOOR, seeded(7))).not.toThrow()
  })
})

describe('stepSnow', () => {
  it('carries the flakes downward', () => {
    const snow = createSnow(10, seeded(8))
    const before = snow.flakes.map((f) => f.y)
    stepSnow(snow, 0.5, 1.5, seeded(9))
    snow.flakes.forEach((f, i) => expect(f.y).toBeGreaterThan(before[i]))
  })

  it('is repeatable for a given source of randomness', () => {
    const a = createSnow(14, seeded(10))
    const b = createSnow(14, seeded(10))
    run(a, 12, seeded(11))
    run(b, 12, seeded(11))
    expect(a.flakes.map((f) => f.y)).toEqual(b.flakes.map((f) => f.y))
    expect(a.t).toBe(b.t)
  })

  it('starts a flake again above the top once it reaches the drift', () => {
    const snow = createSnow(6, seeded(12))
    run(snow, 30, seeded(13))
    for (const flake of snow.flakes) {
      expect(flake.y).toBeLessThanOrEqual(FLOOR)
      expect(flake.y).toBeGreaterThanOrEqual(-flake.size)
    }
  })

  it('keeps every flake above the drift however high it has risen', () => {
    const snow = createSnow(16, seeded(14))
    // A drift climbing through the whole globe, as it does over a rest.
    for (let i = 0; i <= 400; i++) {
      const floor = 1 - i / 400
      stepSnow(snow, FRAME, floor, seeded(15 + i))
      for (const flake of snow.flakes) expect(flake.y).toBeLessThanOrEqual(floor)
    }
  })

  it('does not hand a recycled flake the same fall twice', () => {
    const snow = createSnow(1, seeded(16))
    const first = { ...snow.flakes[0] }
    run(snow, 40, seeded(17))
    const now = snow.flakes[0]
    expect(now.fall).not.toBeCloseTo(first.fall, 9)
    // Its share of the countdown is the one thing that must survive the recycle.
    expect(now.settleAt).toBe(first.settleAt)
  })

  it('drops the backlog rather than teleporting a backgrounded tab to the floor', () => {
    const caughtUp = createSnow(8, seeded(18))
    const huge = createSnow(8, seeded(18))
    stepSnow(caughtUp, 1 / 20, 1.5, seeded(19))
    stepSnow(huge, 90, 1.5, seeded(19))
    expect(huge.flakes.map((f) => f.y)).toEqual(caughtUp.flakes.map((f) => f.y))
    expect(huge.t).toBe(caughtUp.t)
  })

  it('ignores time running backwards', () => {
    const snow = createSnow(5, seeded(20))
    const before = snow.flakes.map((f) => f.y)
    // A drift below every flake, so nothing recycles and the step is all that's
    // under test.
    stepSnow(snow, -3, 1.5, seeded(21))
    expect(snow.flakes.map((f) => f.y)).toEqual(before)
    expect(snow.t).toBe(0)
  })

  it('lifts a flake that was shaken below the drift up to the top', () => {
    // createSnow scatters flakes down the whole globe and knows nothing about how
    // high the drift is, so some of them start buried. The first step is what digs
    // them out.
    const snow = createSnow(20, seeded(22))
    expect(snow.flakes.some((f) => f.y > 0.5)).toBe(true)
    stepSnow(snow, 1 / 60, 0.5, seeded(23))
    for (const flake of snow.flakes) expect(flake.y).toBeLessThanOrEqual(0.5)
  })
})

describe('isAirborne', () => {
  it('keeps the count in the air tracking the rest still to come', () => {
    const count = 40
    const snow = createSnow(count, seeded(22))
    for (const fraction of [1, 0.75, 0.5, 0.25, 0]) {
      const flying = snow.flakes.filter((f) => isAirborne(f, fraction)).length
      expect(Math.abs(flying - fraction * count)).toBeLessThanOrEqual(2)
    }
  })

  it('empties the air entirely when the rest is up, and fills it at the start', () => {
    const snow = createSnow(20, seeded(23))
    expect(snow.flakes.every((f) => isAirborne(f, 1))).toBe(true)
    expect(snow.flakes.some((f) => isAirborne(f, 0))).toBe(false)
  })

  it('settles flakes one way only as the rest runs down', () => {
    const snow = createSnow(24, seeded(24))
    let last = Infinity
    for (let f = 1; f >= 0; f -= 0.05) {
      const flying = snow.flakes.filter((flake) => isAirborne(flake, f)).length
      expect(flying).toBeLessThanOrEqual(last)
      last = flying
    }
  })
})

describe('flakeLook', () => {
  it('never puts a flake outside the glass, at any height or any point of its swing', () => {
    // The property the whole ±1 lateral scheme exists for: the globe is a circle
    // and is clipped to one, so a flake positioned across the full width would
    // wink in and out against the curve near the top and bottom.
    const snow = createSnow(30, seeded(25))
    for (const flake of snow.flakes) {
      for (let y = 0; y <= 1.0001; y += 0.02) {
        for (let t = 0; t < 20; t += 0.31) {
          const { x } = flakeLook({ ...flake, y }, t)
          const fromCentre = Math.hypot(x - 0.5, y - 0.5)
          expect(fromCentre).toBeLessThanOrEqual(0.5 + 1e-9)
        }
      }
    }
  })

  it('brings a flake to the middle where the glass has no room', () => {
    const [flake] = createSnow(1, seeded(26)).flakes
    expect(flakeLook({ ...flake, y: 0 }, 0).x).toBeCloseTo(0.5, 9)
    expect(flakeLook({ ...flake, y: 1 }, 0).x).toBeCloseTo(0.5, 9)
  })

  it('swings the flake side to side as the clock runs', () => {
    const [flake] = createSnow(1, seeded(27)).flakes
    const seen = new Set<number>()
    for (let t = 0; t < 12; t += 0.25) seen.add(flakeLook({ ...flake, y: 0.5 }, t).x)
    expect(seen.size).toBeGreaterThan(40)
    const xs = [...seen]
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.01)
  })

  it('reports the height it was handed, untouched', () => {
    const [flake] = createSnow(1, seeded(28)).flakes
    expect(flakeLook({ ...flake, y: 0.42 }, 3).y).toBe(0.42)
  })

  it('never paints a broken position', () => {
    const snow = createSnow(10, seeded(29))
    const rng = seeded(30)
    for (let i = 0; i < 2000; i++) {
      stepSnow(snow, FRAME, 0.8, rng)
      for (const flake of snow.flakes) {
        const { x, y } = flakeLook(flake, snow.t)
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
      }
    }
  })
})
