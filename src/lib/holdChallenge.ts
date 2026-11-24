/**
 * An open hold: one with no prescribed length, held until you come down and
 * logged at whatever the clock read (see FlexExercise.openHold — the RKC plank).
 *
 * It still gets a number to go for. The challenge time is the best hold of the
 * last day it was done, plus a little: enough to be a step, not enough to be a
 * different effort. A hold that fell short last time lowers the next ask with
 * it, the way a lift's target follows what was last done rather than the best
 * ever done.
 *
 * Pure module: no React/DOM, no storage.
 */

import type { WorkoutRow } from '../types'

/** The least a challenge asks for over the last hold, in seconds. */
export const HOLD_PUSH_MIN_SEC = 2
/** The share of the last hold a challenge adds, where that's more than the minimum. */
export const HOLD_PUSH_SHARE = 0.05

export type HoldChallenge = {
  /** The time to beat. */
  targetSec: number
  /** The best hold of the last day it was done; null with no history. */
  lastSec: number | null
  /** The longest hold on record; null with no history. */
  bestSec: number | null
}

/**
 * The challenge for `exerciseKey`, whose rows log seconds as `reps`. With
 * nothing logged yet the target is `startSec`, and there is no last hold to mark.
 */
export function holdChallenge(rows: WorkoutRow[], exerciseKey: string, startSec: number): HoldChallenge {
  let lastDate: string | null = null
  let lastSec = 0
  let bestSec = 0
  for (const r of rows) {
    if (r.exercise !== exerciseKey || !(r.reps > 0)) continue
    bestSec = Math.max(bestSec, r.reps)
    if (lastDate == null || r.date > lastDate) {
      lastDate = r.date
      lastSec = r.reps
    } else if (r.date === lastDate) {
      lastSec = Math.max(lastSec, r.reps)
    }
  }
  if (lastDate == null) return { targetSec: startSec, lastSec: null, bestSec: null }
  const push = Math.max(HOLD_PUSH_MIN_SEC, Math.round(lastSec * HOLD_PUSH_SHARE))
  return { targetSec: lastSec + push, lastSec, bestSec }
}

export type HoldDial = {
  /** How much of the lap to the target is drawn, 0 to 1. Full from the target on. */
  fill: number
  /** Whether the target has been reached. */
  hit: boolean
  /** Seconds past the target; 0 before it. */
  overSec: number
  /** Whole laps of the target completed past it. */
  overLaps: number
  /** How far round the current lap past the target is, 0 to 1. */
  overFill: number
  /**
   * How hard the dial is drawn, 0 to 1: it gathers through the lap, most of it
   * in the last stretch before the target, and stays full past it.
   */
  heat: number
}

/**
 * Where the dial stands `elapsedSec` into a hold against `targetSec`.
 *
 * One lap of the dial is the target, so the hold can be watched closing on it.
 * Past the target it doesn't stop: every further lap is the target's length
 * again, drawn outside the first, so a hold that runs on keeps moving at the
 * pace it built at rather than freezing on a full ring.
 */
export function holdDial(elapsedSec: number, targetSec: number): HoldDial {
  const target = Math.max(1, targetSec)
  const t = Math.max(0, elapsedSec)
  const fill = Math.min(1, t / target)
  const overSec = Math.max(0, t - target)
  const laps = overSec / target
  return {
    fill,
    hit: t >= target,
    overSec,
    overLaps: Math.floor(laps),
    overFill: laps - Math.floor(laps),
    heat: fill * fill,
  }
}

/** Seconds as a clock reads them: 0:07, 1:32. */
export function holdClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
