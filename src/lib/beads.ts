/**
 * The beads the glass-bead rest shapes are made of (see components/RestShapes).
 *
 * A pane of black glass with beads of it lying on the surface, and what tells the
 * time is *how many*. Two schedules live here, and either of them can be read
 * forwards or backwards, which is four shapes:
 *
 *  - `beads` — a coalescence. Seven beads drift together, two of them touching and
 *    becoming one at every sixth of the rest, until a single bead is left dead
 *    centre as the clock reaches zero.
 *  - `split` — that schedule read backwards. One bead breaks into seven, the last
 *    pair coming apart exactly at zero.
 *  - `shed` — a mass in the middle pinching off a bead at a time, each of them
 *    crossing the glass and passing out through the rim. The seventh is clear of the
 *    pane at zero, and nothing is left on it.
 *  - `gather` — that one backwards. Beads arrive from beyond the rim, one every
 *    seventh of the rest, into a mass that ends up holding all seven.
 *
 * Whichever way round, the reading is a count and never a level: seven of
 * something, then six, and every step of it is an event you can watch land — a pair
 * touching, a bead pinching off, a bead crossing the rim. Nothing has to be judged
 * against the vessel around it, because four beads is four beads.
 *
 * Beads join and come apart like drops rather than like discs: a bead's radius comes
 * from its volume, so two joining make one about a quarter wider rather than half
 * again as wide. That is also what leaves the pane room to work in — conserving area
 * instead would keep the beads covering exactly as much glass at the end as at the
 * start, and a field with no slack in it has nowhere to close into.
 *
 * A run is worked out once, when the rest starts, as a schedule of intervals: every
 * bead it will hold knows when it appears, when it goes, and where it is at both of
 * those moments. {@link beadsAt} is a pure lookup into that, and a plan
 * can be turned end for end ({@link reversePlan}) to be run the other way. Nothing is
 * simulated and nothing accumulates, so a shape is correct at whatever fraction it
 * is asked about — a rest resumed after a reload picks up exactly where it should
 * be, and the last event of the run lands on the tick rather than a frame or two
 * either side of it.
 */

/**
 * Beads the pane starts with: one in the middle and six around it. Also the number
 * of merges plus one, so each merge is a sixth of the rest — slow enough that the
 * count is worth reading, often enough that the next one is never far off.
 */
export const BEAD_COUNT = 7

/**
 * Radius of the single bead left at the end, as a share of the pane. Every other
 * radius is derived from this one (see `radiusOf`), so this is the dial for how big
 * the whole field reads — a bead two fifths of the pane across at the end, and beads
 * a fifth of it across at the start.
 *
 * It is also half of the pane's only real constraint. The beads that squeeze past
 * each other on their way across do so with about two pixels to spare at phone
 * size, and both this and {@link RING} were settled against that: bigger beads, or a
 * tighter ring, and a pane every so often has two beads slide through each other,
 * which reads as a join that didn't take.
 */
const ROOT_R = 0.195

/** The ring the outer beads start on, as a share of the pane, measured from its middle. See {@link ROOT_R} for what sets it. */
const RING = 0.34

/** How far the ring's beads wander off their even spacing, in radians, so seven beads never read as a hexagon. */
const ANGLE_JITTER = 0.12

/** And off the ring itself, as a share of its radius. */
const RING_JITTER = 0.08

/** How far the middle bead sits off the exact centre, as a share of the pane. */
const CENTRE_WOBBLE = 0.05

/** The middle of the pane, in the 0–1 pane units everything here uses. */
const MIDDLE = { x: 0.5, y: 0.5 } as const

export type Point = { x: number; y: number }

/** A bead's whole life: what it is, where it goes, and when each of those happens. */
export type Bead = {
  /** Its place in the schedule. Stable, so the shape can key an element on it. */
  id: number
  /** How many of the beads the pane started with have gone into it. */
  mass: number
  /** Radius as a share of the pane. Fixed for its whole life — beads grow by joining, never by swelling. */
  r: number
  /** The remaining fraction of the rest when it appears; 1 for the beads the pane starts with. */
  bornAt: number
  /** And when it merges away, or null for the one bead left at the end. */
  mergesAt: number | null
  /** Where it appears. */
  from: Point
  /** Where it comes to rest against its partner, exactly touching it. Its `from` for the last bead. */
  to: Point
}

/** A whole rest's worth of beads, planned out — what one of the shapes here draws from. */
export type BeadPlan = {
  /** Every bead the run will ever hold, in the order they appear. */
  beads: Bead[]
  /** How many of the pane's beads the run accounts for, which is always {@link BEAD_COUNT}. */
  count: number
  /** How its beads cross their own lives — see {@link EASES}. */
  ease: BeadEase
}

/** Slowest first, for a run closing; quickest first, for one coming apart. */
export type BeadEase = 'closing' | 'opening'

const TAU = Math.PI * 2

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** A bead holding `mass` of the pane's beads, sized by volume rather than by area. */
function radiusOf(mass: number): number {
  return ROOT_R * Math.cbrt(mass / BEAD_COUNT)
}

/** Glass between two beads' surfaces, at the positions given — negative if they overlap. */
export function gapBetween(a: { r: number }, at: Point, b: { r: number }, bt: Point): number {
  return Math.hypot(bt.x - at.x, bt.y - at.y) - a.r - b.r
}

/* --------------------------------------------------------------- coalescence */

/**
 * Where the beads start: one near the middle and the rest evenly around it, each
 * nudged off its exact place. The nudges are deliberately small — the ring is only
 * just wider than the beads standing on it, and jitter big enough to really scatter
 * them is also big enough for two neighbours to start out overlapping, which reads
 * as a merge that has already happened.
 */
function layout(rng: () => number): Point[] {
  const spread = (amount: number) => (rng() * 2 - 1) * amount
  const wobble = rng() * TAU
  const points: Point[] = [
    {
      x: MIDDLE.x + Math.cos(wobble) * CENTRE_WOBBLE * rng(),
      y: MIDDLE.y + Math.sin(wobble) * CENTRE_WOBBLE * rng(),
    },
  ]
  // The whole ring is turned by a random angle, so two rests running don't open
  // with the same arrangement even though they open with the same shape.
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
  // Slide the field onto the middle of the pane by its own centre of mass, which no
  // merge below ever moves — so this, and nothing else, is what has the last bead
  // sitting dead centre when the rest ends.
  const mean = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  }
  return points.map((p) => ({
    x: p.x + MIDDLE.x - mean.x,
    y: p.y + MIDDLE.y - mean.y,
  }))
}

/**
 * The two beads with the least glass between them, which are the two that join
 * next. Measured surface to surface rather than centre to centre, so a big bead
 * draws in a neighbour the same way a small one does — and measured from where the
 * beads *appeared*, since where they are heading is the thing being decided here.
 */
function closestPair(live: Bead[]): [Bead, Bead] {
  let best: [Bead, Bead] = [live[0], live[1]]
  let least = Infinity
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const gap = gapBetween(live[i], live[i].from, live[j], live[j].from)
      if (gap < least) {
        least = gap
        best = [live[i], live[j]]
      }
    }
  }
  return best
}

/**
 * Plan a whole rest's worth of joining: the beads the pane starts with, every bead
 * they become, and the moment and the place of each join.
 */
export function createCoalescence(rng: () => number = Math.random): BeadPlan {
  const beads: Bead[] = layout(rng).map((from, id) => ({
    id,
    mass: 1,
    r: radiusOf(1),
    bornAt: 1,
    mergesAt: null,
    from,
    to: from,
  }))
  /** The beads whose merge hasn't been decided yet — which is also every bead still on the pane. */
  let live = [...beads]

  for (let step = 1; step < BEAD_COUNT; step++) {
    // Evenly spaced, so the count falls at a steady rate and the last merge lands
    // exactly on zero rather than a beat either side of it.
    const at = Math.max(0, 1 - step / (BEAD_COUNT - 1))
    const [a, b] = closestPair(live)
    // The pair closes the glass between them, each moving against its own mass — so
    // two small beads come to each other and a small one comes to a big one, which
    // barely stirs. That is what keeps the pair's centre of mass exactly where it
    // was, and with it the whole pane's.
    const mass = a.mass + b.mass
    const dx = b.from.x - a.from.x
    const dy = b.from.y - a.from.y
    const apart = Math.hypot(dx, dy) || 1
    const close = Math.max(0, apart - a.r - b.r)
    const ux = (dx / apart) * close
    const uy = (dy / apart) * close
    a.mergesAt = at
    a.to = {
      x: a.from.x + (ux * b.mass) / mass,
      y: a.from.y + (uy * b.mass) / mass,
    }
    b.mergesAt = at
    b.to = {
      x: b.from.x - (ux * a.mass) / mass,
      y: b.from.y - (uy * a.mass) / mass,
    }

    // And the bead they become takes over that centre of mass — not the point where
    // the surfaces met, which is out on the boundary between them. A bead placed
    // there would stand half outside the pair it came from, over glass another bead
    // may well be sitting on.
    const from = {
      x: (a.from.x * a.mass + b.from.x * b.mass) / mass,
      y: (a.from.y * a.mass + b.from.y * b.mass) / mass,
    }
    const joined: Bead = {
      id: beads.length,
      mass,
      r: radiusOf(mass),
      bornAt: at,
      mergesAt: null,
      from,
      to: from,
    }
    beads.push(joined)
    live = live.filter((bead) => bead !== a && bead !== b)
    live.push(joined)
  }

  return { beads, count: BEAD_COUNT, ease: 'closing' }
}

/* ------------------------------------------------------------------ shedding */

/**
 * How much of a beat a shed bead spends crossing the glass, the rest of the beat
 * being the mass sitting alone. Under one so the pane has a moment of stillness to
 * open on, and a breath between one bead going and the next coming off — the pinch
 * and the leaving are two events rather than one.
 */
const FLIGHT = 0.75

/**
 * The turn from one bead's way out to the next one's: the golden angle, so seven of
 * them in a row neither line up nor double back on each other.
 */
const EXIT_TURN = Math.PI * (3 - Math.sqrt(5))

/** And how far off that turn each one wanders, in radians. */
const EXIT_JITTER = 0.3

/**
 * How far from the middle a bead of radius `r` has to get to be wholly off a square
 * pane, heading in direction (`cos`, `sin`): just past the side it is pointing most
 * at, and no further. That is what has a bead *gone* on its own tick instead of a
 * moment either side of it — and the pane's corners are rounded, so if anything it
 * is out of sight a hair early.
 */
function exitDistance(cos: number, sin: number, r: number): number {
  return (0.5 + r) / Math.max(Math.abs(cos), Math.abs(sin))
}

/**
 * Plan a whole rest's worth of shedding: a mass in the middle of the pane holding
 * every bead, pinching one off at a time and letting it go out through the rim.
 *
 * The reading is what the middle still holds — seven beads' worth of glass, then six
 * — and since a bead's radius comes from its volume, that reads as the mass visibly
 * shrinking rather than as anything anyone has to count. What lands on the tick is
 * the *leaving*: the sevenths of the rest are the moments a bead is wholly clear of
 * the pane, and the seventh of those is zero, on glass with nothing left on it.
 *
 * A bead pinches off three quarters of a beat before it goes, so nothing here
 * overlaps in time: the mass sits, drops a bead, that bead crosses the glass, and the
 * mass sits again. Nor can anything overlap in space — a shed bead appears exactly
 * touching what the mass has become and heads straight out from it, so the only gap
 * it ever closes is the one behind it.
 */
export function createShedding(rng: () => number = Math.random): BeadPlan {
  const beads: Bead[] = []
  const beat = 1 / BEAD_COUNT
  const unit = radiusOf(1)
  let turn = rng() * TAU
  /** When the mass last changed, which is when the mass standing now appeared. */
  let held = 1
  for (let step = 1; step <= BEAD_COUNT; step++) {
    /** What the middle is left holding once this bead is off it. */
    const rest = BEAD_COUNT - step
    const goesAt = Math.max(0, 1 - step * beat)
    const pinchAt = goesAt + beat * FLIGHT
    // The mass as it stands until this pinch. Dead centre, and the one thing on the
    // pane that never moves: it is the pane's reading, and a reading shouldn't drift.
    beads.push({
      id: beads.length,
      mass: rest + 1,
      r: radiusOf(rest + 1),
      bornAt: held,
      mergesAt: pinchAt,
      from: { ...MIDDLE },
      to: { ...MIDDLE },
    })
    held = pinchAt

    const angle = turn + (rng() * 2 - 1) * EXIT_JITTER
    turn += EXIT_TURN
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Off the surface of what the mass has just become — or out of the middle itself
    // for the last bead, which has no mass left to come off.
    const seat = rest > 0 ? radiusOf(rest) + unit : 0
    const out = exitDistance(cos, sin, unit)
    beads.push({
      id: beads.length,
      mass: 1,
      r: unit,
      bornAt: pinchAt,
      mergesAt: goesAt,
      from: { x: MIDDLE.x + cos * seat, y: MIDDLE.y + sin * seat },
      to: { x: MIDDLE.x + cos * out, y: MIDDLE.y + sin * out },
    })
  }

  return { beads, count: BEAD_COUNT, ease: 'closing' }
}

/* ------------------------------------------------------------ reading a plan */

/** A bead as it stands at one moment of the rest. */
export type LiveBead = {
  id: number
  mass: number
  /** Radius as a share of the pane. */
  r: number
  /** Centre, in the same pane units — 0.5, 0.5 is the middle of the glass. */
  x: number
  y: number
}

/**
 * How far along its journey a bead is, given how much of its life has gone by.
 *
 * A run that is closing goes as the square, so a bead barely creeps when it appears
 * and is at its quickest as it touches: beads are *drawn* together, and something
 * closing at a steady rate reads as a mechanism instead. It also puts the stillest
 * moments of the rest right after each event, which is exactly where there is
 * something else to look at.
 *
 * A run that is coming apart takes that curve turned over, because a bead leaving
 * another is pushed rather than drawn: quickest as it goes, and settling into its
 * place. Which of the two a plan uses is the plan's own business (see
 * {@link reversePlan}) — a journey played backwards has to be eased backwards too,
 * or it reads as the other journey shown in reverse.
 */
const EASES: Record<BeadEase, (p: number) => number> = {
  closing: (p) => p * p,
  opening: (p) => 1 - (1 - p) * (1 - p),
}

/**
 * The beads on the pane with `fraction` of the rest still to go, each carried to
 * where it should be by then.
 *
 * Oldest first, so a bead keeps its place in the list for its whole life and only
 * ever leaves it by joining another.
 */
export function beadsAt({ beads, ease }: BeadPlan, fraction: number): LiveBead[] {
  const left = clamp01(fraction)
  const curve = EASES[ease]
  const live: LiveBead[] = []
  for (const bead of beads) {
    // Born by now, and not yet merged. A join is one moment: the pair goes as the
    // bead they became arrives, so the count never reads high or low for a tick.
    if (bead.bornAt < left) continue
    if (bead.mergesAt !== null && bead.mergesAt >= left) continue
    // A bead that never merges is one the run ends with, so its life runs out at
    // zero — which is what carries the beads of a run coming apart out to where they
    // finish rather than leaving them stood at the point they came apart at.
    const life = bead.bornAt - (bead.mergesAt ?? 0)
    const p = life > 0 ? curve(clamp01((bead.bornAt - left) / life)) : 0
    live.push({
      id: bead.id,
      mass: bead.mass,
      r: bead.r,
      x: bead.from.x + (bead.to.x - bead.from.x) * p,
      y: bead.from.y + (bead.to.y - bead.from.y) * p,
    })
  }
  return live
}

/* ------------------------------------------------------- turning a plan over */

/**
 * A plan run backwards: a coalescence turned into a fission, or a shedding into
 * beads arriving out of the dark instead of leaving into it.
 *
 * Every bead's life is turned end for end — it appears where it went and goes where
 * it appeared — which is sound in a way a second schedule written out by hand
 * wouldn't be. Every guarantee a plan carries is about where its beads *are* and not
 * about the order the pane visits those places in, so two beads that never share
 * glass on the way together never share it on the way apart either.
 *
 * The times can't simply be taken from one, though. A plan's events are evenly
 * spaced with the last of them landing on zero, so mirroring about one would put the
 * *first* event of the run backwards on zero: the payoff a beat early, and then a
 * dead beat at the end with the reading not moving. Mirroring about the first event
 * instead lands the last of them exactly on zero, and leaves the still beat where it
 * was — at the top of the run, before anything has happened.
 */
export function reversePlan({ beads, count, ease }: BeadPlan): BeadPlan {
  // The first thing the plan does, which is the last moment anything merges away.
  const first = Math.max(...beads.map((bead) => bead.mergesAt ?? 0))
  return {
    count,
    ease: ease === 'closing' ? 'opening' : 'closing',
    beads: beads.map((bead) => ({
      ...bead,
      // The bead the run used to end on is the one it now opens with, and the beads
      // it used to open with are the ones it now ends on — so those never go.
      bornAt: bead.mergesAt === null ? 1 : first - bead.mergesAt,
      mergesAt: bead.bornAt === 1 ? null : first - bead.bornAt,
      from: bead.to,
      to: bead.from,
    })),
  }
}

/**
 * Plan a whole rest's worth of one bead coming apart into seven: a coalescence run
 * backwards.
 *
 * The count is the reading again, the other way up — one bead at the start, seven
 * when the rest is up, one more at every sixth of the way through, and the mass in
 * the middle shrinking as it lets each of them go. What lands on zero is the seventh
 * bead appearing: the last pair comes apart exactly there, so the pane shows the two
 * of them still touching on the tick, which is the mirror of the two beads that
 * touch at the end of a coalescence.
 */
export function createFission(rng: () => number = Math.random): BeadPlan {
  return reversePlan(createCoalescence(rng))
}

/**
 * Plan a whole rest's worth of beads arriving from beyond the pane, one every
 * seventh of it, into a mass in the middle that ends up holding all seven: a
 * shedding run backwards.
 *
 * The reading is what the middle has gathered so far, and the last bead lands in it
 * exactly at zero. It opens on the one thing no other shape here shows: an empty
 * pane, with the first bead already on its way in.
 */
export function createGathering(rng: () => number = Math.random): BeadPlan {
  return reversePlan(createShedding(rng))
}
