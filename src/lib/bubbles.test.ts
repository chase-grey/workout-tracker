import { describe, expect, it } from 'vitest'
import {
  bubbleOpacity,
  createSwarm,
  popStrength,
  stepSwarm,
  terminalSpeed,
  type Bubble,
  type Pop,
  type Swarm,
  type Water,
} from './bubbles'

/** A rectangular tank: walls at 2 and 98, and a surface wherever it's put. */
const tank = (surface: number): Water => ({
  surfaceAt: () => surface,
  spanAt: () => [2, 98],
})

/** A vessel that pinches to nothing at the top, the way a triangle on its base doesn't. */
const funnel = (surface: number): Water => ({
  surfaceAt: () => surface,
  // Wide at the floor, closed by halfway up.
  spanAt: (y) => (y > 50 ? [50 - (y - 50) * 0.9, 50 + (y - 50) * 0.9] : null),
})

/** Run `seconds` the way the render loop does — a frame at a time — collecting pops. */
const run = (swarm: Swarm, water: Water, seconds: number, rng?: () => number): Pop[] => {
  const pops: Pop[] = []
  for (let t = 0; t < seconds; t += 1 / 60) pops.push(...stepSwarm(swarm, water, 1 / 60, rng))
  return pops
}

/** A swarm with no vents and the bubbles put where the test wants them. */
const place = (...bubbles: Partial<Bubble>[]): Swarm => {
  const swarm = createSwarm([])
  swarm.bubbles = bubbles.map((b, i) => ({
    id: i,
    x: 50,
    y: 90,
    r: 1.5,
    vx: 0,
    vy: 0,
    age: 1,
    merges: 1,
    phase: 0,
    sway: 0,
    swayRate: 0,
    ...b,
  }))
  swarm.nextId = swarm.bubbles.length
  return swarm
}

/** Volume, which is the thing a merge has to conserve. */
const volume = (b: Bubble) => b.r ** 3

/** Never sways, never scatters: draws that make a spawn as plain as possible. */
const still = () => 0.5

describe('a bubble on its own', () => {
  it('rises, accelerating off the floor', () => {
    const swarm = place({ y: 90, sway: 0 })
    const water = tank(10)
    run(swarm, water, 0.1)
    const early = swarm.bubbles[0].vy
    run(swarm, water, 0.2)
    expect(early).toBeLessThan(0)
    expect(swarm.bubbles[0].vy).toBeLessThan(early)
    expect(swarm.bubbles[0].y).toBeLessThan(90)
  })

  it('settles at a terminal speed rather than running away with it', () => {
    const swarm = place({ y: 95, r: 2, sway: 0 })
    run(swarm, tank(-2000), 6)
    expect(-swarm.bubbles[0].vy).toBeCloseTo(terminalSpeed(2), 1)
  })

  it('carries a big bubble up faster than a small one', () => {
    const swarm = place({ x: 20, y: 95, r: 0.9, sway: 0 }, { x: 80, y: 95, r: 2.3, sway: 0 })
    run(swarm, tank(-2000), 4)
    const [small, big] = swarm.bubbles
    expect(-big.vy).toBeGreaterThan(-small.vy)
    expect(big.y).toBeLessThan(small.y)
    expect(terminalSpeed(2.3)).toBeGreaterThan(terminalSpeed(0.9))
  })

  it('wanders sideways instead of holding a plumb line', () => {
    const swarm = place({ y: 95, sway: 14, swayRate: 2.5, phase: 0 })
    run(swarm, tank(-2000), 2)
    expect(Math.abs(swarm.bubbles[0].x - 50)).toBeGreaterThan(0.5)
  })

  it('fades in as it forms rather than appearing whole', () => {
    expect(bubbleOpacity({ ...place({}).bubbles[0], age: 0 })).toBe(0)
    expect(bubbleOpacity({ ...place({}).bubbles[0], age: 0.08 })).toBeGreaterThan(0)
    expect(bubbleOpacity({ ...place({}).bubbles[0], age: 1 })).toBe(1)
  })
})

describe('the walls', () => {
  it('turns a bubble back rather than letting it through the glass', () => {
    const swarm = place({ x: 90, y: 95, vx: 60, sway: 0 })
    run(swarm, tank(-2000), 1.5)
    const b = swarm.bubbles[0]
    expect(b.x + b.r).toBeLessThanOrEqual(98)
    // And it came off the wall with less than it arrived with.
    expect(b.vx).toBeLessThan(60)
  })

  it('rides the middle where the vessel is too narrow to bounce in', () => {
    // Just into the pinch, where there isn't room either side of it for a bounce.
    const swarm = place({ x: 49, y: 52.5, r: 2, sway: 0 })
    run(swarm, funnel(-2000), 0.05)
    expect(swarm.bubbles[0].x).toBeCloseTo(50, 5)
    expect(swarm.bubbles[0].vx).toBe(0)
  })

  it('drops a bubble the walls have closed on', () => {
    const swarm = place({ x: 50, y: 90, r: 2, sway: 0 })
    run(swarm, funnel(-2000), 6)
    expect(swarm.bubbles).toHaveLength(0)
  })
})

describe('merging', () => {
  it('leaves two bubbles that never touch alone', () => {
    const swarm = place({ x: 20, y: 95, r: 1.5, sway: 0 }, { x: 80, y: 95, r: 1.5, sway: 0 })
    run(swarm, tank(-2000), 2)
    expect(swarm.bubbles).toHaveLength(2)
  })

  it('joins a bubble that catches the one above it', () => {
    // The big one is faster, so it runs the small one down.
    const swarm = place({ x: 50, y: 80, r: 0.9, sway: 0 }, { x: 50, y: 95, r: 2.3, sway: 0 })
    run(swarm, tank(-2000), 4)
    expect(swarm.bubbles).toHaveLength(1)
    expect(swarm.bubbles[0].merges).toBe(2)
  })

  it('conserves volume and momentum, so the pair comes out of it slower', () => {
    const a = { x: 50, y: 90, r: 2.4, vy: -30, sway: 0 }
    const b = { x: 52, y: 88, r: 1.2, vy: -8, sway: 0 }
    const swarm = place(a, b)
    const before = volume(swarm.bubbles[0]) + volume(swarm.bubbles[1])
    const momentum =
      swarm.bubbles[0].vy * volume(swarm.bubbles[0]) + swarm.bubbles[1].vy * volume(swarm.bubbles[1])
    stepSwarm(swarm, tank(-2000), 1 / 60)

    expect(swarm.bubbles).toHaveLength(1)
    const merged = swarm.bubbles[0]
    expect(volume(merged)).toBeCloseTo(before, 6)
    // A step's worth of buoyancy and drag lands on it either side of the merge, so
    // the momentum is what it was to within a fraction of a percent rather than to
    // the last decimal.
    const after = merged.vy * volume(merged)
    expect(Math.abs(after - momentum)).toBeLessThan(Math.abs(momentum) * 0.01)
    // Slower than the big one was: it has the small one's sluggishness in it now.
    expect(merged.vy).toBeGreaterThan(-30)
    // And below the speed a bubble that size settles at, so it has ground to make up.
    expect(-merged.vy).toBeLessThan(terminalSpeed(merged.r))
  })

  it('keeps the bigger bubble, so the small one is the one swallowed', () => {
    const swarm = place({ x: 50, y: 90, r: 1, sway: 0 }, { x: 51, y: 90, r: 2.5, sway: 0 })
    stepSwarm(swarm, tank(-2000), 1 / 60)
    expect(swarm.bubbles).toHaveLength(1)
    expect(swarm.bubbles[0].id).toBe(1)
  })

  it('takes a chain a link at a time and ends up with one bubble', () => {
    const chain = Array.from({ length: 5 }, (_, i) => ({
      x: 50,
      y: 94 - i * 3,
      // Biggest at the bottom, so the fast one is the one with something to catch.
      r: 2.3 - i * 0.3,
      sway: 0,
    }))
    const swarm = place(...chain)
    const before = chain.reduce((sum, b) => sum + b.r ** 3, 0)
    run(swarm, tank(-2000), 4)
    expect(swarm.bubbles).toHaveLength(1)
    expect(swarm.bubbles[0].merges).toBe(5)
    expect(volume(swarm.bubbles[0])).toBeCloseTo(before, 6)
  })
})

describe('breaking the surface', () => {
  it('pops when its top reaches the water line, and is gone afterwards', () => {
    const swarm = place({ x: 40, y: 30, r: 1.5, vy: -20, sway: 0 })
    const pops = run(swarm, tank(20), 1)
    expect(pops).toHaveLength(1)
    expect(pops[0].x).toBeCloseTo(40, 0)
    expect(swarm.bubbles).toHaveLength(0)
  })

  it('splashes hardest for a big bubble that arrived fast', () => {
    const big = popStrength(3.2, 33)
    expect(big).toBeCloseTo(1, 5)
    expect(popStrength(1, 33)).toBeLessThan(big)
    expect(popStrength(3.2, 8)).toBeLessThan(big)
    // An ordinary little bubble only creases the line.
    expect(popStrength(0.9, 18)).toBeLessThan(0.2)
  })

  it('throws the wave in step with the splash, over a wider patch for a wider bubble', () => {
    const small = place({ y: 30, r: 0.9, vy: -18, sway: 0 })
    const large = place({ y: 30, r: 3.2, vy: -33, sway: 0 })
    const [thin] = run(small, tank(29), 0.5)
    const [fat] = run(large, tank(27), 0.5)
    expect(fat.lift).toBeGreaterThan(thin.lift * 3)
    expect(fat.bump).toBeGreaterThan(thin.bump)
  })

  it('never reports a downward arrival as a hard one', () => {
    const swarm = place({ y: 30, r: 3, vy: 20, sway: 0 })
    const [pop] = run(swarm, tank(35), 0.2)
    expect(pop.speed).toBeGreaterThanOrEqual(0)
    expect(pop.strength).toBeGreaterThanOrEqual(0)
  })
})

describe('the vents', () => {
  it('sends bubbles up from the floor', () => {
    const swarm = createSwarm([{ x: 50, y: 96 }], still)
    run(swarm, tank(10), 3, still)
    expect(swarm.bubbles.length).toBeGreaterThan(0)
    expect(swarm.bubbles.every((b) => b.y < 96)).toBe(true)
  })

  it('holds its beat but comes up empty in water too shallow to rise through', () => {
    const swarm = createSwarm([{ x: 50, y: 96 }], still)
    // A finger of water in the bottom of the vessel: nothing forms in it.
    run(swarm, tank(94), 6, still)
    expect(swarm.bubbles).toHaveLength(0)
  })

  it('keeps the water populated over a whole rest without letting it run away', () => {
    const swarm = createSwarm([{ x: 30, y: 96 }, { x: 70, y: 96 }])
    let most = 0
    for (let t = 0; t < 60; t += 1 / 60) {
      stepSwarm(swarm, tank(10), 1 / 60)
      most = Math.max(most, swarm.bubbles.length)
    }
    expect(most).toBeGreaterThan(1)
    expect(most).toBeLessThan(28)
  })
})

describe('an emptying vessel', () => {
  it('leaves nothing behind when the water runs out', () => {
    const swarm = createSwarm([{ x: 50, y: 96 }])
    // A rest running down: the surface falls from the top of the vessel to the floor.
    for (let i = 0; i <= 600; i++) {
      const surface = 2 + (96 - 2) * (i / 600)
      stepSwarm(swarm, tank(surface), 1 / 60)
    }
    expect(swarm.bubbles).toHaveLength(0)
  })

  it('pops the bubbles the falling surface catches rather than holding them under', () => {
    const swarm = place({ x: 50, y: 90, r: 2, vy: -5, sway: 0 })
    // The bubble is barely moving; it is the water line coming down to meet it.
    const pops = run(swarm, tank(87), 0.3)
    expect(pops).toHaveLength(1)
    expect(swarm.bubbles).toHaveLength(0)
  })
})

describe('stepSwarm', () => {
  it('advances at the same rate whatever the frame rate', () => {
    const sixty = place({ y: 95, r: 2, sway: 0 })
    const thirty = place({ y: 95, r: 2, sway: 0 })
    for (let i = 0; i < 60; i++) stepSwarm(sixty, tank(-2000), 1 / 60)
    for (let i = 0; i < 30; i++) stepSwarm(thirty, tank(-2000), 1 / 30)
    expect(thirty.bubbles[0].y).toBeCloseTo(sixty.bubbles[0].y, 5)
  })

  it('drops the backlog after a long gap rather than replaying it', () => {
    const swarm = place({ y: 95, r: 2, sway: 0 })
    stepSwarm(swarm, tank(-2000), 600)
    // A handful of steps at most, so a backgrounded tab doesn't stall a frame.
    expect(swarm.bubbles[0].y).toBeGreaterThan(90)
    expect(swarm.carry).toBe(0)
    expect(Number.isFinite(swarm.bubbles[0].vy)).toBe(true)
  })
})
