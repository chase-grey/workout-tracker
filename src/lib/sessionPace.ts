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
