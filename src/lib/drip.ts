/**
 * The drip of the water-clock rest shapes (see components/WaterGlass): the drops
 * that fall through the neck, and the splash each one throws when it lands.
 *
 * A water clock tells its time exactly the way a sandglass does — the level in
 * each chamber — so nothing here touches either level. The sand shapes draw
 * nothing crossing their waist on purpose, because falling grains say nothing
 * about the time and a stream there pulls the eye to the one part of the shape
 * that can't be read. Water earns the exception by being countable: one drop at a
 * time, on a beat, and every splash the same size as the last, so what the eye
 * gets is a rhythm rather than a distraction — and the bottom half is never quite
 * still, which is the whole reason to watch a glass instead of a number.
 *
 * Consistency is the tuning, not an accident of it. The gap between drops barely
 * wanders, the spray leaves at the same speed every time, and the shove given to
 * the surface is one constant — a single splash is never the event, the steady
 * beat of them is. What varies is only what physics varies: a drop falling into an
 * empty chamber has further to fall than one landing in a full one, so the fall
 * shortens over the rest all by itself.
 *
 * Everything is in the glass's own units (see lib/waterclock) and in seconds; the
 * tuning is derived from the glass, so the same drip reads the same in a tall
 * glass and in a boxed one.
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Seconds between drops: slow enough to count, quick enough to be a rhythm. */
const GAP_S = 0.9

/**
 * How far that gap wanders, as a share of itself. Nearly nothing — a metronome is
 * the point — but a beat that never varies at all stops reading as water.
 */
const GAP_JITTER = 0.08

/** The first drop comes sooner, so the glass is already dripping on arrival. */
const FIRST_SHARE = 0.35

/** Downward pull, as a share of the glass's height per second squared. */
const GRAVITY_PER_HEIGHT = 1.6

/** Radius of a falling drop, and of a thrown speck, as shares of the width. */
const DROP_R_SHARE = 0.018
const SPECK_R_SHARE = 0.009

/**
 * How fast a drop can leave the neck sideways, as a share of the height per
 * second. This is the only reason splashes don't all land dead centre: a drop that
 * comes off the neck at a slight angle lands off to one side, so the ripples reach
 * the two walls out of step and the surface never settles into a standing pattern.
 */
const SWAY_PER_HEIGHT = 0.045

/** How fast a speck leaves the impact, as a share of the height per second. */
const THROW_PER_HEIGHT = 0.36

/** How much a speck's speed varies from that, as a share of itself. */
const THROW_VARY = 0.12

/** How long a speck lasts if it hasn't come back down by then, in seconds. */
const SPECK_LIFE_S = 0.7

/** The crown's width and height, as shares of the glass, and how long it lasts. */
const CROWN_W_SHARE = 0.07
const CROWN_H_SHARE = 0.042
const CROWN_LIFE_S = 0.42

/**
 * How far the surface is thrown where a drop lands, as a share of the height, and
 * how broad a bump that leaves, in wave nodes (see lib/tide). Small on purpose:
 * the ripples ring for several seconds, so a shove big enough to be impressive
 * once leaves the chamber churning by the fourth drop.
 */
const LIFT_SHARE = 0.024
const BUMP_NODES = 1.5

/** How far a drop stretches at full pelt, as a share of its own radius. */
const STRETCH = 0.55

/** The fall time that counts as full pelt, in seconds. */
const STRETCH_AT_S = 0.45

/**
 * Where one splash throws its spray: unit velocities, mirrored about the impact
 * and steepest in the middle, so the fan leaves the water symmetrically and the
 * crown between them reads as the middle of it.
 */
const SPRAY = [
  [-0.66, -0.75],
  [-0.34, -0.94],
  [0, -1],
  [0.34, -0.94],
  [0.66, -0.75],
] as const

/** Longest step simulated in one call; a backgrounded tab's backlog is dropped. */
const MAX_DT = 0.25

/** Most drops born in one call, so a long step can't flood the chamber. */
const MAX_PER_CALL = 3

/** A drop on its way down through the neck. */
export type Drop = { x: number; y: number; vx: number; vy: number }

/** A speck of spray thrown off an impact, alive until it lands or its time is up. */
export type Speck = { x: number; y: number; vx: number; vy: number; life: number }

/** The dome of water standing where a drop went in, `age` seconds old. */
export type Crown = { x: number; age: number }

/** The drip's numbers in one glass's units. See {@link dripTuning}. */
export type DripTuning = {
  gravity: number
  gap: number
  dropR: number
  speckR: number
  sway: number
  throwSpeed: number
  crownW: number
  crownH: number
  /** How far a landing throws the surface, and how broad a bump it leaves. */
  lift: number
  bump: number
}

export type Dripper = {
  tuning: DripTuning
  drops: Drop[]
  specks: Speck[]
  crowns: Crown[]
  /** Seconds until the next drop lets go of the neck. */
  wait: number
  rng: () => number
}

/** Where the drops come from, and what they land on. */
export type Spout = {
  /** The neck: where a drop lets go. */
  x: number
  y: number
  /**
   * The water surface at `x`, wave and all — not the flat line under it. A drop
   * lands on the water it can see, and the crown it throws up stands on the bump
   * it just made rather than hovering over it.
   */
  surfaceAt: (x: number) => number
  /** Whether there's still water above to fall. Nothing drips from a dry chamber. */
  flowing: boolean
}

/** The drip's numbers for a glass, so a tall one and a boxed one drip alike. */
export function dripTuning(glass: { width: number; height: number }): DripTuning {
  return {
    gravity: GRAVITY_PER_HEIGHT * glass.height,
    gap: GAP_S,
    dropR: DROP_R_SHARE * glass.width,
    speckR: SPECK_R_SHARE * glass.width,
    sway: SWAY_PER_HEIGHT * glass.height,
    throwSpeed: THROW_PER_HEIGHT * glass.height,
    crownW: CROWN_W_SHARE * glass.width,
    crownH: CROWN_H_SHARE * glass.height,
    lift: LIFT_SHARE * glass.height,
    bump: BUMP_NODES,
  }
}

/** `rng` is injectable so a test can drive a whole drip from known draws. */
export function createDripper(tuning: DripTuning, rng: () => number = Math.random): Dripper {
  return { tuning, drops: [], specks: [], crowns: [], wait: tuning.gap * FIRST_SHARE, rng }
}

/** A draw either side of zero, `spread` wide. */
const wander = (rng: () => number, spread: number) => (rng() * 2 - 1) * spread

/**
 * Advance the drip by `dt` seconds: let go of a drop if its beat has come, fall
 * everything already in the air, and land whatever reaches the water. `onSplash`
 * is called with the x a drop went in at, which is where the surface needs
 * shoving — the wave itself belongs to the caller (see lib/tide), since it is the
 * same surface the level is read off.
 */
export function stepDrip(
  d: Dripper,
  dt: number,
  spout: Spout,
  onSplash: (x: number) => void,
): void {
  const t = d.tuning
  const step = Math.max(0, Math.min(MAX_DT, dt))

  // The beat. Held rather than caught up on while nothing is flowing, so a glass
  // that ran dry doesn't fire a burst of drops if it fills again.
  d.wait -= step
  let born = 0
  while (spout.flowing && d.wait <= 0 && born < MAX_PER_CALL) {
    d.drops.push({ x: spout.x, y: spout.y, vx: wander(d.rng, t.sway), vy: 0 })
    d.wait += t.gap * (1 + wander(d.rng, GAP_JITTER))
    born++
  }
  if (d.wait <= 0) d.wait = t.gap

  d.drops = d.drops.filter((drop) => {
    drop.vy += t.gravity * step
    drop.x += drop.vx * step
    drop.y += drop.vy * step
    const surface = spout.surfaceAt(drop.x)
    if (drop.y < surface) return true
    // In it goes: the surface takes the shove, a crown stands up where it landed,
    // and the spray leaves on its fan.
    onSplash(drop.x)
    d.crowns.push({ x: drop.x, age: 0 })
    for (const [ux, uy] of SPRAY) {
      const speed = t.throwSpeed * (1 + wander(d.rng, THROW_VARY))
      d.specks.push({ x: drop.x, y: surface, vx: ux * speed, vy: uy * speed, life: SPECK_LIFE_S })
    }
    return false
  })

  d.specks = d.specks.filter((speck) => {
    speck.vy += t.gravity * step
    speck.x += speck.vx * step
    speck.y += speck.vy * step
    speck.life -= step
    // Gone when it drops back into the water, or when its time is up wherever it is.
    return speck.life > 0 && !(speck.vy > 0 && speck.y >= spout.surfaceAt(speck.x))
  })

  d.crowns = d.crowns.filter((crown) => {
    crown.age += step
    return crown.age < CROWN_LIFE_S
  })
}

const round = (n: number) => Math.round(n * 100) / 100

/** A drop or a speck: an ellipse, drawn as the two arcs SVG wants for one. */
function blob(x: number, y: number, rx: number, ry: number): string {
  const w = round(rx * 2)
  return [
    `M ${round(x - rx)} ${round(y)}`,
    `a ${round(rx)} ${round(ry)} 0 1 0 ${w} 0`,
    `a ${round(rx)} ${round(ry)} 0 1 0 ${-w} 0`,
    'Z',
  ].join(' ')
}

/**
 * The drops in the air, as one path. A falling drop is drawn stretched along its
 * fall and squashed across it by the same factor, so it keeps its own volume the
 * way water does instead of swelling on the way down.
 */
export function dropsPath(d: Dripper): string {
  const t = d.tuning
  return d.drops
    .map((drop) => {
      const stretch = 1 + STRETCH * clamp01(Math.abs(drop.vy) / (t.gravity * STRETCH_AT_S))
      return blob(drop.x, drop.y, t.dropR / stretch, t.dropR * stretch)
    })
    .join(' ')
}

/** And the spray, which is round: it is off the surface and no longer a stream. */
export function specksPath(d: Dripper): string {
  return d.specks.map((s) => blob(s.x, s.y, d.tuning.speckR, d.tuning.speckR)).join(' ')
}

/**
 * The crowns, as one stroked path: a dome standing on the water where a drop went
 * in, rising and then spreading back into the surface it came out of. It flattens
 * to nothing rather than fading, so the water closing over the impact is the end
 * of it.
 */
export function crownsPath(d: Dripper, surfaceAt: (x: number) => number): string {
  const t = d.tuning
  return d.crowns
    .map((crown) => {
      const p = clamp01(crown.age / CROWN_LIFE_S)
      // Up and back down over its life, and wider all the way. A quadratic's apex
      // is half its control point, hence the doubled height.
      const h = t.crownH * Math.sin(Math.PI * p) ** 0.6
      const w = t.crownW * (0.4 + 0.8 * p)
      const y = surfaceAt(crown.x)
      return `M ${round(crown.x - w)} ${round(y)} Q ${round(crown.x)} ${round(y - h * 2)} ${round(crown.x + w)} ${round(y)}`
    })
    .join(' ')
}
