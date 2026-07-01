import type { SetLog } from '../types'

/** Estimated one-rep max via the Epley formula. */
export function epley1RM(weightLbs: number, reps: number): number {
  if (reps <= 0) return 0
  return weightLbs * (1 + reps / 30)
}

/** Best (highest) estimated 1RM across a session's sets. Ignores blank-weight sets. */
export function bestSet1RM(sets: SetLog[]): number {
  let best = 0
  for (const s of sets) {
    if (s.weightLbs == null) continue
    best = Math.max(best, epley1RM(s.weightLbs, s.reps))
  }
  return best
}

/** Heaviest weight lifted for any set (raw best-set weight). */
export function bestSetWeight(sets: SetLog[]): number {
  let best = 0
  for (const s of sets) {
    if (s.weightLbs == null) continue
    best = Math.max(best, s.weightLbs)
  }
  return best
}

/** Total volume for a session: sum of weight × reps across sets (blank weight = 0). */
export function sessionVolume(sets: SetLog[]): number {
  return sets.reduce((sum, s) => sum + (s.weightLbs ?? 0) * s.reps, 0)
}
