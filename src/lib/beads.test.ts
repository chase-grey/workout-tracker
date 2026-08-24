import { describe, expect, it } from 'vitest'
import {
  BEAD_COUNT,
  BEAD_R,
  bodyR,
  createCoalescence,
  createFission,
  createGathering,
  createShedding,
  fieldAt,
  gapBetween,
  type BeadField,
  type BeadPlan,
  type LiveBead,
  type LiveBody,
} from './beads'

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

/** Fractions across a whole rest, fine enough to catch a drop crossing another one. */
const SWEEP = Array.from({ length: 601 }, (_, i) => 1 - i / 600)

/** Seeds enough to say a layout holds in general and not just for one arrangement. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)

const offCentre = (at: { x: number; y: number }) => Math.hypot(at.x - 0.5, at.y - 0.5)

/** The body holding the most, which in three of the four runs is the reading. */
const biggest = (field: BeadField): LiveBody | undefined =>
  field.bodies.reduce<LiveBody | undefined>(
    (most, body) => (most && most.mass >= body.mass ? most : body),
    undefined,
  )

/**
 * The closest two drops on the pane come to each other, surface to surface, ignoring pairs
 * that are *meant* to be in contact: two drops of one body, and the pair whose glass an
 * event is closing.
 */
function tightestGap(beads: LiveBead[]): number {
  let least = Infinity
  for (let i = 0; i < beads.length; i++) {
    for (let j = i + 1; j < beads.length; j++) {
      const one = beads[i]
      const other = beads[j]
      if (one.body === other.body) continue
      if (one.mate === other.body || other.mate === one.body) continue
      least = Math.min(least, gapBetween(one, other))
    }
  }
  return least
}

/** Where the liquid on the pane sits, which is the thing no join is allowed to move. */
const centreOfMass = (beads: LiveBead[]) => ({
  x: beads.reduce((sum, bead) => sum + bead.x, 0) / beads.length,
  y: beads.reduce((sum, bead) => sum + bead.y, 0) / beads.length,
})

/** How the count reads across a whole rest, as the sequence of distinct values it takes. */
const runOf = (plan: BeadPlan, count: (field: BeadField) => number) => {
  const seen: number[] = []
  for (const left of SWEEP) {
    const now = count(fieldAt(plan, left))
    if (seen[seen.length - 1] !== now) seen.push(now)
  }
  return seen
}

/**
 * Every drop's speed across the rest, sampled finely: what a jump in here would mean is a
 * drop changing pace in a step, which is the one thing none of these runs may do.
 */
function speedJump(plan: BeadPlan, steps = 2400): number {
  let worst = 0
  let previous: Map<number, LiveBead> | null = null
  const speeds = new Map<number, number>()
  for (let i = 0; i <= steps; i++) {
    const { beads } = fieldAt(plan, 1 - i / steps)
    const now = new Map(beads.map((bead) => [bead.id, bead]))
    if (previous) {
      for (const [id, bead] of now) {
        const was = previous.get(id)
        if (!was) continue
        const speed = Math.hypot(bead.x - was.x, bead.y - was.y) * steps
        const before = speeds.get(id)
        if (before !== undefined) worst = Math.max(worst, Math.abs(speed - before))
        speeds.set(id, speed)
      }
    }
    previous = now
  }
  return worst
}

/**
 * The share of the pane the liquid covers, on a grid, counting the reach of the goo filter
 * as covered — so a neck between two drops counts the same way the screen draws it.
 */
function coveredGlass(plan: BeadPlan, left: number, grid = 100, reach = 0.02): number {
  const { beads } = fieldAt(plan, left)
  const span = (BEAD_R + reach) ** 2
  let hit = 0
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const x = (i + 0.5) / grid
      const y = (j + 0.5) / grid
      if (beads.some((bead) => (bead.x - x) ** 2 + (bead.y - y) ** 2 <= span)) hit++
    }
  }
  return hit / (grid * grid)
}

/**
 * The most the silhouette changes between two neighbouring frames, as a share of the pane.
 *
 * This is the whole complaint the four shapes were rebuilt to answer, stated as a number.
 * A run that swaps a touching pair for a single wider body loses a chunk of covered glass in
 * one frame, however prettily it is animated afterwards; a run where the pair simply carries
 * on into itself cannot, because every drop is where it was a moment ago.
 */
function biggestFlicker(plan: BeadPlan, steps = 200): number {
  let worst = 0
  let previous = -1
  for (let i = 0; i <= steps; i++) {
    const now = coveredGlass(plan, 1 - i / steps)
    if (previous >= 0) worst = Math.max(worst, Math.abs(now - previous))
    previous = now
  }
  return worst
}

describe('createCoalescence', () => {
  it('holds seven drops of one size for the whole rest', () => {
    const plan = createCoalescence(seeded(1))
    expect(plan.count).toBe(BEAD_COUNT)
    expect(plan.beads).toHaveLength(BEAD_COUNT)
    // Nothing is ever created or destroyed, so nothing has to pop in or out to say so.
    for (const left of SWEEP) expect(fieldAt(plan, left).beads).toHaveLength(BEAD_COUNT)
  })

  it('drops the count by one at each sixth, from seven bodies to one', () => {
    const plan = createCoalescence(seeded(2))
    // Seven readings, each once, in order: no count is skipped and none comes back.
    expect(runOf(plan, (field) => field.bodies.length)).toEqual([7, 6, 5, 4, 3, 2, 1])
    // And each of them holds the beat it belongs to, so the count falls in step with the
    // clock rather than merely getting there.
    for (let beat = 0; beat < BEAD_COUNT - 1; beat++) {
      const left = 1 - (beat + 0.5) / (BEAD_COUNT - 1)
      expect(fieldAt(plan, left).bodies).toHaveLength(BEAD_COUNT - beat)
    }
    // One body on the pane happens at exactly one moment, and that moment is zero.
    expect(fieldAt(plan, 1e-4).bodies).toHaveLength(2)
    expect(fieldAt(plan, 0).bodies).toHaveLength(1)
  })

  it('brings each pair to exactly touching on its own tick', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      for (let join = 1; join < BEAD_COUNT; join++) {
        // A hair before the join the pair is still two bodies, and their surfaces meet.
        const { bodies } = fieldAt(plan, 1 - join / (BEAD_COUNT - 1) + 1e-9)
        let least = Infinity
        for (const one of bodies) {
          for (const other of bodies) {
            if (one.id >= other.id) continue
            least = Math.min(least, Math.hypot(one.x - other.x, one.y - other.y) - one.r - other.r)
          }
        }
        expect(least).toBeCloseTo(0, 6)
      }
    }
  })

  it('grows a body by gathering drops into it, never by swelling one', () => {
    const plan = createCoalescence(seeded(3))
    for (const left of SWEEP) {
      const field = fieldAt(plan, left)
      expect(field.bodies.reduce((sum, body) => sum + body.mass, 0)).toBe(BEAD_COUNT)
      for (const body of field.bodies) expect(body.r).toBeCloseTo(BEAD_R * Math.cbrt(body.mass), 10)
    }
    // Which is where the quarter comes from: two drops together read a quarter wider.
    expect(bodyR(2) / bodyR(1)).toBeCloseTo(1.26, 2)
  })

  it('leaves the last body dead centre, exactly', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      // No join moves the mass of the pair that made it and no pour moves one at all, so
      // the field ends where it began — and it began in the middle.
      for (const left of [1, 0]) {
        expect(offCentre(centreOfMass(fieldAt(plan, left).beads))).toBeCloseTo(0, 9)
      }
      expect(offCentre(fieldAt(plan, 0).bodies[0])).toBeCloseTo(0, 9)
      // And never more than a fiftieth of the pane off it in between: a pair closes against
      // its own mass, but the two of them are not always the same distance into their beat.
      for (const left of SWEEP) {
        expect(offCentre(centreOfMass(fieldAt(plan, left).beads))).toBeLessThan(0.02)
      }
    }
  })

  it('never lets two bodies share glass, only the pair that is joining', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const plan = createCoalescence(seeded(seed))
      for (const left of SWEEP) {
        // Wide enough that the goo filter cannot reach across it either: a neck that grows
        // between two bodies and then breaks reads as a join that did not take.
        expect(tightestGap(fieldAt(plan, left).beads)).toBeGreaterThan(0.03)
      }
    }
  })

  it('keeps every drop over the glass', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      for (const left of SWEEP) {
        for (const bead of fieldAt(plan, left).beads) {
          expect(Math.abs(bead.x - 0.5) + BEAD_R).toBeLessThan(0.5)
          expect(Math.abs(bead.y - 0.5) + BEAD_R).toBeLessThan(0.5)
        }
      }
    }
  })

  it('never changes a drop pace in a step', () => {
    // The whole point of planning velocities rather than easing positions: a pair is drawn
    // together, and what it is doing when it touches is what pours it into the body it has
    // joined. A jump here would be a drop teleporting into a new speed.
    expect(speedJump(createCoalescence(seeded(7)))).toBeLessThan(0.5)
  })

  it('never changes what the pane covers in a step either, which is what popping is', () => {
    // Under a hundredth of the pane between neighbouring frames, at a join as much as
    // anywhere else. Nothing is swapped for anything, so there is nothing to pop.
    expect(biggestFlicker(createCoalescence(seeded(4)))).toBeLessThan(0.01)
    expect(biggestFlicker(createFission(seeded(4)))).toBeLessThan(0.01)
    expect(biggestFlicker(createShedding(seeded(4)))).toBeLessThan(0.015)
    expect(biggestFlicker(createGathering(seeded(4)))).toBeLessThan(0.015)
  })

  it('draws each pair together, quickest as it lands, then pours it home', () => {
    const plan = createCoalescence(seeded(8))
    const speedAt = (left: number, id: number) => {
      const step = 1e-5
      const before = fieldAt(plan, left + step).beads.find((bead) => bead.id === id)!
      const after = fieldAt(plan, left - step).beads.find((bead) => bead.id === id)!
      return Math.hypot(after.x - before.x, after.y - before.y) / (2 * step)
    }
    const first = 1 - 1 / (BEAD_COUNT - 1)
    const moving = fieldAt(plan, first + 1e-6).beads.reduce((quickest, bead) =>
      speedAt(first + 1e-6, bead.id) > speedAt(first + 1e-6, quickest.id) ? bead : quickest,
    )
    // Faster on the approach than at the top of it, and still moving after the join: the
    // closing motion becomes the pour rather than stopping at the surface.
    expect(speedAt(first + 1e-6, moving.id)).toBeGreaterThan(speedAt(1 - 1e-6, moving.id))
    expect(speedAt(first - 1e-6, moving.id)).toBeGreaterThan(0.1)
  })

  it('plans the same rest twice from the same seed, and a different one from another', () => {
    expect(createCoalescence(seeded(9))).toEqual(createCoalescence(seeded(9)))
    const opens = SEEDS.map((seed) =>
      fieldAt(createCoalescence(seeded(seed)), 1)
        .beads.map((bead) => `${bead.x.toFixed(3)},${bead.y.toFixed(3)}`)
        .join(' '),
    )
    expect(new Set(opens).size).toBe(SEEDS.length)
  })

  it('holds its opening arrangement above the rest and its closing one through overtime', () => {
    const plan = createCoalescence(seeded(5))
    expect(fieldAt(plan, 2).bodies).toHaveLength(BEAD_COUNT)
    expect(fieldAt(plan, -0.4).bodies).toHaveLength(1)
  })
})

describe('createShedding', () => {
  it('loses one drop at every seventh of the rest, and ends on clear glass', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const plan = createShedding(seeded(seed))
      for (const left of SWEEP) {
        expect(fieldAt(plan, left).beads.length).toBe(Math.max(0, Math.ceil(left * BEAD_COUNT - 1e-9)))
      }
      // Including on the tick itself, which is the moment a drop finishes leaving.
      for (let step = 1; step <= BEAD_COUNT; step++) {
        expect(fieldAt(plan, 1 - step / BEAD_COUNT).beads).toHaveLength(BEAD_COUNT - step)
      }
      expect(fieldAt(plan, 0).beads).toHaveLength(0)
    }
  })

  it('keeps the mass in the middle, and finds it exactly centred at every tear', () => {
    for (const seed of SEEDS) {
      const plan = createShedding(seeded(seed))
      expect(offCentre(biggest(fieldAt(plan, 1))!)).toBeCloseTo(0, 9)
      for (let step = 1; step <= BEAD_COUNT; step++) {
        // A tear is three quarters of a beat before the leaving it causes. The whole mass is
        // dead centre as it starts, whatever the last recoil did and whatever the drops in it
        // are doing of their own accord.
        const field = fieldAt(plan, 1 - (step - 0.75) / BEAD_COUNT + 1e-9)
        expect(offCentre(centreOfMass(field.beads.filter((bead) => !bead.loose)))).toBeCloseTo(0, 8)
      }
    }
  })

  it('tears a drop out of the mass rather than putting one beside it', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const plan = createShedding(seeded(seed))
      for (let step = 1; step < BEAD_COUNT; step++) {
        const field = fieldAt(plan, 1 - (step - 0.7) / BEAD_COUNT)
        const leaving = field.beads.find((bead) => bead.mate !== null && bead.body !== 0)
        const mass = biggest(field)!
        // Just after the tear starts the drop is still inside what it is leaving, so the two
        // of them are one silhouette with a neck: the pane never shows it appearing.
        expect(leaving).toBeDefined()
        expect(Math.hypot(leaving!.x - mass.x, leaving!.y - mass.y)).toBeLessThan(mass.r + BEAD_R)
      }
    }
  })

  it('answers a tear with a recoil, the harder the emptier the middle is', () => {
    const plan = createShedding(seeded(11))
    const drift = (step: number) => {
      let worst = 0
      for (let i = 0; i <= 60; i++) {
        const left = 1 - (step - 0.75 + (0.75 * i) / 60) / BEAD_COUNT
        const mass = biggest(fieldAt(plan, left))
        if (mass && mass.mass > 1) worst = Math.max(worst, offCentre(mass))
      }
      return worst
    }
    // A mass six times the weight of what it lets go barely moves; by the end it is one drop
    // pushing off another and it goes as far as what it throws.
    expect(drift(1)).toBeLessThan(0.06)
    expect(drift(5)).toBeGreaterThan(drift(1))
  })

  it('sees each drop wholly off the pane, and keeps the rest of them on it', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const plan = createShedding(seeded(seed))
      for (const left of SWEEP) {
        const field = fieldAt(plan, left)
        expect(tightestGap(field.beads)).toBeGreaterThan(0)
        for (const bead of field.beads) {
          if (bead.loose) continue
          expect(Math.abs(bead.x - 0.5) + BEAD_R).toBeLessThan(0.5)
          expect(Math.abs(bead.y - 0.5) + BEAD_R).toBeLessThan(0.5)
        }
      }
    }
  })

  it('never changes a drop pace in a step', () => {
    expect(speedJump(createShedding(seeded(12)))).toBeLessThan(1)
  })

  it('plans the same rest twice from one seed, and throws the drops elsewhere on another', () => {
    expect(createShedding(seeded(23))).toEqual(createShedding(seeded(23)))
    const ways = SEEDS.map((seed) =>
      fieldAt(createShedding(seeded(seed)), 1 - 0.5 / BEAD_COUNT)
        .beads.map((bead) => bead.x.toFixed(3))
        .join(' '),
    )
    expect(new Set(ways).size).toBe(SEEDS.length)
  })
})

describe('reversePlan', () => {
  it('turns a coalescence into one body coming apart into seven', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const plan = createFission(seeded(seed))
      const opens = fieldAt(plan, 1)
      expect(opens.bodies).toHaveLength(1)
      expect(opens.bodies[0].mass).toBe(BEAD_COUNT)
      // Sitting still and dead centre: the payoff of a coalescence, read as an opening.
      expect(offCentre(opens.bodies[0])).toBeCloseTo(0, 9)
      expect(runOf(plan, (field) => field.bodies.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
      for (let beat = 0; beat < BEAD_COUNT - 1; beat++) {
        const left = 1 - (beat + 0.5) / (BEAD_COUNT - 1)
        expect(fieldAt(plan, left).bodies).toHaveLength(beat + 1)
      }
      expect(fieldAt(plan, 0).bodies).toHaveLength(BEAD_COUNT)
    }
  })

  it('lands the seventh body exactly on zero, with the last pair still touching', () => {
    for (const seed of SEEDS) {
      const field = fieldAt(createFission(seeded(seed)), 0)
      const gaps: number[] = []
      for (let i = 0; i < field.beads.length; i++) {
        for (let j = i + 1; j < field.beads.length; j++) {
          gaps.push(gapBetween(field.beads[i], field.beads[j]))
        }
      }
      gaps.sort((a, b) => a - b)
      // The pair that has just parted is still in contact — the mirror of the two drops that
      // touch at the end of a coalescence — and nothing else is anywhere near.
      expect(gaps[0]).toBeCloseTo(0, 6)
      expect(gaps[1]).toBeGreaterThan(0.03)
    }
  })

  it('keeps a fission as sound as the coalescence it came from', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const plan = createFission(seeded(seed))
      for (const left of SWEEP) {
        const field = fieldAt(plan, left)
        expect(field.beads).toHaveLength(BEAD_COUNT)
        expect(tightestGap(field.beads)).toBeGreaterThan(0.03)
        expect(offCentre(centreOfMass(field.beads))).toBeLessThan(0.02)
        for (const bead of field.beads) {
          expect(Math.abs(bead.x - 0.5) + BEAD_R).toBeLessThan(0.5)
          expect(Math.abs(bead.y - 0.5) + BEAD_R).toBeLessThan(0.5)
        }
      }
    }
  })

  it('turns a shedding into drops arriving, the last of them landing on zero', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const plan = createGathering(seeded(seed))
      // The one run here that opens on an empty pane, with its first drop already on the way
      // in from beyond the rim.
      expect(fieldAt(plan, 1).beads).toHaveLength(0)
      const done = fieldAt(plan, 0)
      expect(done.bodies).toHaveLength(1)
      expect(done.bodies[0].mass).toBe(BEAD_COUNT)
      expect(offCentre(done.bodies[0])).toBeCloseTo(0, 9)
      // What the middle has gathered is the reading, and it goes up by one at every
      // seventh — the drop crossing the rim is not in the middle yet.
      for (let beat = 0; beat < BEAD_COUNT; beat++) {
        const left = 1 - (beat + 0.5) / BEAD_COUNT
        const settled = fieldAt(plan, left).beads.filter((bead) => !bead.loose)
        expect(settled).toHaveLength(beat)
      }
      for (const left of SWEEP) {
        const field = fieldAt(plan, left)
        // And the only other glass on the pane is the one drop on its way in.
        expect(field.bodies.length).toBeLessThanOrEqual(2)
        expect(field.beads.length).toBeLessThanOrEqual(BEAD_COUNT)
      }
    }
  })

  it('reverses the physics along with the schedule', () => {
    const plan = createGathering(seeded(13))
    expect(speedJump(plan)).toBeLessThan(1)
    const speedAt = (left: number) => {
      const step = 1e-5
      const one = fieldAt(plan, left + step).beads
      const two = fieldAt(plan, left - step).beads
      const moved = two.filter((bead) => one.some((was) => was.id === bead.id))
      return Math.max(
        ...moved.map((bead) => {
          const was = one.find((other) => other.id === bead.id)!
          return Math.hypot(bead.x - was.x, bead.y - was.y) / (2 * step)
        }),
      )
    }
    // A drop arriving is a drop leaving run backwards, so it comes in quickest and settles
    // into the mass rather than starting slowly and slamming in.
    expect(speedAt(1 - 0.4 / BEAD_COUNT)).toBeGreaterThan(speedAt(1 - 0.95 / BEAD_COUNT))
  })

  it('holds the end of a mirrored run through overtime rather than the start of it', () => {
    expect(fieldAt(createFission(seeded(32)), -0.4).bodies).toHaveLength(BEAD_COUNT)
    expect(fieldAt(createFission(seeded(32)), 2).bodies).toHaveLength(1)
    expect(fieldAt(createGathering(seeded(33)), -0.4).bodies).toHaveLength(1)
    expect(fieldAt(createGathering(seeded(33)), 2).beads).toHaveLength(0)
  })
})
