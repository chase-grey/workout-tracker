import type { BodyWeightEntry, WorkoutRow } from '../types'
import { epley1RM } from './epley'
import { parseISODate } from './dates'
import { DEFAULT_PLAN, exerciseName, legExerciseKeys, type Plan } from '../config/plan'

export type PhotoReminder = { due: boolean; reason: string }

/**
 * Suggest a progress photo when EITHER ~a month has passed since the last one,
 * OR there's been a notable jump in body weight or in estimated strength on any
 * lift since the last photo.
 *
 * Leg work is left out of the strength trigger: a squat or a leg-machine PR
 * doesn't change what a progress photo shows, so only upper-body and ab lifts
 * get to call for the camera. Which movements count as legs comes from the live
 * plan (see {@link legExerciseKeys}), falling back to the shipped one.
 */
export function photoReminder(input: {
  lastPhoto: string | null
  bodyWeights: BodyWeightEntry[]
  workouts: WorkoutRow[]
  today?: Date
  plan?: Plan
  cfg?: { days?: number; bwLbs?: number; strengthLbs?: number }
}): PhotoReminder {
  const today = input.today ?? new Date()
  const days = input.cfg?.days ?? 30
  const bwLbs = input.cfg?.bwLbs ?? 4
  const strengthLbs = input.cfg?.strengthLbs ?? 10
  const lastPhoto = input.lastPhoto

  if (!lastPhoto) return { due: true, reason: 'no progress photos yet — take your first!' }

  const daysSince = Math.floor((today.getTime() - parseISODate(lastPhoto).getTime()) / 86400000)
  if (daysSince >= days) return { due: true, reason: `it's been ${daysSince} days since your last photo` }

  // Body-weight change since the last photo.
  const bws = input.bodyWeights.filter((b) => b.weightLbs >= 50)
  const baselineBw = bws.filter((b) => b.date <= lastPhoto).sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)?.weightLbs
  const currentBw = bws.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1)?.weightLbs
  if (baselineBw != null && currentBw != null) {
    const delta = Math.round((currentBw - baselineBw) * 10) / 10
    if (Math.abs(delta) >= bwLbs) {
      return { due: true, reason: `body weight ${delta > 0 ? '+' : ''}${delta} lbs since your last photo` }
    }
  }

  // Strength: biggest per-exercise est-1RM gain since the last photo, legs aside.
  const legKeys = legExerciseKeys(input.plan ?? DEFAULT_PLAN)
  const preBest = new Map<string, number>()
  const postBest = new Map<string, number>()
  for (const r of input.workouts) {
    if (r.weight_lbs == null || legKeys.has(r.exercise)) continue
    const est = epley1RM(r.weight_lbs, r.reps)
    const map = r.date <= lastPhoto ? preBest : postBest
    map.set(r.exercise, Math.max(map.get(r.exercise) ?? 0, est))
  }
  let bestDelta = 0
  let bestKey = ''
  for (const [key, post] of postBest) {
    const pre = preBest.get(key) ?? 0
    if (pre <= 0) continue
    if (post - pre > bestDelta) {
      bestDelta = post - pre
      bestKey = key
    }
  }
  if (bestDelta >= strengthLbs) {
    return {
      due: true,
      reason: `${exerciseName(bestKey)} est. 1rm up ${Math.round(bestDelta)} lbs since your last photo`,
    }
  }

  return { due: false, reason: '' }
}
