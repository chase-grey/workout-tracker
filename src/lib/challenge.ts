/**
 * Progressive-overload "challenges": when the plan asks you to do more than you
 * did last time, and whether you rose to it.
 *
 * The workout flow prefills each set with the progression target (see
 * progression.ts). That target is a challenge when it asks for something you
 * haven't done yet: heavier, the same weight for more reps, or the same numbers
 * again because last time a set fell short of them. Holding it across the whole
 * session sets a new baseline the plan will build on next time, which is worth a
 * small celebration and a line on the finish recap.
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
  /** Can't be loaded, so its reps climb past the range — see PlannedExercise.repLadder. */
  repLadder?: boolean
  /** Load-sharing group id, so the target read here matches the one prefilled. */
  sharedLoad?: string
}

/**
 * Is `target` something to rise to, or just today's work?
 *
 * A brand-new exercise (no history) is not a challenge — there's nothing to beat
 * yet. Heavier weight always counts; at the same weight, more reps counts. So does
 * the same weight for the same reps when the last session didn't hold them on every
 * set: the number repeated precisely because the job was left unfinished (see
 * progression's heldEverySet), so carrying it through all four sets is the first
 * time it's actually been done, and it's what unlocks the next step.
 *
 * A repeat for any other reason isn't a challenge — stale history and a slot with
 * nothing of its own to read from both re-ask for a number that was already held.
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
  // Reps still owed at the weight: only an unfinished session in THIS slot leaves
  // any. A repeat that comes of reading the other slot is a first attempt here, not
  // a second one, so there's nothing owed to finish.
  const owed = last.sameSlot && !last.heldEverySet
  if (target.weightLbs != null && last.topWeight != null) {
    if (target.weightLbs > last.topWeight) return true
    if (target.weightLbs < last.topWeight) return false
    return target.reps > last.topReps || owed
  }
  // Bodyweight / reps-only: a step up means more reps than last time.
  return target.reps > last.topReps || owed
}

/**
 * A set the target is speaking to: one that was performed, at the weight asked for
 * or heavier. A lighter set is a back-off and is judged by nothing here, the same
 * way the progression read looks at one weight's sets alone.
 */
function isWorkingSet(weightLbs: number | null, reps: number, target: Target): boolean {
  if (reps <= 0) return false
  if (target.weightLbs == null) return true
  return weightLbs != null && weightLbs >= target.weightLbs
}

/**
 * Did the session hold the target, or just touch it?
 *
 * Every working set has to reach the target's reps, and there has to be one. One
 * good set among four that fell short is exactly the session a target gets repeated
 * for — progression won't build on it (see progression's heldEverySet), so the recap
 * shouldn't call it a new baseline either.
 */
function heldTarget(rows: WorkoutRow[], target: Target): boolean {
  const working = rows.filter((r) => isWorkingSet(r.weight_lbs, r.reps, target))
  return working.length > 0 && working.every((r) => r.reps >= target.reps)
}

export type SessionChallenge = {
  /** Exercise display name. */
  exercise: string
  target: Target
  /** True when every working set of the session met or beat the target. */
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
    const met = heldTarget(rows, target)
    out.push({ exercise: exerciseName(key), target, met })
  }
  return out
}

/** Display names of exercises whose challenge the session met (new baselines). */
export function metBaselines(challenges: SessionChallenge[]): string[] {
  return challenges.filter((c) => c.met).map((c) => c.exercise)
}
