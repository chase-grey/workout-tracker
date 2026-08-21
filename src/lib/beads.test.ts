import { describe, expect, it } from 'vitest'
import {
  BEAD_COUNT,
  beadsAt,
  createCoalescence,
  createFission,
  createGathering,
  createShedding,
  gapBetween,
  type Bead,
  type BeadPlan,
  type LiveBead,
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

/** Fractions across a whole rest, fine enough to catch a bead crossing another one. */
const SWEEP = Array.from({ length: 601 }, (_, i) => 1 - i / 600)

/** Seeds enough to say the layout holds in general and not just for one arrangement. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)

const centreDistance = (bead: LiveBead) => Math.hypot(bead.x - 0.5, bead.y - 0.5)

/** The two beads of a join, given the bead they became. */
function parentsOf(beads: Bead[], joined: Bead): [Bead, Bead] {
  const [a, b] = beads.filter((bead) => bead.mergesAt === joined.bornAt)
  return [a, b]
}

/**
 * The closest two beads on the pane come to each other, surface to surface, not
 * counting the pair that is on its way to joining — those are *meant* to reach
 * nothing between them.
 */
function tightestGap(live: LiveBead[], partners: Map<number, number | null>): number {
  let least = Infinity
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (partners.get(live[i].id) === partners.get(live[j].id)) continue
      least = Math.min(least, gapBetween(live[i], live[i], live[j], live[j]))
    }
  }
  return least
}

/** Where the mass on the pane sits, which is the thing no join is allowed to move. */
function centreOfMass(live: LiveBead[]) {
  const mass = live.reduce((sum, bead) => sum + bead.mass, 0)
  return {
    x: live.reduce((sum, bead) => sum + bead.x * bead.mass, 0) / mass,
    y: live.reduce((sum, bead) => sum + bead.y * bead.mass, 0) / mass,
  }
}

describe('createCoalescence', () => {
  it('plans every bead the rest will hold, ending on one that holds them all', () => {
    const plan = createCoalescence(seeded(1))
    // The beads it starts with, plus one for each join.
    expect(plan.beads).toHaveLength(2 * BEAD_COUNT - 1)
    expect(plan.count).toBe(BEAD_COUNT)
    expect(plan.beads.slice(0, BEAD_COUNT).every((b) => b.mass === 1 && b.bornAt === 1)).toBe(true)
    const root = plan.beads[plan.beads.length - 1]
    expect(root.mass).toBe(BEAD_COUNT)
    // Exactly one bead never merges, and it is the one the pane ends on.
    expect(plan.beads.filter((b) => b.mergesAt === null)).toEqual([root])
  })

  it('spaces the joins evenly and lands the last one exactly on zero', () => {
    const plan = createCoalescence(seeded(2))
    const merges = [...new Set(plan.beads.map((b) => b.mergesAt))]
      .filter((at): at is number => at !== null)
      .sort((a, b) => b - a)
    expect(merges).toHaveLength(BEAD_COUNT - 1)
    merges.forEach((at, i) => expect(at).toBeCloseTo(1 - (i + 1) / (BEAD_COUNT - 1), 10))
    expect(merges[merges.length - 1]).toBe(0)
    // Two beads to a join, and the bead they become appears as they go.
    for (const at of merges) {
      expect(plan.beads.filter((b) => b.mergesAt === at)).toHaveLength(2)
      expect(plan.beads.filter((b) => b.bornAt === at)).toHaveLength(1)
    }
  })

  it('brings each pair to exactly touching', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      for (const joined of plan.beads.filter((b) => b.mass > 1)) {
        const [a, b] = parentsOf(plan.beads, joined)
        // Surfaces meeting, not centres: the glass between them closes to nothing.
        expect(gapBetween(a, a.to, b, b.to)).toBeCloseTo(0, 10)
      }
    }
  })

  it('has each pair close the gap against its own mass, and puts the bead they become where that mass was', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      for (const joined of plan.beads.filter((b) => b.mass > 1)) {
        const [a, b] = parentsOf(plan.beads, joined)
        const travelled = {
          a: Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y),
          b: Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y),
        }
        // A bead twice the mass of its partner comes half as far to meet it.
        expect(travelled.a * a.mass).toBeCloseTo(travelled.b * b.mass, 10)
        // And the bead they become takes over the pair's centre of mass, which is
        // inside the two of them rather than out on the boundary between them.
        expect(joined.from.x).toBeCloseTo((a.to.x * a.mass + b.to.x * b.mass) / joined.mass, 10)
        expect(joined.from.y).toBeCloseTo((a.to.y * a.mass + b.to.y * b.mass) / joined.mass, 10)
      }
    }
  })

  it('grows beads by volume, so joining two makes one about a quarter wider', () => {
    const plan = createCoalescence(seeded(3))
    const single = plan.beads[0].r
    for (const bead of plan.beads) {
      expect(bead.r).toBeCloseTo(single * Math.cbrt(bead.mass), 10)
    }
    expect(plan.beads.find((b) => b.mass === 2)!.r / single).toBeCloseTo(1.26, 2)
  })

  it('plans the same rest twice from the same seed', () => {
    expect(createCoalescence(seeded(9))).toEqual(createCoalescence(seeded(9)))
  })

  it('scatters the opening layout rather than repeating one arrangement', () => {
    const opens = SEEDS.map((seed) =>
      createCoalescence(seeded(seed))
        .beads.slice(0, BEAD_COUNT)
        .map((b) => `${b.from.x.toFixed(3)},${b.from.y.toFixed(3)}`)
        .join(' '),
    )
    expect(new Set(opens).size).toBe(SEEDS.length)
  })
})

describe('beadsAt', () => {
  it('drops the count by one at each join, from all of them to one', () => {
    const plan = createCoalescence(seeded(4))
    expect(beadsAt(plan, 1)).toHaveLength(BEAD_COUNT)
    expect(beadsAt(plan, 0)).toHaveLength(1)
    // The count is the reading, so it has to fall in step with the clock: a sixth
    // of the rest gone is a sixth of the pane's beads gone into another.
    for (const left of SWEEP) {
      expect(beadsAt(plan, left)).toHaveLength(1 + Math.ceil(left * (BEAD_COUNT - 1) - 1e-9))
    }
  })

  it('holds the last bead through overtime, and never more than the pane started with', () => {
    const plan = createCoalescence(seeded(5))
    expect(beadsAt(plan, -0.4)).toHaveLength(1)
    expect(beadsAt(plan, 2)).toHaveLength(BEAD_COUNT)
  })

  it('keeps the mass on the pane whole', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      for (const left of SWEEP) {
        // No bead is ever lost or counted twice.
        const live = beadsAt(plan, left)
        expect(live.reduce((sum, bead) => sum + bead.mass, 0)).toBe(BEAD_COUNT)
      }
    }
  })

  it('holds the mass in the middle of the pane, which is what centres the last bead', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      // Exactly, at both ends of the rest: no join moves the mass of the pair that
      // made it, so the bead the pane is left with sits where they all started —
      // dead centre.
      for (const left of [1, 0]) {
        const middle = centreOfMass(beadsAt(plan, left))
        expect(middle.x).toBeCloseTo(0.5, 10)
        expect(middle.y).toBeCloseTo(0.5, 10)
      }
      // And never more than a fiftieth of the pane off it in between. A pair closes
      // its gap against its own mass, but the older bead of the two is further along
      // that approach than its partner, so the mass they share drifts a little
      // while they are travelling.
      for (const left of SWEEP) {
        const middle = centreOfMass(beadsAt(plan, left))
        expect(Math.hypot(middle.x - 0.5, middle.y - 0.5)).toBeLessThan(0.02)
      }
    }
  })

  it('never lets two beads share glass, only touch as they join', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      const partners = new Map(plan.beads.map((b) => [b.id, b.mergesAt]))
      for (const left of SWEEP) {
        // Beads squeezing past each other is the pane's tightest constraint, and
        // what the layout constants were settled against: two of them sharing glass
        // reads as a join that didn't take.
        expect(tightestGap(beadsAt(plan, left), partners)).toBeGreaterThan(0)
      }
    }
  })

  it('keeps every bead inside the pane', () => {
    for (const seed of SEEDS) {
      const plan = createCoalescence(seeded(seed))
      for (const left of SWEEP) {
        for (const bead of beadsAt(plan, left)) {
          expect(centreDistance(bead) + bead.r).toBeLessThan(0.5)
        }
      }
    }
  })

  it('moves beads continuously, so the countdown has nothing to jump over', () => {
    const plan = createCoalescence(seeded(7))
    let previous = new Map(beadsAt(plan, 1).map((bead) => [bead.id, bead]))
    for (const left of SWEEP.slice(1)) {
      const live = beadsAt(plan, left)
      for (const bead of live) {
        const was = previous.get(bead.id)
        // A bead that was already here has crept, not hopped. One that has just
        // appeared is exempt: it appears where the pair it came from was.
        if (was) expect(Math.hypot(bead.x - was.x, bead.y - was.y)).toBeLessThan(0.01)
      }
      previous = new Map(live.map((bead) => [bead.id, bead]))
    }
  })

  it('draws each pair together over its whole life, quickest as it lands', () => {
    const plan = createCoalescence(seeded(8))
    const bead = plan.beads[0]
    const travel = Math.hypot(bead.to.x - bead.from.x, bead.to.y - bead.from.y)
    const life = bead.bornAt - bead.mergesAt!
    const gone = (share: number) => {
      const at = beadsAt(plan, bead.bornAt - life * share).find((b) => b.id === bead.id)!
      return Math.hypot(at.x - bead.from.x, at.y - bead.from.y)
    }
    // Squared: half its life gone and it is a quarter of the way there, so the
    // last stretch of the approach is the quickest part of it.
    expect(gone(0.5)).toBeCloseTo(travel / 4, 8)
    expect(gone(0.9)).toBeCloseTo(travel * 0.81, 8)
    expect(gone(1 - 1e-9)).toBeCloseTo(travel, 6)
  })
})

/** The mass in the middle of a shedding: the one thing on the pane that never moves. */
const massOf = (plan: BeadPlan) =>
  plan.beads.filter((bead) => bead.from.x === bead.to.x && bead.from.y === bead.to.y)

/** And the beads on their way off it. */
const shedOf = (plan: BeadPlan) =>
  plan.beads.filter((bead) => bead.from.x !== bead.to.x || bead.from.y !== bead.to.y)

/** How far past the nearest edge of the pane a bead ends up — negative until it is wholly off it. */
const clearOf = (bead: Bead) =>
  Math.max(Math.abs(bead.to.x - 0.5), Math.abs(bead.to.y - 0.5)) - 0.5 - bead.r

/** A plan's beads keyed by the field that marks the pair an event joins or parts. */
const pairedBy = (plan: BeadPlan, field: 'bornAt' | 'mergesAt') =>
  new Map(plan.beads.map((bead) => [bead.id, bead[field]]))

const totalMass = (live: LiveBead[]) => live.reduce((sum, bead) => sum + bead.mass, 0)

/** Every gap on the pane, tightest first. */
function gapsBetween(live: LiveBead[]): number[] {
  const gaps: number[] = []
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      gaps.push(gapBetween(live[i], live[i], live[j], live[j]))
    }
  }
  return gaps.sort((a, b) => a - b)
}

describe('createShedding', () => {
  it('plans a mass in the middle that empties itself, a bead at a time', () => {
    const plan = createShedding(seeded(21))
    // Every size the mass holds on the way down, and every bead it lets go of.
    expect(plan.beads).toHaveLength(2 * BEAD_COUNT)
    expect(massOf(plan).map((bead) => bead.mass)).toEqual([7, 6, 5, 4, 3, 2, 1])
    expect(massOf(plan).every((bead) => bead.from.x === 0.5 && bead.from.y === 0.5)).toBe(true)
    expect(shedOf(plan).map((bead) => bead.mass)).toEqual(Array(BEAD_COUNT).fill(1))
    expect(plan.count).toBe(BEAD_COUNT)
  })

  it('spaces the leavings evenly and lands the last one exactly on zero', () => {
    const plan = createShedding(seeded(22))
    const goes = shedOf(plan).map((bead) => bead.mergesAt!)
    goes.forEach((at, i) => expect(at).toBeCloseTo(1 - (i + 1) / BEAD_COUNT, 10))
    expect(goes[goes.length - 1]).toBe(0)
    // And each one pinches off three quarters of a beat before it goes, so a bead
    // coming off the mass and a bead clearing the rim are two events and not one.
    for (const bead of shedOf(plan)) {
      expect(bead.bornAt - bead.mergesAt!).toBeCloseTo(0.75 / BEAD_COUNT, 10)
    }
  })

  it('pinches each bead off the mass it came from, in view, and sees it wholly off', () => {
    for (const seed of SEEDS) {
      const plan = createShedding(seeded(seed))
      for (const bead of shedOf(plan)) {
        const mass = massOf(plan).find((m) => m.bornAt === bead.bornAt)
        // Touching what the mass has just become — or standing in the middle itself,
        // for the last bead, which has no mass left to come off.
        if (mass) expect(gapBetween(bead, bead.from, mass, mass.from)).toBeCloseTo(0, 10)
        else expect(bead.from).toEqual({ x: 0.5, y: 0.5 })
        // It starts where it can be seen and ends just past where it can't: the pane
        // loses the last of it on its own tick rather than a moment either side.
        expect(Math.hypot(bead.from.x - 0.5, bead.from.y - 0.5) + bead.r).toBeLessThan(0.5)
        expect(clearOf(bead)).toBeCloseTo(0, 10)
      }
    }
  })

  it('loses one bead of glass at every seventh of the rest', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const plan = createShedding(seeded(seed))
      // What the pane holds is the reading, whether it is sitting in the middle or on
      // its way out through the rim.
      for (const left of SWEEP) {
        expect(totalMass(beadsAt(plan, left))).toBe(
          Math.max(0, Math.ceil(left * BEAD_COUNT - 1e-9)),
        )
      }
      // Including on the tick itself, which is the moment a bead finishes leaving.
      shedOf(plan).forEach((bead, i) => {
        expect(totalMass(beadsAt(plan, bead.mergesAt!))).toBe(BEAD_COUNT - (i + 1))
      })
    }
  })

  it('never lets two beads share glass', () => {
    for (const seed of SEEDS) {
      const plan = createShedding(seeded(seed))
      const partners = pairedBy(plan, 'mergesAt')
      for (const left of SWEEP) {
        // A bead comes off the mass exactly touching it and heads straight out from
        // there, so that one moment of contact is as tight as the pane ever gets.
        expect(tightestGap(beadsAt(plan, left), partners)).toBeGreaterThan(-1e-9)
      }
    }
  })

  it('plans the same rest twice from one seed, and sends the beads out elsewhere on another', () => {
    expect(createShedding(seeded(23))).toEqual(createShedding(seeded(23)))
    const ways = SEEDS.map((seed) =>
      shedOf(createShedding(seeded(seed)))
        .map((bead) => bead.to.x.toFixed(3))
        .join(' '),
    )
    expect(new Set(ways).size).toBe(SEEDS.length)
  })
})

describe('reversePlan', () => {
  it('turns a coalescence into one bead coming apart into seven', () => {
    const plan = createFission(seeded(31))
    expect(plan.ease).toBe('opening')
    const opens = beadsAt(plan, 1)
    expect(opens).toHaveLength(1)
    expect(opens[0].mass).toBe(BEAD_COUNT)
    expect(centreDistance(opens[0])).toBeCloseTo(0, 10)
    const ends = beadsAt(plan, 0)
    expect(ends).toHaveLength(BEAD_COUNT)
    expect(ends.every((bead) => bead.mass === 1)).toBe(true)
    // One more bead at every sixth of the way through: the coalescence's count, the
    // other way up.
    for (const left of SWEEP) {
      const count = BEAD_COUNT - Math.ceil(left * (BEAD_COUNT - 1) - 1e-9)
      expect(beadsAt(plan, left)).toHaveLength(count)
    }
  })

  it('lands the seventh bead exactly on zero, with the last pair still touching', () => {
    for (const seed of SEEDS) {
      const gaps = gapsBetween(beadsAt(createFission(seeded(seed)), 0))
      // The pair that has just come apart is still in contact on the tick — the mirror
      // of the two beads that touch at the end of a coalescence — and nothing else on
      // the pane is anywhere near touching.
      expect(gaps[0]).toBeCloseTo(0, 10)
      expect(gaps[1]).toBeGreaterThan(0.01)
    }
  })

  it('keeps a fission as sound as the coalescence it came from', () => {
    for (const seed of SEEDS) {
      const plan = createFission(seeded(seed))
      const partners = pairedBy(plan, 'bornAt')
      for (const left of SWEEP) {
        const live = beadsAt(plan, left)
        expect(tightestGap(live, partners)).toBeGreaterThan(-1e-9)
        expect(totalMass(live)).toBe(BEAD_COUNT)
        for (const bead of live) expect(centreDistance(bead) + bead.r).toBeLessThan(0.5)
      }
    }
  })

  it('turns a shedding into beads arriving, the last of them landing on zero', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const plan = createGathering(seeded(seed))
      expect(plan.ease).toBe('opening')
      // The one shape here that opens on an empty pane, with its first bead already on
      // the way in from beyond the rim.
      expect(beadsAt(plan, 1)).toHaveLength(0)
      const ends = beadsAt(plan, 0)
      expect(ends).toHaveLength(1)
      expect(ends[0].mass).toBe(BEAD_COUNT)
      expect(centreDistance(ends[0])).toBeCloseTo(0, 10)
      for (const left of SWEEP) {
        const live = beadsAt(plan, left)
        // What the middle has gathered goes up by one at every seventh, and the only
        // other glass on the pane is the one bead on its way in.
        const gathered = live.find((bead) => centreDistance(bead) < 1e-9)
        expect(gathered?.mass ?? 0).toBe(BEAD_COUNT - Math.ceil(left * BEAD_COUNT - 1e-9))
        expect(live.length - (gathered ? 1 : 0)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('holds the end of the run through overtime rather than the start of it', () => {
    const fission = createFission(seeded(32))
    expect(beadsAt(fission, -0.4)).toHaveLength(BEAD_COUNT)
    expect(beadsAt(fission, 2)).toHaveLength(1)
    const gathering = createGathering(seeded(33))
    expect(beadsAt(gathering, -0.4)).toHaveLength(1)
    expect(beadsAt(gathering, 2)).toHaveLength(0)
  })

  it('eases a run backwards as well as timing it backwards', () => {
    const plan = createFission(seeded(34))
    // The first bead to come apart that has further to go itself.
    const live = beadsAt(plan, 5 / 6 - 1e-9).find((bead) => bead.mass > 1)!
    const planned = plan.beads.find((bead) => bead.id === live.id)!
    const travel = Math.hypot(planned.to.x - planned.from.x, planned.to.y - planned.from.y)
    const life = planned.bornAt - planned.mergesAt!
    const gone = (share: number) => {
      const at = beadsAt(plan, planned.bornAt - life * share).find((b) => b.id === live.id)!
      return Math.hypot(at.x - planned.from.x, at.y - planned.from.y)
    }
    // Quickest as it leaves: a tenth of its life gone and it is a fifth of the way,
    // where a bead being drawn *in* would be a hundredth of the way.
    expect(gone(0.1)).toBeCloseTo(travel * 0.19, 8)
    expect(gone(0.5)).toBeCloseTo(travel * 0.75, 8)
  })
})
