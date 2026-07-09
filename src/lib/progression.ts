import type { WorkoutRow } from '../types'

export type Target = { weightLbs: number | null; reps: number }

/** Round a weight to the nearest 0.5 lb. */
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}

type SessionGroup = { date: string; sets: { weight: number | null; reps: number }[] }

/**
 * The most recent session's performance for one exercise (null if no history).
 *
 * Rows are grouped by session (session_id, falling back to date), and the group
 * with the latest date wins. The "top set" is the heaviest set (ties broken by
 * greater reps); topReps is that set's reps. For a bodyweight exercise (every set
 * has a null weight) topWeight is null and topReps is the max reps in the session.
 */
export function lastPerformance(
  workouts: WorkoutRow[],
  exerciseKey: string,
): { date: string; topWeight: number | null; topReps: number } | null {
  const bySession = new Map<string, SessionGroup>()
  for (const r of workouts) {
    if (r.exercise !== exerciseKey) continue
    const key = r.session_id || r.date
    const g = bySession.get(key) ?? { date: r.date, sets: [] }
    g.sets.push({ weight: r.weight_lbs, reps: r.reps })
    bySession.set(key, g)
  }

  if (bySession.size === 0) return null

  // Pick the session with the latest date (YYYY-MM-DD sorts lexicographically).
  let latest: SessionGroup | null = null
  for (const g of bySession.values()) {
    if (latest === null || g.date > latest.date) latest = g
  }
  if (latest === null) return null

  const hasWeight = latest.sets.some((s) => s.weight != null)
  if (!hasWeight) {
    // Bodyweight session: no weight, top set is simply the most reps.
    let topReps = 0
    for (const s of latest.sets) topReps = Math.max(topReps, s.reps)
    return { date: latest.date, topWeight: null, topReps }
  }

  // Weighted session: heaviest set wins; ties broken by greater reps.
  let topWeight = -Infinity
  let topReps = 0
  for (const s of latest.sets) {
    if (s.weight == null) continue
    if (s.weight > topWeight || (s.weight === topWeight && s.reps > topReps)) {
      topWeight = s.weight
      topReps = s.reps
    }
  }
  return { date: latest.date, topWeight, topReps }
}

/**
 * Suggest the next target for an exercise using double progression within
 * [repMin, repMax].
 *
 * Re-pacing note: the target is always derived from the MOST RECENT session, so
 * if the user logs below target one week, next week's target is computed from that
 * lower actual — the plan automatically re-paces to reality rather than compounding
 * an aspirational number the user never actually hit.
 */
export function nextTarget(
  workouts: WorkoutRow[],
  exerciseKey: string,
  opts: { repMin: number; repMax: number; bodyweight?: boolean; increment?: number },
): Target {
  const { repMin, repMax } = opts
  const increment = opts.increment ?? 5

  const last = lastPerformance(workouts, exerciseKey)

  // Brand-new exercise: no weight suggestion, start at the bottom of the range.
  if (last === null) {
    return { weightLbs: null, reps: repMin }
  }

  // Bodyweight (flagged, or no weight recorded): progress reps only.
  if (opts.bodyweight || last.topWeight == null) {
    const reps = last.topReps < repMax ? Math.min(last.topReps + 1, repMax) : repMax
    return { weightLbs: null, reps }
  }

  // Weighted double progression.
  if (last.topReps >= repMax) {
    // Earned a weight bump: increase weight, reset reps to the bottom of the range.
    return { weightLbs: roundHalf(last.topWeight + increment), reps: repMin }
  }
  // Otherwise add a rep at the same weight (topReps + 1 stays <= repMax here).
  return { weightLbs: roundHalf(last.topWeight), reps: last.topReps + 1 }
}
