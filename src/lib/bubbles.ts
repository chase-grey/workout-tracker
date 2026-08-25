/**
 * The bubbles in the 'tide' rest shape's water (see components/RestTimer), as a
 * simulation rather than as a set of animations.
 *
 * Every bubble here is one body with a position and a velocity, and the only things
 * that ever happen to it are forces: buoyancy pulling it up, the water's drag
 * holding it back, a lateral wobble because a rising bubble doesn't hold a straight
 * line, the walls of the vessel, and the other bubbles. Nothing about its life is
 * decided when it forms — how fast it climbs, whether it swallows a neighbour on the
 * way, how hard it hits the surface and what it does to the water when it gets there
 * all come out of the stepping. A bubble whose whole fate was drawn at birth reads as
 * a decoration; one that is plainly being pushed around reads as water.
 *
 * The physics is the real physics, at the level it can be felt:
 *
 * - Buoyancy is a *constant upward acceleration*, the same for every bubble. That
 *   looks wrong and isn't: the upward force goes as the volume of water displaced,
 *   and so does the effective mass of a bubble — the water it has to shove aside to
 *   move anywhere, its own gas weighing nothing — so the two cancel and size drops
 *   out of it.
 * - Drag is what tells the sizes apart: it goes as the frontal *area* against that
 *   mass's *volume*, so a small bubble is held back harder and settles at a lower
 *   terminal speed, as the square root of its radius. Big bubbles overtake small
 *   ones, which is what makes a chain out of a column and a merge out of a chain.
 * - A merge conserves volume and momentum, and nothing else. Two bubbles that touch
 *   are one bubble afterwards carrying the sum of what each carried, so its speed is
 *   the mass-weighted average of theirs — *below* the terminal speed of the bigger
 *   bubble it just became. So a merge looks like a merge: the new bubble sags for a
 *   moment, then accelerates away, and arrives at the surface with more behind it
 *   than either half would have had.
 *
 * Coordinates are the vessel's own 100 × 100 box (see lib/vessels), y down, and
 * speeds are per second in those units. The caller owns the water: where the surface
 * is above a given x — the *wave's* surface, so a passing trough pops a bubble early
 * — and where the walls are at a height.
 */

import type { Span } from './vessels'

/** Fixed simulation step. Every constant below is per second, not per step. */
const STEP_SECONDS = 1 / 120

/**
 * Ceiling on the steps one call may run, as in lib/tide: a backgrounded tab hands
 * back a huge `dt`, and replaying all of it would stall a frame on motion nobody
 * saw. The backlog is dropped instead.
 */
const MAX_STEPS_PER_CALL = 16

/**
 * The upward pull, in box units per second squared. Size-independent — see above —
 * so this one number is how urgent the whole water is.
 */
const BUOYANT_ACCEL = 40

/**
 * Drag, as the coefficient in `a = DRAG * v^2 / r`. Quadratic in speed and inverse
 * in radius, which between them set the terminal speed at `sqrt(BUOYANT_ACCEL * r /
 * DRAG)`: about 18 box units a second for the smallest bubble that forms and 33 for
 * a well-fed merged one, so crossing a full vessel takes a handful of seconds.
 */
const DRAG = 0.11

/** Speed kept when a bubble glances off a wall. Water is not a trampoline. */
const WALL_BOUNCE = 0.4

/** How far a bubble's edge stays off the glass, in box units. */
const WALL_MARGIN = 0.6

/** Diameter of a bubble as it forms, as a share of the vessel's width. */
const SPAWN_DIAMETER = { min: 1.8, max: 4.6 } as const

/** Higher means more of them form small, so the big ones are made rather than born. */
const SIZE_BIAS = 1.5

/**
 * Ceiling on a merged bubble's radius. Nothing physical: a bubble much wider than
 * this stops reading as a bubble in a vessel this size and starts reading as a hole
 * in the water, so a bubble already this big takes on nothing more.
 */
const MAX_RADIUS = 4.6

/** Ceiling on how many bubbles are in the water at once, so the pass stays cheap. */
const MAX_BUBBLES = 28

/**
 * How many bubbles a vent lets go at a time. A vent doesn't trickle, it belches: a
 * short train and then a long silence. That is both what one does and what this
 * shape needs — a train comes up close enough together to eat itself on the way, so
 * what reaches the line is one big bubble rather than four small ones, and the water
 * gets the seconds it needs to ring down before the next one.
 */
const TRAIN = { min: 2, max: 4 } as const

/** The gap between one bubble in a train and the next, in ms. */
const TRAIN_GAP_MS = { min: 170, max: 420 } as const

/** And how long the vent rests once a train is out, in ms. */
const IDLE_GAP_MS = { min: 3200, max: 7400 } as const

/** The first bubble comes sooner, so the water is already alive on arrival. */
const FIRST_GAP_MS = { min: 120, max: 700 } as const

/**
 * How far off its vent a bubble forms, in box units. Small on purpose: the point of
 * a vent is that its bubbles come up more or less on top of each other, so a fast
 * one has something to catch.
 */
const VENT_SCATTER = 0.9

/** Sideways kick a bubble leaves the floor with, in box units per second. */
const SPAWN_SPREAD = 4

/** How hard a bubble's wobble pushes it sideways, in box units per second squared. */
const SWAY_ACCEL = { min: 5, max: 18 } as const

/** And how fast that push swings from one side to the other, in radians a second. */
const SWAY_RATE = { min: 1.4, max: 3.6 } as const

/**
 * How much water a forming bubble needs over it, in its own diameters. A bubble is a
 * fixed size while the water is not: at the end of a rest the puddle left is
 * shallower than a bubble is tall, and one drawn there reads as a blob sitting in the
 * vessel rather than as anything rising through it. Vents keep their beat through the
 * shallows; they just come up empty.
 */
const SPAWN_CLEARANCE = 2.4

/** How long a new bubble takes to fade in, in seconds. */
const FADE_SECONDS = 0.16

/** The bubble whose burst is a full-strength splash: this big, arriving this fast. */
const POP_FULL = { r: 3.2, speed: 33 } as const

/** Higher keeps the small pops small, so an ordinary bubble only creases the line. */
const POP_BIAS = 1.15

/** How far a full-strength splash throws the surface, in box units — see lib/tide. */
const POP_LIFT = 11

/** Half-width of the bump it leaves there, in wave nodes: smallest bubble to largest. */
const POP_BUMP = { min: 1.3, max: 3.8 } as const

/** One bubble in the water. */
export type Bubble = {
  id: number
  /** Centre, in the vessel's box: x across, y down from the box's top. */
  x: number
  y: number
  /** Radius, in those units. */
  r: number
  /** Speed, in box units a second. Negative `vy` is upward. */
  vx: number
  vy: number
  /** Seconds since it formed, which is all the fade-in needs. */
  age: number
  /** How many bubbles have gone into it: 1 while it is still the one that formed. */
  merges: number
  /** The wobble: where it is in its swing, how fast it swings, how hard it pushes. */
  phase: number
  sway: number
  swayRate: number
}

/** A bubble breaking the surface, handed back so the caller can splash the water. */
export type Pop = {
  id: number
  /** Where it broke through, across the box. */
  x: number
  /** How big it was, and how fast it arrived. */
  r: number
  speed: number
  /** How big a splash that makes, 0–1 of a full crown. */
  strength: number
  /** What it does to the wave: how far it throws it, over how many nodes. */
  lift: number
  bump: number
}

/**
 * A place bubbles form: somewhere across the vessel, and the floor under it — which
 * is the vessel's own floor in a shape with a flat base, and a little way up it in
 * one that comes to a point, where there is no room down there for a bubble.
 */
export type Vent = { x: number; y: number }

export type Swarm = {
  bubbles: Bubble[]
  /** The vents, each with how long until its next bubble and how many are left in it. */
  vents: (Vent & { due: number; left: number })[]
  nextId: number
  /** Time handed in but not yet simulated, so odd frame rates stay in step. */
  carry: number
}

/** What the swarm needs to know about the water it is in, this frame. */
export type Water = {
  /** Where the surface is above `x` — the wave's surface, not the flat line. */
  surfaceAt: (x: number) => number
  /** Where the walls are at height `y`, or null outside the vessel. */
  spanAt: (y: number) => Span | null
}

/**
 * Open a vent at each of `vents`. One vent gives a single chain; a few give chains
 * that lean into each other, which is where most of the merges come from.
 */
export function createSwarm(vents: readonly Vent[], rng: () => number = Math.random): Swarm {
  return {
    bubbles: [],
    vents: vents.map((v) => ({
      ...v,
      due: between(FIRST_GAP_MS, rng()) / 1000,
      left: train(rng),
    })),
    nextId: 0,
    carry: 0,
  }
}

/**
 * Advance the swarm by `dt` seconds and hand back whatever burst through the surface
 * on the way. Fixed steps, so the same second of water is the same second of water
 * at any frame rate.
 */
export function stepSwarm(
  swarm: Swarm,
  water: Water,
  dt: number,
  rng: () => number = Math.random,
): Pop[] {
  const pops: Pop[] = []
  swarm.carry += Math.max(0, dt)
  let steps = 0
  while (swarm.carry >= STEP_SECONDS && steps < MAX_STEPS_PER_CALL) {
    advance(swarm, water, rng, pops)
    swarm.carry -= STEP_SECONDS
    steps++
  }
  if (swarm.carry >= STEP_SECONDS) swarm.carry = 0
  return pops
}

/** One fixed step: what forms, what moves, what joins, and what breaks through. */
function advance(swarm: Swarm, water: Water, rng: () => number, pops: Pop[]): void {
  vent(swarm, water, rng)
  for (const b of swarm.bubbles) {
    b.age += STEP_SECONDS
    b.phase += b.swayRate * STEP_SECONDS

    // Up by the same acceleration whatever its size, sideways by its own wobble.
    let ax = b.sway * Math.sin(b.phase)
    let ay = -BUOYANT_ACCEL

    // Drag against the direction of travel, quadratic in speed and inverse in
    // radius: this is the whole difference between a big bubble and a small one.
    const speed = Math.hypot(b.vx, b.vy)
    if (speed > 0) {
      const held = (DRAG * speed) / b.r
      ax -= held * b.vx
      ay -= held * b.vy
    }

    b.vx += ax * STEP_SECONDS
    b.vy += ay * STEP_SECONDS
    b.x += b.vx * STEP_SECONDS
    b.y += b.vy * STEP_SECONDS
  }
  swarm.bubbles = swarm.bubbles.filter((b) => walls(b, water))
  merge(swarm)
  swarm.bubbles = swarm.bubbles.filter((b) => {
    const pop = surfaced(b, water)
    if (pop) pops.push(pop)
    return !pop
  })
}

/** Let each vent that is due form a bubble, if there is water enough over it. */
function vent(swarm: Swarm, water: Water, rng: () => number): void {
  for (const v of swarm.vents) {
    v.due -= STEP_SECONDS
    if (v.due > 0) continue
    // Another out of the same train, or the long wait and a new one drawn for after it.
    v.left -= 1
    if (v.left > 0) {
      v.due = between(TRAIN_GAP_MS, rng()) / 1000
    } else {
      v.due = between(IDLE_GAP_MS, rng()) / 1000
      v.left = train(rng)
    }
    if (swarm.bubbles.length >= MAX_BUBBLES) continue

    const r = between(SPAWN_DIAMETER, rng() ** SIZE_BIAS) / 2
    const x = v.x + (rng() - 0.5) * 2 * VENT_SCATTER
    const y = v.y - r
    // Nothing forms where the water is shallower than the bubble needs, and nothing
    // forms in a pinch of the vessel narrower than the bubble is wide.
    if (v.y - water.surfaceAt(x) < r * 2 * SPAWN_CLEARANCE) continue
    const room = water.spanAt(y)
    if (!room || room[1] - room[0] < r * 2 + WALL_MARGIN * 2) continue

    swarm.bubbles.push({
      id: swarm.nextId++,
      x: clamp(x, room[0] + r + WALL_MARGIN, room[1] - r - WALL_MARGIN),
      y,
      r,
      vx: (rng() - 0.5) * 2 * SPAWN_SPREAD,
      vy: 0,
      age: 0,
      merges: 1,
      phase: rng() * Math.PI * 2,
      sway: between(SWAY_ACCEL, rng()),
      swayRate: between(SWAY_RATE, rng()),
    })
  }
}

/**
 * Keep a bubble inside the glass: off the wall it ran into, and going the other way
 * with most of its sideways speed spent. Where the vessel pinches narrower than the
 * bubble is wide it rides the middle instead — and where the walls have closed
 * altogether there is nowhere for it to be, so it is gone. False means drop it.
 */
function walls(b: Bubble, water: Water): boolean {
  const room = water.spanAt(b.y)
  if (!room) return false
  const width = room[1] - room[0]
  if (width < b.r) return false
  if (width < b.r * 2 + WALL_MARGIN * 2) {
    b.x = (room[0] + room[1]) / 2
    b.vx = 0
    return true
  }
  const lo = room[0] + b.r + WALL_MARGIN
  const hi = room[1] - b.r - WALL_MARGIN
  if (b.x < lo) {
    b.x = lo
    b.vx = Math.abs(b.vx) * WALL_BOUNCE
  } else if (b.x > hi) {
    b.x = hi
    b.vx = -Math.abs(b.vx) * WALL_BOUNCE
  }
  return true
}

/**
 * Join every pair of bubbles that is touching. Volume adds and momentum adds — mass
 * goes as volume, so the pair comes out of it carrying the mass-weighted average of
 * their speeds — and the survivor keeps the bigger one's identity, so on screen the
 * big bubble swallows the small one rather than both being replaced by a third.
 *
 * Biggest first, so a bubble climbing through a chain takes it one link at a time in
 * the order it reaches them.
 */
function merge(swarm: Swarm): void {
  const gone = new Set<number>()
  const order = [...swarm.bubbles].sort((a, b) => b.r - a.r)
  for (const a of order) {
    if (gone.has(a.id) || a.r >= MAX_RADIUS) continue
    for (const b of order) {
      if (b === a || gone.has(b.id) || b.r > a.r) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r) continue

      const ma = a.r ** 3
      const mb = b.r ** 3
      const m = ma + mb
      a.x = (a.x * ma + b.x * mb) / m
      a.y = (a.y * ma + b.y * mb) / m
      a.vx = (a.vx * ma + b.vx * mb) / m
      a.vy = (a.vy * ma + b.vy * mb) / m
      a.r = Math.cbrt(m)
      a.merges += b.merges
      // The wobble of the bigger one carries on; it is the one that survived.
      gone.add(b.id)
      if (a.r >= MAX_RADIUS) break
    }
  }
  if (gone.size) swarm.bubbles = swarm.bubbles.filter((b) => !gone.has(b.id))
}

/**
 * Whether a bubble has reached the surface, and what it does to it if so. Measured
 * against the wave over the bubble rather than against the flat line, so a trough
 * rolling over one pops it early and a crest holds it under a moment longer.
 */
function surfaced(b: Bubble, water: Water): Pop | null {
  if (b.y - b.r > water.surfaceAt(b.x)) return null
  const speed = Math.max(0, -b.vy)
  const strength = popStrength(b.r, speed)
  return {
    id: b.id,
    x: b.x,
    r: b.r,
    speed,
    strength,
    lift: strength * POP_LIFT,
    bump: between(POP_BUMP, b.r / POP_FULL.r),
  }
}

/**
 * How big a splash a bubble of radius `r` arriving at `speed` makes, 0–1. Both count
 * and neither is enough alone: a big bubble that laboured up and a small one that
 * rushed both only dent the line, and the crown worth looking up for needs a bubble
 * that grew on the way *and* came in fast. No floor under it — most bursts are meant
 * to be a crease in the surface and nothing more.
 */
export function popStrength(r: number, speed: number): number {
  const raw = (r / POP_FULL.r) * (Math.max(0, speed) / POP_FULL.speed)
  return clamp01(raw) ** POP_BIAS
}

/** Terminal rise speed for a bubble of radius `r`: where buoyancy and drag balance. */
export function terminalSpeed(r: number): number {
  return Math.sqrt((BUOYANT_ACCEL * Math.max(0, r)) / DRAG)
}

/** How far into its fade-in a bubble is, 0–1. */
export function bubbleOpacity(b: Bubble): number {
  return clamp01(b.age / FADE_SECONDS)
}

/** How many bubbles the next train out of a vent is. */
const train = (rng: () => number) =>
  TRAIN.min + Math.floor(rng() * (TRAIN.max - TRAIN.min + 1))

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const clamp01 = (n: number) => clamp(n, 0, 1)

const between = (range: { min: number; max: number }, at: number) =>
  range.min + clamp01(at) * (range.max - range.min)
