/**
 * A session in progress set against its own projection.
 *
 * The estimate prices every set of the session — its active time and the rest
 * after it (see lib/remainingTiming). Priced over the whole flow that is what
 * the session should cost; priced over what's left it is the time still ahead.
 * The difference is where the estimate puts you *now*: how much it says should
 * have passed by the set you're on. Beside the clock, that is behind or ahead.
 *
 * Pure module — no React/DOM.
 */

import type { WorkoutSplit } from './estimate'

/**
 * What the estimate says should have passed by this point in the session: the
 * whole flow's price less the price of what's left, in its working and resting
 * halves. More on the clock than this is behind the projection; less is ahead.
 *
 * `left` already knows how far into the set on screen you are and how much of a
 * running rest remains, so the figure moves through a set and through a rest
 * and then waits for you: a set run long or a rest sat past zero leaves it
 * standing while the clock goes on.
 *
 * Never negative — a session whose remaining price has outgrown its whole one
 * (the live rest on screen is counted at its countdown, not at the learned
 * ratio) has simply not got anywhere yet.
 */
export function projectedSoFar(
  whole: Pick<WorkoutSplit, 'activeSec' | 'restSec'>,
  left: Pick<WorkoutSplit, 'activeSec' | 'restSec'>,
): WorkoutSplit {
  const activeSec = Math.max(0, whole.activeSec - left.activeSec)
  const restSec = Math.max(0, whole.restSec - left.restSec)
  return { activeSec, restSec, totalSec: activeSec + restSec }
}

/** One set of the whole flow as the projection prices it. */
export type PaceStep = {
  activeSec: number
  restSec: number
  /**
   * How much of the progress bar finishing this set fills, in the bar's own
   * unit. One set, unless the bar counts something coarser: a circuit logged a
   * round at a time counts rounds, so each of its four stations is a quarter.
   */
  units?: number
}

/**
 * The same projection read the other way: given the time on the clock, how far
 * through the session the estimate says you should be, as the fraction of the
 * progress bar that should be filled.
 *
 * The bar fills a set at a time, when the set is logged, so the projection is
 * read in the same steps: a set counts once its active time has gone by, and
 * nothing more is owed through the rest after it. Exactly on pace, the mark
 * sits on the end of the fill; a fill short of it is behind, one past it ahead.
 *
 * `steps` is the whole flow in the order it's walked, done sets included. Null
 * when there is nothing to project against.
 */
export function expectedProgress(steps: readonly PaceStep[], elapsedSec: number): number | null {
  let all = 0
  let earned = 0
  let at = 0
  for (const step of steps) {
    const units = step.units ?? 1
    all += units
    at += Math.max(0, step.activeSec)
    if (elapsedSec >= at) earned += units
    at += Math.max(0, step.restSec)
  }
  if (all <= 0 || at <= 0) return null
  return Math.max(0, Math.min(1, earned / all))
}
