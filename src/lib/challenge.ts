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
import { exerciseName, type VariantKey } from '../config/plan'
import { lastPerformance, nextTargets, type Target } from './progression'
import { progressionVariant } from './pushVariant'

/** Progression inputs for one exercise (the fields nextTarget needs). */
export type ChallengeOpts = {
  repMin: number
  repMax: number
  bodyweight?: boolean
  increment?: number
  /** Heaviest load available, so a capped lift is scored on reps as it was asked. */
  weightCapLbs?: number
  /** Load-sharing group id, so the target read here matches the one prefilled. */
  sharedLoad?: string
}

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
  /**
   * The A/B slot being trained, matching what nextTarget was given. Read the
   * other slot's session and a fresh press looks like a challenge every time it
   * follows a tired one, while a tired press is credited with beating a number
   * set fresh — neither of which is a step up in the lift.
   */
  variant?: VariantKey | null,
): boolean {
  const last = lastPerformance(prev, exerciseKey, repMin, variant)
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
  /** Passed through to nextTarget, which reads it for the stale-history check. */
  today: Date = new Date(),
): SessionChallenge[] {
  const byKey = new Map<string, WorkoutRow[]>()
  for (const r of added) {
    const list = byKey.get(r.exercise) ?? []
    list.push(r)
    byKey.set(r.exercise, list)
  }

  // The slot this session trained in, so each target is read from the sessions
  // trained under the same fatigue. Taken from the rows themselves rather than
  // passed in, since they carry it (see sessionToRows).
  const sessionVariant = added.find((r) => r.variant)?.variant ?? null
  const variantFor = (key: string) => progressionVariant(key, sessionVariant)

  // Read as a batch, the way the session prefilled them: exercises sharing a load
  // were asked for one weight between them, so scoring either against its own solo
  // target would judge it on a prescription it was never actually given.
  const targets = nextTargets(
    prev,
    [...byKey.keys()].flatMap((key) => {
      const opts = optsByKey.get(key)
      return opts ? [{ key, ...opts }] : []
    }),
    { today, variantFor },
  )

  const out: SessionChallenge[] = []
  for (const [key, rows] of byKey) {
    const opts = optsByKey.get(key)
    const target = targets.get(key)
    if (!opts || !target) continue
    const variant = variantFor(key)
    if (!isChallenge(prev, key, target, opts.repMin, variant)) continue
    const met = rows.some((r) => setMeetsTarget(r.weight_lbs, r.reps, target))
    out.push({ exercise: exerciseName(key), target, met })
  }
  return out
}

/** Display names of exercises whose challenge the session met (new baselines). */
export function metBaselines(challenges: SessionChallenge[]): string[] {
  return challenges.filter((c) => c.met).map((c) => c.exercise)
}
