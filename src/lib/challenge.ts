/**
 * Progressive-overload "challenges": when the plan asks you to do more than you
 * did last time, and whether you rose to it.
 *
 * The workout flow prefills each set with the progression target (see
 * progression.ts). When that target is a genuine step up from your last session
 * — heavier, or the same weight for more reps — it's a challenge. Meeting or
 * beating it on a completed set sets a new baseline the plan will build on next
 * time, which is worth a small celebration and a line on the finish recap.
 *
 * Pure module — no React/DOM — so it stays unit-testable.
 */

import type { WorkoutRow } from '../types'
import { exerciseName } from '../config/plan'
import { lastPerformance, nextTarget, type Target } from './progression'

/** Progression inputs for one exercise (the fields nextTarget needs). */
export type ChallengeOpts = { repMin: number; repMax: number; bodyweight?: boolean; increment?: number }

/**
 * Is `target` a genuine step up from the most recent session for this exercise?
 * A brand-new exercise (no history) is not a challenge — there's nothing to beat
 * yet. Heavier weight always counts; at the same weight, more reps counts.
 */
export function isChallenge(
  prev: WorkoutRow[],
  exerciseKey: string,
  target: Target,
  /** Bottom of the rep range, so this reads the same working set nextTarget did. */
  repMin = 1,
): boolean {
  const last = lastPerformance(prev, exerciseKey, repMin)
  if (!last) return false
  if (target.weightLbs != null && last.topWeight != null) {
    if (target.weightLbs > last.topWeight) return true
    return target.weightLbs === last.topWeight && target.reps > last.topReps
  }
  // Bodyweight / reps-only: a step up means more reps than last time.
  return target.reps > last.topReps
}

/** True when a completed set met or beat the challenge target. */
function setMeetsTarget(weightLbs: number | null, reps: number, target: Target): boolean {
  if (reps <= 0) return false
  if (target.weightLbs == null) return reps >= target.reps
  return weightLbs != null && weightLbs >= target.weightLbs && reps >= target.reps
}

export type SessionChallenge = {
  /** Exercise display name. */
  exercise: string
  target: Target
  /** True when at least one completed set in the session met/beat the target. */
  met: boolean
}

/**
 * For each exercise trained in `added`, compute its progression target from the
 * history that preceded the session (`prev`) and report only those that were a
 * real challenge, flagging whether the session met it. Exercises with no plan
 * entry in `optsByKey` are skipped (we can't know their target).
 */
export function sessionChallenges(
  prev: WorkoutRow[],
  added: WorkoutRow[],
  optsByKey: Map<string, ChallengeOpts>,
): SessionChallenge[] {
  const byKey = new Map<string, WorkoutRow[]>()
  for (const r of added) {
    const list = byKey.get(r.exercise) ?? []
    list.push(r)
    byKey.set(r.exercise, list)
  }

  const out: SessionChallenge[] = []
  for (const [key, rows] of byKey) {
    const opts = optsByKey.get(key)
    if (!opts) continue
    const target = nextTarget(prev, key, opts)
    if (!isChallenge(prev, key, target, opts.repMin)) continue
    const met = rows.some((r) => setMeetsTarget(r.weight_lbs, r.reps, target))
    out.push({ exercise: exerciseName(key), target, met })
  }
  return out
}

/** Display names of exercises whose challenge the session met (new baselines). */
export function metBaselines(challenges: SessionChallenge[]): string[] {
  return challenges.filter((c) => c.met).map((c) => c.exercise)
}
