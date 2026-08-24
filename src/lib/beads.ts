/**
 * The drops of glass the four bead shapes are made of (see components/RestShapes).
 *
 * A pane of black glass with drops of liquid lying on it, and what tells the time is
 * how many separate *bodies* the pane holds. Two runs live here, and either can be read
 * forwards or backwards, which is four shapes:
 *
 *  - `beads` — a coalescence. Seven bodies find each other, two of them touching and
 *    becoming one at every sixth of the rest, until a single body is left dead centre as
 *    the clock reaches zero.
 *  - `split` — that run backwards. One body comes apart into seven, the last pair
 *    parting exactly at zero.
 *  - `shed` — a mass in the middle tearing off a drop at a time, each of them crossing
 *    the glass and passing out through the rim. The seventh is clear of the pane at
 *    zero, and nothing is left on it.
 *  - `gather` — that one backwards. Drops arrive from beyond the rim, one every seventh
 *    of the rest, into a mass that ends up holding all seven.
 *
 * Whichever way round, the reading is a count and never a level, and every step of it is
 * an event you can watch land: a pair touching, a drop tearing away, a drop crossing the
 * rim.
 *
 * ## What a body is
 *
 * A drop is one size for its whole life — {@link BEAD_R}, always — and there are seven
 * of them from the first frame to the last. Nothing on the pane appears, vanishes or
 * swells. A *body* is however many drops are travelling together, packed close enough
 * that the goo filter the shapes are drawn through (see RestShapes) reads them as one
 * surface: two drops that have merged are two drops sitting nearly on top of each other,
 * and the mass at the end of a coalescence is seven of them in a clump.
 *
 * That is the whole of why nothing pops. A join is not a pair being swapped for a wider
 * circle — it is the pair carrying on into each other until they are one silhouette, and
 * the only thing that changes on the tick is which body each drop belongs to. The
 * silhouette a body comes to is {@link bodyR}, which grows as the cube root, so joining
 * two makes one about a quarter wider and the pane keeps its slack.
 *
 * ## Momentum
 *
 * Every drop travels a cubic with a velocity at each end, and each leg starts at exactly
 * the velocity the leg before it finished at ({@link Leg}). So nothing here changes speed
 * in a step. A pair is drawn together, quickest as it touches, and the closing motion it
 * has at that moment is what carries the two of them the rest of the way into each other
 * — the *pour* — where it damps out against the liquid it has joined. The body they
 * become leaves with the momentum the two of them brought, which for a pair closing on
 * its own centre of mass is none: that is why a merge settles instead of drifting, and
 * why a small drop swallowed by a big one still shifts it a little.
 *
 * A tear is that law run the other way. A drop leaves the mass with a momentum the mass
 * has to answer for, so the mass recoils; what walks it back to the middle afterwards is
 * the pane's own hold on the liquid, the one force here that comes from outside the
 * glass (see {@link planShedding}).
 *
 * ## What is planned and what is measured
 *
 * A run is worked out once, when the rest starts, as legs of a journey. {@link fieldAt}
 * is a pure lookup into that, and a plan can be turned end for end
 * ({@link reversePlan}) to be run backwards. Nothing is simulated and nothing
 * accumulates, so a shape is correct at whatever fraction it is asked about — a rest
 * resumed after a reload picks up exactly where it should be, and the last event of a run
 * lands on the tick rather than a frame or two either side of it.
 *
 * On top of the schedule every drop carries a slow stir of its own ({@link swayAt}),
 * because liquid this size is never still. The stir is taken back out of the schedule
 * wherever a reading lives, so a pair still touches exactly on its tick, and the stir of
 * all seven sums to nothing at every moment, so it cannot move the field's centre of mass
 * — which is the one thing holding the last body dead centre. What it *can* do is close
 * glass the schedule meant to keep, so a plan is swept against its own rules before it is
 * handed back ({@link holds}), and a layout that will not hold is thrown away rather than
 * argued about.
 */

/** Drops on the pane. Also the number of joins plus one, so each join is a sixth of the rest. */
export const BEAD_COUNT = 7

/** One drop, as a share of the pane. Fixed for life — drops grow by gathering, never by swelling. */
export const BEAD_R = 0.102

export type Vec = { x: number; y: number }

const TAU = Math.PI * 2
const ZERO: Vec = { x: 0, y: 0 }
const MIDDLE: Vec = { x: 0.5, y: 0.5 }

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k })
const span = (a: Vec) => Math.hypot(a.x, a.y)
const heading = (a: Vec): Vec => mul(a, 1 / (span(a) || 1))
const middleOf = (points: Vec[]): Vec =>
  mul(
    points.reduce((sum, p) => add(sum, p), ZERO),
    1 / (points.length || 1),
  )

/**
 * The silhouette a body of `mass` drops settles into, as a share of the pane: how far the
 * surface of its outermost drop reaches from its centre.
 *
 * By volume rather than by area, so two drops joining make one about a quarter wider
 * instead of half again as wide. Conserving area would leave the field covering exactly
 * as much glass at the end as at the start, and a field with no slack in it has nowhere
 * to close into.
 */
export function bodyR(mass: number): number {
  return BEAD_R * Math.cbrt(mass)
}

/** Glass between two drops' surfaces — negative if they overlap. */
export function gapBetween(a: Vec, b: Vec): number {
  return span(sub(a, b)) - 2 * BEAD_R
}

/* ------------------------------------------------------------------ the stir */

/** How far a drop strays off its schedule, as a share of the pane. */
const SWAY = 0.022

/** How many loops of the stir fit across a whole rest, which is what sets its pace. */
const SWAY_TURNS = 5.7

/**
 * Where the stir has every drop at one moment of the rest, in pane units.
 *
 * Two loops of different lengths, one across the pane and one down it, both offset and
 * detuned by the drop's own id — so no two of the seven are ever doing the same thing at
 * once and no single loop is one the eye can follow. `stir` scales the lot, and is how a
 * plan that could not keep its glass at the full stir is handed back with less of it.
 *
 * The mean is taken out, which is the part that matters: seven strays that sum to nothing
 * can move any drop you like and still leave the field's centre of mass exactly where the
 * schedule put it.
 */
function swayAt(e: number, stir: number): Vec[] {
  const raw: Vec[] = []
  for (let id = 0; id < BEAD_COUNT; id++) {
    const turn = TAU * SWAY_TURNS * (1 + (id % 3) * 0.09)
    raw.push({
      x: SWAY * Math.sin(turn * e + id * 1.7),
      y: SWAY * Math.sin(turn * 0.618 * e + id * 2.9),
    })
  }
  const off = middleOf(raw)
  return raw.map((v) => mul(sub(v, off), stir))
}

/* ------------------------------------------------------------------- a plan */

/**
 * One stretch of a drop's journey: a cubic between two points, with the velocity it holds
 * at each end.
 *
 * The velocities are the whole reason this is a curve and not a line. A leg begins at
 * exactly the speed the leg before it ended at, so a drop being drawn in, taken into a
 * body, or torn out of one never changes pace in a step — and where a leg *ends* is
 * exact, because that is where the readings live.
 */
export type Leg = {
  /** The remaining fraction of the rest this leg starts at, and the lower one it ends at. */
  at: number
  until: number
  from: Vec
  to: Vec
  /** Velocity at each end, in pane units per unit of the rest gone by. */
  v0: Vec
  v1: Vec
  /** The body of liquid the drop belongs to across this leg. */
  body: number
  /** The one other body whose glass it may close on: a pair joining, or a drop tearing away. */
  mate: number | null
  /** Whether it may cross the rim here — a drop leaving the pane, or arriving from beyond it. */
  loose: boolean
}

/** One drop's whole rest, leg by leg, latest first. */
export type Bead = { id: number; legs: Leg[] }

export type BeadPlan = {
  beads: Bead[]
  /** How many drops the run accounts for, which is always {@link BEAD_COUNT}. */
  count: number
  /** How much of the stir this plan can afford; 1 is the full stir. */
  stir: number
  /** How the stir's clock is read off the countdown — turned over for a plan run backwards. */
  stirFrom: number
  stirSlope: number
}

/** A drop as it stands at one moment: where it is, and what it is part of. */
export type LiveBead = {
  id: number
  x: number
  y: number
  /** Drops sharing this are one body of liquid, and read as one surface. */
  body: number
  mate: number | null
  loose: boolean
}

/** And a body of them: what it holds, where it sits, and how wide it reads. */
export type LiveBody = { id: number; mass: number; x: number; y: number; r: number }

export type BeadField = { beads: LiveBead[]; bodies: LiveBody[] }

/* ------------------------------------------------------------ reading a plan */

/**
 * Where a leg has its drop, given how much of the rest is left.
 *
 * A cubic through both ends with both velocities honoured, which is what makes the whole
 * journey one continuous move: the leg before this one ended at `from` doing `v0`, so this
 * one picks the drop up rather than restarting it. Read outside its own window the leg
 * holds still at whichever end it ran out of, which is how a run holds its opening
 * arrangement through the seconds before its first event and its closing one through
 * overtime.
 */
function walk(leg: Leg, fraction: number): Vec {
  const h = leg.at - leg.until
  const s = h > 0 ? clamp01((leg.at - fraction) / h) : 0
  const s2 = s * s
  const s3 = s2 * s
  const p0 = 2 * s3 - 3 * s2 + 1
  const m0 = s3 - 2 * s2 + s
  const p1 = -2 * s3 + 3 * s2
  const m1 = s3 - s2
  return {
    x: leg.from.x * p0 + leg.to.x * p1 + h * (leg.v0.x * m0 + leg.v1.x * m1),
    y: leg.from.y * p0 + leg.to.y * p1 + h * (leg.v0.y * m0 + leg.v1.y * m1),
  }
}

/**
 * The leg a drop is on with `fraction` of the rest left, or nothing at all if its journey
 * has not started yet or is over.
 *
 * The ends matter as much as the middle. A drop that has crossed the rim has to be *gone*
 * rather than parked against it, and one that has yet to arrive has to be nowhere — the
 * stir goes on stirring whatever the schedule is doing, and a drop left holding still at
 * the end of its last leg would drift back into view under it.
 */
function legAt(bead: Bead, fraction: number): Leg | null {
  if (fraction > bead.legs[0].at) return null
  for (const leg of bead.legs) if (fraction > leg.until) return leg
  const last = bead.legs[bead.legs.length - 1]
  // Exactly on the end of the run, which is a tick and therefore a reading: hold it there.
  return fraction >= last.until - 1e-9 ? last : null
}

/** Whether any of a drop at this point is still over the glass. */
function onPane(p: Vec): boolean {
  return Math.abs(p.x - 0.5) < 0.5 + BEAD_R && Math.abs(p.y - 0.5) < 0.5 + BEAD_R
}

/**
 * The pane with `fraction` of the rest still to go: every drop that is over the glass,
 * and the bodies they make up.
 *
 * The schedule and the stir are added here and nowhere else, so a drop is at one place at
 * one moment however it is asked for. A drop wholly past the rim is left out, which is how
 * a shedding empties and a gathering starts empty — the pane keeps nothing it has let go
 * of, and the rim itself does the cutting off.
 */
export function fieldAt(plan: BeadPlan, fraction: number): BeadField {
  const left = clamp01(fraction)
  const stir = swayAt(plan.stirFrom + plan.stirSlope * left, plan.stir)
  const beads: LiveBead[] = []
  const held = new Map<number, Vec[]>()
  for (const bead of plan.beads) {
    const leg = legAt(bead, left)
    if (!leg) continue
    const p = add(walk(leg, left), stir[bead.id])
    if (!onPane(p)) continue
    beads.push({ id: bead.id, x: p.x, y: p.y, body: leg.body, mate: leg.mate, loose: leg.loose })
    const kin = held.get(leg.body)
    if (kin) kin.push(p)
    else held.set(leg.body, [p])
  }
  const bodies = [...held].map(([id, points]) => {
    const at = middleOf(points)
    return { id, mass: points.length, x: at.x, y: at.y, r: bodyR(points.length) }
  })
  return { beads, bodies }
}

/* ------------------------------------------------------------- laying it out */

/** The ring the outer drops start on, as a share of the pane, measured from its middle. */
const RING = 0.34

/** How far they wander off their even spacing, in radians, so seven never read as a hexagon. */
const ANGLE_JITTER = 0.12

/** And off the ring itself, as a share of its radius. */
const RING_JITTER = 0.08

/** How far the middle drop sits off the exact centre, as a share of the pane. */
const CENTRE_WOBBLE = 0.05

/**
 * Where a coalescence opens: one drop near the middle and the rest around it, each nudged
 * off its exact place, and the whole field slid onto the centre of the pane by its own
 * centre of mass — which no join below ever moves, and which is therefore the whole reason
 * the last body ends up dead centre.
 */
function layout(rng: () => number): Vec[] {
  const spread = (amount: number) => (rng() * 2 - 1) * amount
  const wobble = rng() * TAU
  const points: Vec[] = [
    {
      x: MIDDLE.x + Math.cos(wobble) * CENTRE_WOBBLE * rng(),
      y: MIDDLE.y + Math.sin(wobble) * CENTRE_WOBBLE * rng(),
    },
  ]
  const turn = rng() * TAU
  const around = BEAD_COUNT - 1
  for (let i = 0; i < around; i++) {
    const angle = turn + (i / around) * TAU + spread(ANGLE_JITTER)
    const radius = RING * (1 + spread(RING_JITTER))
    points.push({
      x: MIDDLE.x + Math.cos(angle) * radius,
      y: MIDDLE.y + Math.sin(angle) * radius,
    })
  }
  const drift = sub(MIDDLE, middleOf(points))
  return points.map((p) => add(p, drift))
}

/** Where each drop of a body sits about its centre once the pour is done, and the furthest any of them has to travel to get there. */
type Packing = { offsets: Map<number, Vec>; travel: number }

/**
 * The arrangement a body settles into: the drops where they already are, drawn in about
 * their shared centre until the outermost surface reaches exactly {@link bodyR}.
 *
 * Drawing them in rather than laying them out afresh is what keeps a pour short and keeps
 * it looking like one: nothing crosses anything, every drop moves the same share of the
 * way in, and a mass that swallowed a drop from the left is still a shade heavier on the
 * left when it has finished rounding up. Scaling also cannot move the centre it is
 * measured about, so the pour costs the field no momentum at all.
 */
function packing(mass: number, places: { id: number; at: Vec }[], about: Vec): Packing {
  const offsets = places.map((place) => ({ id: place.id, off: sub(place.at, about) }))
  const widest = Math.max(...offsets.map((o) => span(o.off)))
  const scale = widest > 0 ? Math.min(1, (bodyR(mass) - BEAD_R) / widest) : 1
  return {
    offsets: new Map(offsets.map((o) => [o.id, mul(o.off, scale)])),
    travel: widest * (1 - scale),
  }
}

/**
 * How far a drop heading this way has to get from `from` to be wholly off the pane: just
 * past the side it is pointing most at, and no further. That is what has a drop *gone* on
 * its own tick rather than a moment either side of it.
 *
 * The whisker past the rim is what keeps the tick from being a coin toss. Aimed at the
 * boundary exactly, the drop is neither on the pane nor off it on the tick and floating
 * point decides which; a whisker further out and it is unambiguously gone, a millionth of
 * the pane and some tens of microseconds early.
 */
function exitFrom(from: Vec, out: Vec): Vec {
  const edge = 0.5 + BEAD_R + 1e-6
  let t = Infinity
  if (out.x !== 0) t = Math.min(t, (0.5 + Math.sign(out.x) * edge - from.x) / out.x)
  if (out.y !== 0) t = Math.min(t, (0.5 + Math.sign(out.y) * edge - from.y) / out.y)
  return add(from, mul(out, t))
}

/* --------------------------------------------------------------- coalescence */

/** A body of liquid as the planner has it, at the top of a beat. */
type Body = {
  id: number
  drops: number[]
  /** Where its centre of mass is as the beat opens, and the velocity it carries in. */
  pos: Vec
  vel: Vec
  /** How much of this beat it still owes to a pour before it travels as one piece. */
  pouring: number
  /** Where each of its drops sits about that centre once the pour is done. */
  offsets: Map<number, Vec>
}

/**
 * How much of a beat a merge spends pouring: the pair has touched, the count has already
 * changed, and this is the two of them rounding up into one body.
 *
 * Long enough to be the event you watch — a good four seconds of a ninety-second rest —
 * and short enough that a body is one piece again well before it has anywhere else to be.
 */
const POUR = 0.42

/**
 * How much faster than a steady close a pair is travelling by the time it touches. Under
 * three because three is where a cubic stops being monotone and a drop would creep
 * backwards before setting off (see {@link walk}).
 */
const CLOSE_GAIN = 1.8

/**
 * And the same ceiling read off the pour instead: whatever the pair arrives doing has to
 * be motion the pour can absorb over the ground it has left, or the drops would sail past
 * where they are settling and swing back.
 */
const POUR_ABSORB = 2.5

/** The mean stir of one body's drops, which is what a target has to have taken out of it. */
function bodyStir(drops: number[], e: number, stir: number): Vec {
  const sway = swayAt(e, stir)
  return middleOf(drops.map((id) => sway[id]))
}

/**
 * The two bodies with the least glass between them, which are the two that join next.
 * Measured surface to surface rather than centre to centre, so a big body draws in a
 * neighbour the same way a small one does.
 */
function closestPair(bodies: Body[]): [Body, Body] {
  let best: [Body, Body] = [bodies[0], bodies[1]]
  let least = Infinity
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const gap =
        span(sub(bodies[j].pos, bodies[i].pos)) -
        bodyR(bodies[i].drops.length) -
        bodyR(bodies[j].drops.length)
      if (gap < least) {
        least = gap
        best = [bodies[i], bodies[j]]
      }
    }
  }
  return best
}

/**
 * Plan a whole rest of joining: seven drops laid out on the glass, the pair that closes on
 * each beat, and the pour that follows every one of them.
 *
 * A beat is a sixth of the rest, so the count falls at a steady rate and the last join
 * lands exactly on zero. What happens across a beat is that one pair closes the glass
 * between it — each of the two moving against its own mass, so a small drop comes to a big
 * one and the big one barely stirs — while everything else coasts on whatever momentum it
 * was left with. The pair meets surface to surface on the tick; the pour then carries the
 * closing motion on into the body they have become, and ends with the whole of it damped
 * out and the drops packed.
 *
 * Because a pair only ever closes on its own centre of mass, and a pour cannot move one at
 * all, the field never gains momentum it did not start with — which is none. That is what
 * has the last body sitting dead centre when the rest ends, and it is the same guarantee
 * the whole way down: nothing here is centred by being told to be.
 */
function planCoalescence(rng: () => number, stir: number): BeadPlan {
  const legs: Leg[][] = Array.from({ length: BEAD_COUNT }, () => [])
  let bodies: Body[] = layout(rng).map((pos, id) => ({
    id,
    drops: [id],
    pos,
    vel: ZERO,
    pouring: 0,
    offsets: new Map([[id, ZERO]]),
  }))
  let nextBody = BEAD_COUNT
  const beat = 1 / (BEAD_COUNT - 1)
  const pourFor = POUR * beat

  for (let step = 1; step < BEAD_COUNT; step++) {
    const opens = (step - 1) * beat
    const meets = step * beat
    const [a, b] = closestPair(bodies)
    const massA = a.drops.length
    const massB = b.drops.length
    const mass = massA + massB
    // The pair as one: where its centre of mass is, and the momentum it will hand on.
    const pairVel = mul(add(mul(a.vel, massA), mul(b.vel, massB)), 1 / mass)
    const pairAt = mul(add(mul(a.pos, massA), mul(b.pos, massB)), 1 / mass)
    const lands = add(pairAt, mul(pairVel, beat))
    const towards = heading(sub(b.pos, a.pos))
    const reach = bodyR(massA) + bodyR(massB)
    const gap = Math.max(0, span(sub(b.pos, a.pos)) - reach)
    // Touching on the tick, each of them having closed its share of the glass.
    const restA = sub(lands, mul(towards, (reach * massB) / mass))
    const restB = add(lands, mul(towards, (reach * massA) / mass))

    // Where the drops of both stand at that moment, and where the pour will take them.
    const places = [
      ...a.drops.map((id) => ({ id, at: add(restA, a.offsets.get(id)!) })),
      ...b.drops.map((id) => ({ id, at: add(restB, b.offsets.get(id)!) })),
    ]
    const packed = packing(mass, places, lands)
    const closing = Math.min(
      (CLOSE_GAIN * gap) / beat,
      pourFor > 0 ? (POUR_ABSORB * packed.travel) / pourFor : Infinity,
    )
    const velA = add(pairVel, mul(towards, (closing * massB) / mass))
    const velB = sub(pairVel, mul(towards, (closing * massA) / mass))

    for (const body of bodies) {
      const joining = body === a ? b.id : body === b ? a.id : null
      const rest = body === a ? restA : body === b ? restB : add(body.pos, mul(body.vel, beat))
      const vel = body === a ? velA : body === b ? velB : body.vel
      // A contact is a reading, so the pair aims at where it has to be *after* the stir has
      // had its say. Everything else lets the stir lie on top of the schedule untouched.
      const off = joining === null ? ZERO : bodyStir(body.drops, meets, stir)
      const opened = add(body.pos, mul(body.vel, body.pouring))
      for (const id of body.drops) {
        const seat = body.offsets.get(id)!
        legs[id].push({
          at: 1 - (opens + body.pouring),
          until: 1 - meets,
          from: add(opened, seat),
          to: sub(add(rest, seat), off),
          v0: body.vel,
          v1: vel,
          body: body.id,
          mate: joining,
          loose: false,
        })
      }
    }

    // And the pour: the pair carries on into itself, at the speed it arrived doing, until
    // the drops are packed and the closing motion is spent.
    const joined: Body = {
      id: nextBody++,
      drops: [...a.drops, ...b.drops],
      pos: lands,
      vel: pairVel,
      pouring: pourFor,
      offsets: packed.offsets,
    }
    const settles = add(lands, mul(pairVel, pourFor))
    for (const [body, rest, vel] of [
      [a, restA, velA],
      [b, restB, velB],
    ] as const) {
      const off = bodyStir(body.drops, meets, stir)
      for (const id of body.drops) {
        legs[id].push({
          at: 1 - meets,
          until: 1 - (meets + pourFor),
          from: sub(add(rest, body.offsets.get(id)!), off),
          to: add(settles, joined.offsets.get(id)!),
          v0: vel,
          v1: pairVel,
          body: joined.id,
          mate: null,
          loose: false,
        })
      }
    }

    bodies = bodies.filter((body) => body !== a && body !== b)
    for (const body of bodies) {
      body.pos = add(body.pos, mul(body.vel, beat))
      body.pouring = 0
    }
    bodies.push(joined)
  }

  return {
    beads: legs.map((own, id) => ({ id, legs: own })),
    count: BEAD_COUNT,
    stir,
    stirFrom: 1,
    stirSlope: -1,
  }
}

/* ------------------------------------------------------------------ shedding */

/**
 * How much of a beat passes between a drop tearing off the mass and the same drop being
 * wholly clear of the pane. Under one, so the mass has a moment alone before the next one
 * comes away: the tear and the leaving are two events rather than one.
 */
const FLIGHT = 0.75

/** And how much of a beat the tear itself takes — the neck stretching, and the mass letting go. */
const TEAR = 0.35

/**
 * The turn from one drop's way out to the next one's: the golden angle, so seven of them in
 * a row neither line up nor double back.
 */
const EXIT_TURN = Math.PI * (3 - Math.sqrt(5))

/** And how far off that turn each one wanders, in radians. */
const EXIT_JITTER = 0.3

/**
 * Plan a whole rest of shedding: a mass in the middle of the pane holding every drop,
 * tearing one off at a time and letting it cross the glass and pass out through the rim.
 *
 * The reading is what the middle still holds, and the tick is the *leaving* — the sevenths
 * of the rest are the moments a drop is wholly clear of the pane, the last of them on zero,
 * on glass with nothing left on it.
 *
 * A tear is the one place on these panes where momentum visibly changes hands. The drop
 * goes one way with everything it has; the mass, six times its weight, gives up a sixth as
 * much the other way, and the two of them together are as still as they were before —
 * their shared centre of mass does not move a hair while the neck is breaking. What
 * happens next is the only outside force these shapes admit: the pane holds the liquid, so
 * the mass rocks back out, slows, and is walked back to dead centre by the time the next
 * drop comes away.
 *
 * How far it rocks is the tell. A mass six times the weight of what it lets go gives barely
 * a twentieth of the pane; by the last tear the mass *is* one drop letting go of another,
 * and it goes exactly as far as the drop it throws. So the middle rocks harder the emptier
 * it gets, which is the reading and the physics saying the same thing. Every tear still
 * finds the whole mass exactly centred, which is what leaves this run safe to read
 * backwards — where the middle has to end up holding all seven dead centre as the rest
 * runs out.
 */
function planShedding(rng: () => number, stir: number): BeadPlan {
  const legs: Leg[][] = Array.from({ length: BEAD_COUNT }, () => [])
  const beat = 1 / BEAD_COUNT
  const tearFor = TEAR * beat
  const mass = 0
  let nextBody = 1
  let held = Array.from({ length: BEAD_COUNT }, (_, id) => id)
  let offsets = clump(BEAD_COUNT, rng)
  let pos = MIDDLE
  let vel = ZERO
  let since = 0
  let turn = rng() * TAU

  for (let step = 1; step <= BEAD_COUNT; step++) {
    const tears = (step - FLIGHT) * beat
    const parted = tears + tearFor
    const gone = step * beat

    // What the pane holds, settling back onto the middle from whatever the last tear did to
    // it, and dead still by the time this one starts. Where the mass sits *is* the reading
    // here, so the middle it aims for is the one it will be at once the stir has had its
    // say — every tear finds the mass exactly centred, however the drops in it are jostling.
    const heart = sub(MIDDLE, bodyStir(held, tears, stir))
    for (const id of held) {
      const seat = offsets.get(id)!
      legs[id].push({
        at: 1 - since,
        until: 1 - tears,
        from: add(pos, seat),
        to: add(heart, seat),
        v0: vel,
        v1: ZERO,
        body: mass,
        mate: null,
        loose: false,
      })
    }

    const angle = turn + (rng() * 2 - 1) * EXIT_JITTER
    turn += EXIT_TURN
    const out: Vec = { x: Math.cos(angle), y: Math.sin(angle) }
    // Whichever drop is already lying that way is the one that comes off.
    const goes = held.reduce((best, id) => {
      const seat = offsets.get(id)!
      const bestSeat = offsets.get(best)!
      return seat.x * out.x + seat.y * out.y > bestSeat.x * out.x + bestSeat.y * out.y ? id : best
    }, held[0])
    const stays = held.filter((id) => id !== goes)
    const whole = held.length

    if (stays.length === 0) {
      // The last drop has no mass left to come off, so it simply leaves. Still accelerating
      // as it crosses the rim, which is what has it read as flung rather than parked.
      const off = swayAt(gone, stir)[goes]
      const edge = exitFrom(heart, out)
      const flight = gone - tears
      legs[goes].push({
        at: 1 - tears,
        until: 1 - gone,
        from: heart,
        to: sub(edge, off),
        v0: ZERO,
        v1: mul(out, (2 * span(sub(edge, heart))) / flight),
        body: mass,
        mate: null,
        loose: true,
      })
      held = []
      break
    }

    // Where the drop has to get to be clear of what it is leaving, and where that leaves the
    // rest of the mass: their shared centre stays exactly where it was, so the further the
    // drop goes the further the mass is pushed the other way.
    const clear = bodyR(stays.length) + BEAD_R
    const reach = (clear * (whole - 1)) / whole
    const stood = add(heart, mul(out, reach))
    const shoved = sub(heart, mul(out, reach / (whole - 1)))
    const edge = exitFrom(stood, out)
    const coast = gone - parted
    const speed = span(sub(edge, stood)) / coast
    const flung = mul(out, speed)
    const recoil = mul(out, -speed / (whole - 1))
    const leaving = nextBody++
    const packed = packing(
      stays.length,
      stays.map((id) => ({ id, at: add(heart, offsets.get(id)!) })),
      middleOf(stays.map((id) => add(heart, offsets.get(id)!))),
    )

    legs[goes].push({
      at: 1 - tears,
      until: 1 - parted,
      from: add(heart, offsets.get(goes)!),
      to: stood,
      v0: ZERO,
      v1: flung,
      body: leaving,
      mate: mass,
      loose: false,
    })
    // A leaving is a reading too, so the flight aims at where the rim has to lose the last of
    // it after the stir has had its say.
    legs[goes].push({
      at: 1 - parted,
      until: 1 - gone,
      from: stood,
      to: sub(edge, swayAt(gone, stir)[goes]),
      v0: flung,
      v1: flung,
      body: leaving,
      mate: mass,
      loose: true,
    })
    for (const id of stays) {
      legs[id].push({
        at: 1 - tears,
        until: 1 - parted,
        from: add(heart, offsets.get(id)!),
        to: add(shoved, packed.offsets.get(id)!),
        v0: ZERO,
        v1: recoil,
        body: mass,
        mate: leaving,
        loose: false,
      })
    }

    held = stays
    offsets = packed.offsets
    pos = shoved
    vel = recoil
    since = parted
  }

  return {
    beads: legs.map((own, id) => ({ id, legs: own })),
    count: BEAD_COUNT,
    stir,
    stirFrom: 1,
    stirSlope: -1,
  }
}

/**
 * The arrangement a shedding opens on: one drop in the middle and the rest evenly about it,
 * packed so the mass reads exactly {@link bodyR} across. Evenly spaced on purpose — a ring
 * that sums to nothing is a mass whose centre is the middle of the pane, which is where the
 * reading lives and where a gathering has to end.
 */
function clump(mass: number, rng: () => number): Map<number, Vec> {
  const radius = bodyR(mass) - BEAD_R
  const turn = rng() * TAU
  const around = mass - 1
  const offsets = new Map<number, Vec>([[0, ZERO]])
  for (let i = 0; i < around; i++) {
    const angle = turn + (i / around) * TAU
    offsets.set(i + 1, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
  }
  return offsets
}

/* ------------------------------------------------------- turning a plan over */

/**
 * A plan run backwards: a coalescence turned into a fission, or a shedding into drops
 * arriving out of the dark instead of leaving into it.
 *
 * Every leg is walked the other way — it starts where it finished, at the velocity it
 * finished with, reversed — which is sound in a way a second schedule written out by hand
 * would not be. Momentum conservation is the same law read backwards, so a pour becomes a
 * body pushing itself apart and a tear becomes a drop diving in, and the mass that recoiled
 * from throwing one off now leans out to meet one coming.
 *
 * The times cannot simply be negated, though. A run's events are evenly spaced with the
 * last of them on zero, so mirroring about one would put the *first* event of the run
 * backwards on zero: the payoff a beat early, and a dead beat at the end. Mirroring about
 * the first event instead lands the last of them exactly on zero and leaves the still beat
 * where it was — at the top of the run, before anything has happened.
 */
export function reversePlan(plan: BeadPlan): BeadPlan {
  const first = Math.max(...plan.beads.flatMap((bead) => bead.legs.map((leg) => leg.until)))
  const opening = (legs: Leg[]): Leg[] => {
    const [lead] = legs
    if (lead.at >= 1) return legs
    // The beat before anything happens, which a mirrored run always has: whatever the drop
    // was doing when the rest began, carried on backwards at the same speed. A body at rest
    // simply sits there — the still beat at the top of a fission — and a drop already on its
    // way in comes from further out, which is where a gathering finds its first one.
    const run = 1 - lead.at
    return [
      {
        ...lead,
        at: 1,
        until: lead.at,
        from: sub(lead.from, mul(lead.v0, run)),
        to: lead.from,
        v1: lead.v0,
      },
      ...legs,
    ]
  }
  return {
    count: plan.count,
    stir: plan.stir,
    // The stir has to be turned over with the schedule, or the targets that had it taken out
    // of them would be aiming at a stir that is no longer there.
    stirFrom: 1 - first,
    stirSlope: 1,
    beads: plan.beads.map((bead) => ({
      id: bead.id,
      legs: opening(
        [...bead.legs].reverse().map((leg) => ({
          at: first - leg.until,
          until: first - leg.at,
          from: leg.to,
          to: leg.from,
          v0: mul(leg.v1, -1),
          v1: mul(leg.v0, -1),
          body: leg.body,
          mate: leg.mate,
          loose: leg.loose,
        })),
      ),
    })),
  }
}

/* --------------------------------------------------------- vetting a plan */

/** Glass two bodies that are not each other's business have to keep between them. */
const KEEP = 0.045

/** How finely a plan is swept when it is checked — close enough that nothing crosses between two samples. */
const SWEEP = 301

/**
 * Whether a plan keeps its own rules the whole way through: no drop over the rim that has no
 * business crossing it, and no glass closing between two bodies that were never meant to
 * meet.
 *
 * This is where the stir is answered for. Everything else here is exact by construction —
 * the contacts, the count, the centre of mass — but a stray of a couple of percent laid over
 * seven drops can still bring two of them near enough for the goo filter to grow a neck, and
 * a neck that grows and then breaks reads as a join that did not take. Rather than argue
 * that it cannot happen, the plan is swept and thrown away if it does.
 *
 * A pair is let off when the two drops are in the same body, which is what a body *is*, and
 * when one of them names the other as the body it is closing on or tearing away from.
 */
function holds(plan: BeadPlan, margin: number): boolean {
  for (let i = 0; i <= SWEEP; i++) {
    const { beads } = fieldAt(plan, 1 - i / SWEEP)
    for (const bead of beads) {
      if (bead.loose) continue
      if (Math.abs(bead.x - 0.5) + BEAD_R > 0.5) return false
      if (Math.abs(bead.y - 0.5) + BEAD_R > 0.5) return false
    }
    for (let a = 0; a < beads.length; a++) {
      for (let b = a + 1; b < beads.length; b++) {
        const one = beads[a]
        const other = beads[b]
        if (one.body === other.body) continue
        if (one.mate === other.body || other.mate === one.body) continue
        if (gapBetween(one, other) < margin) return false
      }
    }
  }
  return true
}

/**
 * A plan that holds, out of however many it takes: the layout is rolled again, and failing
 * that the stir is turned down, until the sweep is happy.
 *
 * The ladder ends where a plan cannot fail — no stir at all, and nothing but the schedule,
 * which keeps its glass by construction — so this always terminates with something sound.
 */
function build(make: (rng: () => number, stir: number) => BeadPlan, rng: () => number): BeadPlan {
  const ladder: [number, number][] = [
    [1, KEEP],
    [1, KEEP * 0.5],
    [0.7, KEEP * 0.5],
    [0.7, 0],
    [0.35, 0],
    [0, 0],
  ]
  let last = make(rng, 1)
  if (holds(last, KEEP)) return last
  for (const [stir, margin] of ladder) {
    for (let tries = 0; tries < 5; tries++) {
      last = make(rng, stir)
      if (holds(last, margin)) return last
    }
  }
  return last
}

/* -------------------------------------------------------------- the four runs */

/** Seven drops joining a pair at a time, down to one body dead centre as the rest ends. */
export function createCoalescence(rng: () => number = Math.random): BeadPlan {
  return build(planCoalescence, rng)
}

/** That run backwards: one body coming apart into seven, the last pair parting on zero. */
export function createFission(rng: () => number = Math.random): BeadPlan {
  return build((seed, stir) => reversePlan(planCoalescence(seed, stir)), rng)
}

/** A mass in the middle letting a drop go every seventh of the rest, each out through the rim. */
export function createShedding(rng: () => number = Math.random): BeadPlan {
  return build(planShedding, rng)
}

/** And that backwards: drops arriving out of the dark into a mass that ends up holding all seven. */
export function createGathering(rng: () => number = Math.random): BeadPlan {
  return build((seed, stir) => reversePlan(planShedding(seed, stir)), rng)
}
