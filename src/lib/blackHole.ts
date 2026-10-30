/**
 * The geometry behind the black hole rest shape (see components/RestShapes).
 *
 * `eaten` throughout is how much of the rest has passed, 0 at the start and 1
 * when it's up — the countdown read the hole's way round.
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** A piece of orbiting matter, in the square viewBox's units. */
export type Debris = {
  /** Where on its orbit it starts, in degrees. */
  angle: number
  /** The orbit it starts on. */
  radius: number
  /** Its radius as a dot, before the tide gets hold of it. */
  size: number
  /** The `eaten` at which it is fully behind the horizon. */
  consumedAt: number
}

/** The horizon's radius before it has swallowed anything. */
export const HORIZON_REST = 8.5

/** The innermost starting orbit. Nothing starts inside it, and the horizon never reaches it. */
export const INNER_ORBIT = 23

/** How far inside the horizon a piece is pulled, so its stretched tail hides too. */
const HIDE_MARGIN = 2.5

/**
 * The horizon grows by the area it eats, exaggerated: eighteen dots together
 * add perhaps a sixth to its radius for real, which no one would notice. Tuned so
 * a full meal takes it from 8.5 to about 13, still well short of the inner orbit.
 */
const GROWTH = 5.5

/** A finite field, spread by the golden angle so no two line up. */
export const BLACK_HOLE_DEBRIS: readonly Debris[] = Array.from({ length: 18 }, (_, i) => ({
  angle: i * 137.508,
  radius: INNER_ORBIT + ((i * 7) % 22),
  size: 0.65 + (i % 4) * 0.22,
  consumedAt: 0.22 + (i / 17) * 0.78,
}))

/**
 * Kepler: a period grows with the three-halves power of the orbit, so the inner
 * ring laps the outer one. Innermost about twelve seconds, outermost about thirty.
 * Fixed per piece from its starting orbit — a CSS rotation can't speed up mid-fall.
 */
export function orbitPeriod(radius: number): number {
  return 0.106 * radius ** 1.5
}

/** How far a piece has been drawn in: 0 on its starting orbit, 1 once consumed. */
export function pullOf(piece: Debris, eaten: number): number {
  return clamp01(eaten / piece.consumedAt)
}

/** Whether a piece is behind the horizon. */
export function isConsumed(piece: Debris, eaten: number): boolean {
  return pullOf(piece, eaten) >= 1
}

/** The horizon's radius once everything due by `eaten` has gone in. */
export function horizonRadius(eaten: number, debris: readonly Debris[] = BLACK_HOLE_DEBRIS): number {
  const area = debris.reduce((sum, p) => sum + (isConsumed(p, eaten) ? p.size * p.size : 0), 0)
  return Math.sqrt(HORIZON_REST ** 2 + GROWTH * area)
}

/** What a piece looks like with `eaten` of the rest gone and the horizon at `horizon`. */
export type DebrisState = {
  /** Its current orbit. */
  radius: number
  /** Half-widths of the dot, across the orbit and along it, as fractions of `radius`. */
  across: number
  along: number
  /** Degrees of orbit its wake trails behind it. */
  wake: number
}

/**
 * A piece falls in a straight line from its orbit to just inside the horizon,
 * and the tide stretches it along its orbit as it nears — slowly at first, then
 * most of it in the last third. The wake is longer the faster the piece moves,
 * and lengthens again as the piece itself smears into it.
 */
export function debrisState(piece: Debris, eaten: number, horizon: number): DebrisState {
  const pull = pullOf(piece, eaten)
  const radius = piece.radius + (horizon - HIDE_MARGIN - piece.radius) * pull
  const tide = pull ** 3
  const speed = 300 / orbitPeriod(piece.radius)
  return {
    radius,
    across: (piece.size * (1 - 0.45 * tide)) / radius,
    along: (piece.size * (1 + 2.2 * tide)) / radius,
    wake: speed * (1 + 1.5 * tide),
  }
}

/** An SVG arc along the unit circle from one angle to another, in degrees. */
export function unitArc(fromDeg: number, toDeg: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180
    return `${Math.cos(rad).toFixed(4)} ${Math.sin(rad).toFixed(4)}`
  }
  return `M ${point(fromDeg)} A 1 1 0 0 1 ${point(toDeg)}`
}
