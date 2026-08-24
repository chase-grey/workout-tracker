/**
 * Which way a measured angle improves, named once.
 *
 * Every flexibility reading in the app used to get deeper by getting bigger — a
 * wider split, a more open hip — so "better" was spelled `>` and "best" was
 * `Math.max`, inline, in four different modules. The toe touch breaks that: it's
 * the raw hip angle of a standing forward fold, so standing upright is 180° and
 * folded flat is 0°, and a *smaller* number is the deeper one.
 *
 * Rather than a branch at each of those call sites, a metric carries its own
 * direction and the comparators that follow from it. A caller asks the metric
 * which of two readings is better and gets the right answer without knowing
 * which pose it's looking at.
 *
 * Pure module — no React/DOM, no storage.
 */

export type AngleDirection = 'higher' | 'lower'

/** Which way a metric improves, and the comparators that follow from it. */
export type MetricDir = {
  direction: AngleDirection
  /** The better of two readings. */
  best: (a: number, b: number) => number
  /** True when `a` is an improvement on `b`. */
  beats: (a: number, b: number) => boolean
  /**
   * Signed progress from `from` to `to` — positive means improvement, so a delta
   * reads the same way on every metric on screen.
   */
  gain: (from: number, to: number) => number
}

/** Bigger is deeper: the split, tailor's pose, the leg lift. */
export const HIGHER_IS_BETTER: MetricDir = {
  direction: 'higher',
  best: (a, b) => Math.max(a, b),
  beats: (a, b) => a > b,
  gain: (from, to) => to - from,
}

/** Smaller is deeper: the toe touch's hip angle, which closes as you fold. */
export const LOWER_IS_BETTER: MetricDir = {
  direction: 'lower',
  best: (a, b) => Math.min(a, b),
  beats: (a, b) => a < b,
  gain: (from, to) => from - to,
}

/** The comparators for a direction, for a spec that stores the bare word. */
export const metricDir = (direction: AngleDirection): MetricDir =>
  direction === 'lower' ? LOWER_IS_BETTER : HIGHER_IS_BETTER

/**
 * The best of a set of readings, or null when there are none. Folded through the
 * metric's own `best`, so the winner is the deepest reading either way round.
 */
export function bestOf(values: number[], dir: MetricDir = HIGHER_IS_BETTER): number | null {
  let out: number | null = null
  for (const v of values) out = out == null ? v : dir.best(out, v)
  return out
}

/**
 * The nearest goal `value` hasn't reached yet, with the distance still to go.
 *
 * "Nearest" is the *easiest* of the goals still ahead — the largest target below
 * a descending reading, the smallest above an ascending one — which is why it
 * folds with `beats` rather than with a sort: the comparison that orders the
 * ladder is the metric's own. Null once every goal is cleared.
 */
export function nextGoal(
  goals: readonly number[],
  value: number,
  dir: MetricDir = HIGHER_IS_BETTER,
): { target: number; toGo: number } | null {
  let target: number | null = null
  for (const g of goals) {
    if (!dir.beats(g, value)) continue
    // Of the goals still ahead, keep the one the other beats — the near one.
    if (target == null || dir.beats(target, g)) target = g
  }
  if (target == null) return null
  return { target, toGo: Math.round(dir.gain(value, target) * 10) / 10 }
}
