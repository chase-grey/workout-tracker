import { describe, expect, it } from 'vitest'
import { createSnow, flakeLook, isAirborne, isSettled, stepSnow, type Snow } from './snow'

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

/** Run `seconds` of the globe the way the render loop does — a frame at a time. */
const run = (snow: Snow, seconds: number, floor = FLOOR, fraction = 1) => {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) stepSnow(snow, FRAME, floor, fraction)
}

/** How high the drift stands over a rest, matching the globe shape's own geometry. */
const DRIFT_MAX = 0.72
const floorAt = (fraction: number) => 1 - (1 - fraction) * DRIFT_MAX

/**
 * A whole rest, run at frame rate with the countdown falling the way the clock
 * does — which is the only way most of this file can be tested, since both a
 * flake's height and the end of its turn are read against the remaining fraction
 * rather than against `snow.t`.
 */
function restOf(seconds: number, snow: Snow, overrun = 0, each?: (fraction: number) => void) {
  for (let t = 0; t < seconds + overrun; t += FRAME) {
    const fraction = Math.max(0, (seconds - t) / seconds)
    stepSnow(snow, FRAME, floorAt(fraction), fraction)
    each?.(fraction)
  }
}

describe('createSnow', () => {
  it('starts the globe shaken rather than queued at the top', () => {
    const snow = createSnow(20, seeded(3))
    expect(snow.flakes).toHaveLength(20)
    const ys = snow.flakes.map((f) => f.y)
    // Spread down the whole glass on the very first frame: snow under the lid, snow
    // near the floor, and no two flakes sharing a height.
    expect(Math.min(...ys)).toBeLessThan(0.15)
    expect(Math.max(...ys)).toBeGreaterThan(0.8)
    expect(new Set(ys).size).toBe(20)
  })

  it('gives every flake its own swing and its own bob', () => {
    const snow = createSnow(24, seeded(4))
    for (const key of ['swayHz', 'swayPhase', 'bobHz', 'bobPhase', 'clearance'] as const) {
      expect(new Set(snow.flakes.map((f) => f[key])).size).toBeGreaterThan(20)
    }
  })

  it('starts every flake floating, with nothing yet on its way down', () => {
    const snow = createSnow(24, seeded(4))
    for (const flake of snow.flakes) {
      expect(flake.dropping).toBe(false)
      expect(flake.landedAt).toBe(null)
      expect(flake.speed).toBe(0)
      expect(flake.clearance).toBeGreaterThan(0)
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

  it('holds the first settling back from the very start of the rest', () => {
    // A flake called down on the first tick reads as snow that never got going.
    for (const seed of [40, 41, 42, 43]) {
      const snow = createSnow(34, seeded(seed))
      expect(snow.flakes.every((f) => isAirborne(f, 0.96))).toBe(true)
    }
  })

  it('lands them at a steady rate rather than in clumps', () => {
    // One per evenly-spaced slot, so consecutive settling times stay a slot apart
    // give or take — a plain random draw would leave gaps and pile-ups. The same
    // spread is what puts the flakes evenly down the glass, since a flake's height
    // is read off the very same number.
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
    expect(() => stepSnow(empty, FRAME, FLOOR, 1)).not.toThrow()
  })
})

describe('stepSnow', () => {
  it('keeps the same flakes in the glass from one end of the rest to the other', () => {
    // The whole point of dropping the recycle: a flake is never swapped out for a
    // fresh one, so the globe never shows a front of new snow with a hole behind it.
    const snow = createSnow(20, seeded(8))
    const before = snow.flakes.map((f) => f)
    restOf(60, snow)
    expect(snow.flakes).toHaveLength(20)
    snow.flakes.forEach((flake, i) => expect(flake).toBe(before[i]))
  })

  it('keeps the snow reaching from the lid down to the drift, all rest long', () => {
    // The regression this shape kept hitting: snow bunched at the top with an empty
    // band under it. There should always be a flake close over the drift, and the
    // snow above it should be spread rather than clumped.
    const snow = createSnow(34, seeded(9))
    restOf(90, snow, 0, (fraction) => {
      const flying = snow.flakes.filter((f) => f.landedAt === null && !f.dropping)
      if (flying.length < 4) return
      const floor = floorAt(fraction)
      const ys = flying.map((f) => f.y).sort((a, b) => a - b)
      // Snow right over the surface, and the largest empty band no wider than a
      // couple of flakes' worth of spacing.
      expect(floor - ys[ys.length - 1]).toBeLessThan(0.2)
      const column = floor - ys[0]
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeLessThan(Math.max(0.12, (2.6 * column) / ys.length))
      }
    })
  })

  it('sinks a flake toward the drift as its turn comes round', () => {
    const snow = createSnow(24, seeded(10))
    const flake = snow.flakes[12]
    const heights: number[] = []
    for (const fraction of [1, 0.8, 0.6, 0.5]) {
      // Long enough at each step for the ease onto the countdown's line to finish.
      run(snow, 6, floorAt(fraction), fraction)
      heights.push(flake.y)
    }
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThan(heights[i - 1])
  })

  it('floats a flake about its place rather than pinning it there', () => {
    // A globe of specks holding still reads as dust on the screen, so the sink
    // carries a bob that is visible over a second or two.
    const snow = createSnow(8, seeded(11))
    const seen = snow.flakes.map(() => [] as number[])
    for (let i = 0; i < 12; i++) {
      run(snow, 1)
      snow.flakes.forEach((f, j) => seen[j].push(f.y))
    }
    for (const ys of seen) expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.01)
  })

  it('is repeatable for a given source of randomness', () => {
    const a = createSnow(14, seeded(12))
    const b = createSnow(14, seeded(12))
    run(a, 12)
    run(b, 12)
    expect(a.flakes.map((f) => f.y)).toEqual(b.flakes.map((f) => f.y))
    expect(a.t).toBe(b.t)
  })

  it('keeps every flake above the drift however high it has risen', () => {
    const snow = createSnow(16, seeded(14))
    // A drift climbing through the whole globe, as it does over a rest.
    for (let i = 0; i <= 400; i++) {
      const floor = 1 - i / 400
      stepSnow(snow, FRAME, floor, 1)
      for (const flake of snow.flakes) expect(flake.y).toBeLessThanOrEqual(floor)
    }
  })

  it('eases onto the countdown rather than stepping with it', () => {
    // The remaining fraction arrives a few times a second, and a height read
    // straight off it would jump each time. One frame closes only part of the gap.
    const snow = createSnow(12, seeded(15))
    const flake = snow.flakes[6]
    const before = flake.y
    stepSnow(snow, FRAME, floorAt(0.4), 0.4)
    const settled = createSnow(12, seeded(15))
    run(settled, 6, floorAt(0.4), 0.4)
    expect(Math.abs(flake.y - before)).toBeLessThan(Math.abs(settled.flakes[6].y - before) / 2)
  })

  it('drops the backlog rather than teleporting a backgrounded tab to the floor', () => {
    const caughtUp = createSnow(8, seeded(18))
    const huge = createSnow(8, seeded(18))
    stepSnow(caughtUp, 1 / 20, FLOOR, 1)
    stepSnow(huge, 90, FLOOR, 1)
    expect(huge.flakes.map((f) => f.y)).toEqual(caughtUp.flakes.map((f) => f.y))
    expect(huge.t).toBe(caughtUp.t)
  })

  it('ignores time running backwards', () => {
    const snow = createSnow(5, seeded(20))
    const before = snow.flakes.map((f) => f.y)
    stepSnow(snow, -3, 1, 1)
    expect(snow.flakes.map((f) => f.y)).toEqual(before)
    expect(snow.t).toBe(0)
  })

  it('lifts a flake that was shaken below the drift back into the air', () => {
    // createSnow places the flakes against an empty glass, so a globe stepped with a
    // drift already up starts some of them buried. The first step digs them out.
    const snow = createSnow(20, seeded(22))
    expect(snow.flakes.some((f) => f.y > 0.5)).toBe(true)
    stepSnow(snow, FRAME, 0.5, 1)
    for (const flake of snow.flakes) expect(flake.y).toBeLessThanOrEqual(0.5)
  })
})

describe('settling', () => {
  it('brings a called-down flake to the drift and leaves it there', () => {
    const snow = createSnow(12, seeded(31))
    // Rest over: every flake has been called down.
    run(snow, 4, FLOOR, 0)
    for (const flake of snow.flakes) {
      expect(flake.dropping).toBe(true)
      expect(flake.landedAt).not.toBe(null)
      // On the surface itself — not a fraction of the way down the glass.
      expect(flake.y).toBe(FLOOR)
    }
  })

  it('never lets a flake leave the air anywhere but the drift', () => {
    // The point of the whole settling mechanism: snow that disappears halfway up
    // says a dot went away, where snow that lands says the rest is running out.
    const snow = createSnow(30, seeded(33))
    restOf(45, snow, 0, (fraction) => {
      const floor = floorAt(fraction)
      for (const flake of snow.flakes) {
        if (flake.landedAt === null) continue
        // A landed flake sits on the surface it landed on, which is at most the
        // rest of the countdown's worth of rise below the one in force now.
        expect(flake.y).toBeGreaterThanOrEqual(floor - 1e-9)
        expect(flakeLook(flake, flake.landedAt).alpha).toBeGreaterThan(0)
      }
    })
  })

  it('does not float a flake again once the countdown has called it down', () => {
    const snow = createSnow(8, seeded(35))
    run(snow, 6, FLOOR, 0)
    // Every one is on the drift; none has been let back up into the air.
    expect(snow.flakes.every((f) => f.y === FLOOR)).toBe(true)
    run(snow, 4, FLOOR, 1)
    expect(snow.flakes.every((f) => f.y === FLOOR)).toBe(true)
  })

  it('holds a landed flake still while it melts in', () => {
    const snow = createSnow(6, seeded(37))
    run(snow, 3, FLOOR, 0)
    const placed = snow.flakes.map((f) => flakeLook(f, snow.t))
    run(snow, 1, FLOOR, 0)
    snow.flakes.forEach((flake, i) => {
      const now = flakeLook(flake, snow.t)
      expect(now.x).toBeCloseTo(placed[i].x, 12)
      expect(now.y).toBe(placed[i].y)
    })
  })

  it('leaves the globe empty and still a beat after the clock runs out', () => {
    const snow = createSnow(34, seeded(40))
    restOf(90, snow, 3)
    expect(snow.flakes.every((f) => isSettled(f, snow.t))).toBe(true)
    expect(snow.flakes.every((f) => flakeLook(f, snow.t).alpha === 0)).toBe(true)
  })

  it('keeps snow in the air for the whole of the rest before that', () => {
    // Not just at the end: the globe should still be snowing with a few seconds to
    // go, or the last stretch of a rest looks like a rest that has already ended.
    const snow = createSnow(34, seeded(42))
    restOf(90, snow)
    expect(snow.flakes.some((f) => !isSettled(f, snow.t))).toBe(true)
  })

  it('empties the air at about the rate the clock empties', () => {
    const count = 34
    const snow = createSnow(count, seeded(44))
    restOf(60, snow, 0, (fraction) => {
      const flying = snow.flakes.filter((f) => !isSettled(f, snow.t)).length
      // Within a couple of flakes of the countdown, plus the second or so of fall
      // and melt each one takes on its way out.
      expect(flying).toBeGreaterThanOrEqual(fraction * count - 2)
      expect(flying).toBeLessThanOrEqual(fraction * count + 4)
    })
  })
})

describe('isAirborne', () => {
  it('keeps the count in the air tracking the rest still to come', () => {
    const count = 40
    const snow = createSnow(count, seeded(22))
    for (const fraction of [1, 0.75, 0.5, 0.25, 0]) {
      const flying = snow.flakes.filter((f) => isAirborne(f, fraction)).length
      expect(Math.abs(flying - fraction * count)).toBeLessThanOrEqual(3)
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

  it('paints a flake in the air solid and at full size', () => {
    const [flake] = createSnow(1, seeded(46)).flakes
    const look = flakeLook(flake, 2)
    expect(look.alpha).toBeCloseTo(0.85, 9)
    expect(look.scale).toBe(1)
  })

  it('melts a landed flake into the drift rather than blinking it out', () => {
    const [flake] = createSnow(1, seeded(47)).flakes
    const landed = { ...flake, dropping: true, landedAt: 10 }
    let last = Infinity
    for (let t = 10; t <= 10.5; t += 0.05) {
      const { alpha, scale } = flakeLook(landed, t)
      expect(alpha).toBeLessThanOrEqual(last)
      expect(scale).toBeLessThanOrEqual(1)
      expect(scale).toBeGreaterThan(0)
      last = alpha
    }
    expect(flakeLook(landed, 10.5).alpha).toBe(0)
    // And stays gone however long the rest overruns.
    expect(flakeLook(landed, 400).alpha).toBe(0)
  })

  it('never paints a broken position', () => {
    const snow = createSnow(10, seeded(29))
    for (let i = 0; i < 2000; i++) {
      stepSnow(snow, FRAME, 0.8, 0.5)
      for (const flake of snow.flakes) {
        const { x, y, alpha, scale } = flakeLook(flake, snow.t)
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        expect(Number.isFinite(alpha)).toBe(true)
        expect(Number.isFinite(scale)).toBe(true)
      }
    }
  })
})

describe('isSettled', () => {
  it('is false for a flake still in the air, however long the globe has run', () => {
    const snow = createSnow(10, seeded(48))
    run(snow, 20)
    expect(snow.flakes.some((f) => isSettled(f, snow.t))).toBe(false)
  })

  it('turns true only once the flake has finished melting in', () => {
    const [flake] = createSnow(1, seeded(50)).flakes
    const landed = { ...flake, dropping: true, landedAt: 3 }
    expect(isSettled(landed, 3)).toBe(false)
    expect(isSettled(landed, 3.3)).toBe(false)
    expect(isSettled(landed, 3.6)).toBe(true)
  })
})
