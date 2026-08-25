import { describe, expect, it } from 'vitest'
import {
  createDripper,
  crownsPath,
  dripTuning,
  dropsPath,
  specksPath,
  stepDrip,
  type Dripper,
  type Spout,
} from './drip'
import { BOXED_GLASS, TALL_GLASS } from './waterclock'

/** No wander at all: every draw lands in the middle of its range. */
const steady = () => 0.5

/** Where the water is in a chamber with nothing in it yet. */
const FLOOR = 90

const FRAME = 1 / 60

const spout = (over: Partial<Spout> = {}): Spout => ({
  x: 50,
  y: 50,
  surfaceAt: () => FLOOR,
  flowing: true,
  ...over,
})

const boxed = () => createDripper(dripTuning(BOXED_GLASS), steady)

/** Run `seconds` of drip the way the render loop does — a frame at a time. */
const run = (d: Dripper, seconds: number, over: Partial<Spout> = {}) => {
  const splashes: number[] = []
  const at = spout(over)
  for (let t = 0; t < seconds; t += FRAME) {
    stepDrip(d, FRAME, at, (x) => splashes.push(x))
  }
  return splashes
}

/** Drop one drop from just above the water and land it, in a single frame. */
const landOne = (d: Dripper, at: Spout = spout({ flowing: false })) => {
  d.drops.push({ x: 50, y: at.surfaceAt(50) - 0.01, vx: 0, vy: 1 })
  stepDrip(d, FRAME, at, () => {})
}

describe('dripTuning', () => {
  it('scales the fall with the glass, so both glasses drip on the same beat', () => {
    const tall = dripTuning(TALL_GLASS)
    const box = dripTuning(BOXED_GLASS)
    expect(tall.gap).toBe(box.gap)
    // A taller glass falls further, so it has to pull harder to take the same time.
    expect(tall.gravity / box.gravity).toBeCloseTo(TALL_GLASS.height / BOXED_GLASS.height)
    expect(tall.throwSpeed / box.throwSpeed).toBeCloseTo(TALL_GLASS.height / BOXED_GLASS.height)
  })

  it('keeps a drop small enough to fit through the neck', () => {
    for (const glass of [TALL_GLASS, BOXED_GLASS]) {
      expect(dripTuning(glass).dropR).toBeLessThan(glass.waistHalf)
    }
  })
})

describe('stepDrip', () => {
  it('drips on a steady beat', () => {
    const splashes = run(boxed(), 10)
    // One every 0.9 seconds over ten of them, give or take the one in the air.
    expect(splashes.length).toBeGreaterThanOrEqual(9)
    expect(splashes.length).toBeLessThanOrEqual(11)
  })

  it('throws the same fan at every impact', () => {
    const d = boxed()
    const fan = () => {
      d.specks = []
      landOne(d)
      return d.specks.map((s) => `${Math.round(s.vx * 100)}:${Math.round(s.vy * 100)}`).join()
    }
    const first = fan()
    expect(d.specks).toHaveLength(5)
    // Splash after splash, the spray is the same: the beat is the shape, not any
    // one impact in it.
    expect(fan()).toBe(first)
    expect(fan()).toBe(first)
  })

  it('leaves the impact symmetrically', () => {
    const d = boxed()
    landOne(d)
    const sideways = d.specks.reduce((sum, s) => sum + s.vx, 0)
    expect(Math.abs(sideways)).toBeLessThan(0.01)
    for (const speck of d.specks) expect(speck.vy).toBeLessThan(0)
  })

  it('takes its spray back and closes over the crown', () => {
    const d = boxed()
    landOne(d)
    expect(d.specks).toHaveLength(5)
    expect(d.crowns).toHaveLength(1)
    run(d, 1.2, { flowing: false })
    expect(d.specks).toHaveLength(0)
    expect(d.crowns).toHaveLength(0)
  })

  it('never draws a drop below the water', () => {
    const d = boxed()
    const at = spout()
    let deepest = 0
    for (let t = 0; t < 4; t += FRAME) {
      stepDrip(d, FRAME, at, () => {})
      for (const drop of d.drops) deepest = Math.max(deepest, drop.y)
    }
    // It reaches the surface, and is gone the frame it does.
    expect(deepest).toBeGreaterThan(FLOOR - 4)
    expect(deepest).toBeLessThan(FLOOR)
  })

  it('lands on the wave rather than the flat line under it', () => {
    const d = boxed()
    const crest = FLOOR - 6
    const at = spout({ surfaceAt: () => crest })
    for (let i = 0; i < 200 && d.specks.length === 0; i++) stepDrip(d, FRAME, at, () => {})
    expect(d.specks).toHaveLength(5)
    // The spray leaves from the crest the drop hit, well above the flat line.
    for (const speck of d.specks) expect(speck.y).toBeLessThan(crest + 1)
  })

  it('falls under the glass’s own gravity, and less far as the chamber fills', () => {
    const fall = (surfaceY: number) => {
      const d = boxed()
      const at = spout({ surfaceAt: () => surfaceY })
      let born = -1
      let landed = -1
      let t = 0
      for (let i = 0; i < 300; i++) {
        stepDrip(d, FRAME, at, () => {
          if (landed < 0) landed = t
        })
        if (born < 0 && d.drops.length > 0) born = t
        t += FRAME
      }
      return landed - born
    }
    const g = dripTuning(BOXED_GLASS).gravity
    expect(fall(FLOOR)).toBeCloseTo(Math.sqrt((2 * (FLOOR - 50)) / g), 1)
    // Water already in the chamber is water the next drop doesn't have to fall.
    expect(fall(55)).toBeLessThan(fall(FLOOR) / 2)
  })

  it('stops dripping once the chamber above is dry', () => {
    const d = boxed()
    expect(run(d, 6, { flowing: false })).toHaveLength(0)
    expect(d.drops).toHaveLength(0)
  })

  it('holds the beat rather than catching up on it', () => {
    const d = boxed()
    run(d, 6, { flowing: false })
    // Six seconds of dry glass owes six seconds of drops, and none of them arrive.
    expect(run(d, 0.5)).toHaveLength(0)
    expect(d.drops.length).toBeLessThanOrEqual(1)
  })

  it('drops a backgrounded tab’s backlog instead of replaying it', () => {
    const d = boxed()
    let splashes = 0
    stepDrip(d, 30, spout(), () => splashes++)
    stepDrip(d, 30, spout(), () => splashes++)
    expect(d.drops.length).toBeLessThanOrEqual(3)
    expect(splashes).toBeLessThanOrEqual(3)
  })

  it('sends the drops down off the middle, so the ripples never stand still', () => {
    const splashes = run(createDripper(dripTuning(BOXED_GLASS)), 12)
    expect(splashes.length).toBeGreaterThan(5)
    expect(new Set(splashes).size).toBeGreaterThan(1)
    // But only just off it: this is a wobble, not a scatter.
    for (const x of splashes) expect(Math.abs(x - 50)).toBeLessThan(BOXED_GLASS.waistHalf * 2)
  })
})

describe('the paths', () => {
  const moves = (path: string) => path.match(/M /g)?.length ?? 0

  it('draw nothing when nothing is in the air', () => {
    const d = boxed()
    expect(dropsPath(d)).toBe('')
    expect(specksPath(d)).toBe('')
    expect(crownsPath(d, () => FLOOR)).toBe('')
  })

  it('draw one shape per drop, speck and crown', () => {
    const d = boxed()
    run(d, 1.1)
    landOne(d)
    expect(moves(dropsPath(d))).toBe(d.drops.length)
    expect(moves(specksPath(d))).toBe(d.specks.length)
    expect(moves(crownsPath(d, () => FLOOR))).toBe(d.crowns.length)
  })

  it('stretches a falling drop along its fall and squashes it across', () => {
    const d = boxed()
    d.drops.push({ x: 50, y: 60, vx: 0, vy: 0 })
    const still = dropsPath(d)
    d.drops[0].vy = d.tuning.gravity
    const falling = dropsPath(d)
    const radii = (path: string) => path.split(' a ')[1].split(' ').slice(0, 2).map(Number)
    const [rxStill, ryStill] = radii(still)
    const [rxFast, ryFast] = radii(falling)
    expect(ryFast).toBeGreaterThan(ryStill)
    expect(rxFast).toBeLessThan(rxStill)
    // Stretched by as much as it is squashed, so the drop keeps its own volume.
    expect(rxFast * ryFast).toBeCloseTo(rxStill * ryStill, 1)
  })

  it('stands the crown on the water it came out of', () => {
    const d = boxed()
    d.crowns.push({ x: 40, age: 0.2 })
    const path = crownsPath(d, (x) => (x < 50 ? 70 : 20))
    const [, , y0, , , cy, , y1] = path.split(' ').map(Number)
    // Both feet on the surface at its own x, and the dome standing over them.
    expect(y0).toBe(70)
    expect(y1).toBe(70)
    expect(cy).toBeLessThan(70)
  })

  it('flattens the crown back into the surface rather than fading it', () => {
    const d = boxed()
    const apex = (age: number) => {
      d.crowns = [{ x: 50, age }]
      const [, , , , , cy] = crownsPath(d, () => FLOOR)
        .split(' ')
        .map(Number)
      return FLOOR - cy
    }
    expect(apex(0.2)).toBeGreaterThan(apex(0.02))
    expect(apex(0.41)).toBeLessThan(apex(0.2))
  })
})
