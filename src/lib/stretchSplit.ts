/**
 * What a Stretch + Core session was projected to cost, split the same way a
 * finished one is reported: time in the poses against time on the rest screen.
 *
 * The lifting side of the app gets this from learned per-exercise averages (see
 * estimate.workoutSplit), which a stretch has nothing to offer — the routine
 * prescribes its own seconds. A ninety-second calf hold is ninety seconds
 * whether it's the first one you've ever held or the fiftieth, so the price here
 * is the prescription as written: every hold and paced set, every settle-in the
 * flow serves before them, and every rest it prescribes between them.
 *
 * What history is good for is the whole: a routine reliably runs longer than the
 * sum of its parts (the pauses nobody scheduled), so a learned median total
 * rescales the two halves rather than replacing either. That median is the same
 * number the session's own time-left readout was quoting all the way through, so
 * the recap can't contradict what the screen kept promising.
 *
 * Pure module — no React/DOM, no storage — so it stays unit-testable.
 */

import type { WorkoutSplit } from './estimate'
import { SEC_PER_REP, stepWorkSec, type SessionStep } from './flexSteps'
import { settleInSec } from './settleIn'

/**
 * The settle-in the flow actually serves before `step`. Ordinarily the step's own
 * (a reposition or a full setup), except after the first side of a round, where
 * the leg swap replaces it — see StretchSession's advanceFrom, which hands the
 * side switch straight to the get-ready count.
 */
function settleBefore(step: SessionStep, prev?: SessionStep): number {
  if (prev?.kind === 'flex' && prev.sideSwitchSec) return prev.sideSwitchSec
  return settleInSec(step, prev)
}

/**
 * The rest the flow actually serves after `step`. The closing set finishes
 * instead of resting, and crossing out of the mobility routine into the core
 * block skips its rest — the last stretch leaves you rested enough.
 */
function restAfter(step: SessionStep, next?: SessionStep): number {
  if (!next) return 0
  if (step.kind === 'flex' && next.kind === 'core') return 0
  return Math.max(0, step.restSec)
}

/**
 * Price a run of stretch steps, split into the time spent working and the time
 * spent resting.
 *
 * `learnedTotalSec` is the median length of comparable past sessions when there
 * have been enough of them (see estimate.medianTotalSec); given one, the two
 * halves keep their structural proportion and are scaled to meet it.
 */
export function stretchSplit(
  steps: SessionStep[],
  coreRepsFor: (round: number) => number,
  learnedTotalSec?: number | null,
): WorkoutSplit {
  let activeSec = 0
  let restSec = 0
  steps.forEach((s, i) => {
    // A settle-in is time on your feet getting into the pose, not time resting —
    // the session's own tally banks only the rest screen, so this belongs to the
    // working half on both sides of the comparison.
    activeSec += settleBefore(s, steps[i - 1])
    activeSec += s.kind === 'flex' ? stepWorkSec(s) : coreRepsFor(s.round) * SEC_PER_REP
    restSec += restAfter(s, steps[i + 1])
  })
  const totalSec = activeSec + restSec
  if (learnedTotalSec != null && learnedTotalSec > 0 && totalSec > 0) {
    const scale = learnedTotalSec / totalSec
    return { activeSec: activeSec * scale, restSec: restSec * scale, totalSec: learnedTotalSec }
  }
  return { activeSec, restSec, totalSec }
}
