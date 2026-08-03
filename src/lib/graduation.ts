/**
 * The hanging-raise progression: knee raises until 4×20 is comfortable, then
 * full leg raises.
 *
 * Both live under one exercise key (HANGING_RAISE_KEY) because they're one
 * progression, not two exercises — that keeps a single continuous history and
 * chart line across the switch. This module decides when the switch is earned.
 *
 * Pure module — no React/DOM.
 */

import type { WorkoutRow } from '../types'
import { GRADUATION_REPS, GRADUATION_SETS, HANGING_RAISE_KEY } from '../config/plan'

/** Sessions at the graduation standard needed before we call it "comfortable". */
export const GRADUATION_SESSIONS = 2

/**
 * Sessions (newest first) in which the hanging raise hit the graduation standard
 * — at least GRADUATION_SETS sets of GRADUATION_REPS or more, in one session.
 */
function qualifyingSessions(workouts: WorkoutRow[]): string[] {
  const bySession = new Map<string, { date: string; atStandard: number }>()
  for (const r of workouts) {
    if (r.exercise !== HANGING_RAISE_KEY) continue
    const id = r.session_id || r.date
    const g = bySession.get(id) ?? { date: r.date, atStandard: 0 }
    if (r.reps >= GRADUATION_REPS) g.atStandard += 1
    bySession.set(id, g)
  }
  return [...bySession.values()]
    .filter((g) => g.atStandard >= GRADUATION_SETS)
    .map((g) => g.date)
    .sort()
    .reverse()
}

/**
 * Whether knee raises have been owned long enough to move up to full leg raises:
 * GRADUATION_SESSIONS separate sessions at 4×20. One good session could be a
 * fluke or a generous rep count, so we want it repeated before suggesting the
 * harder variant.
 */
export function shouldGraduateHangingRaise(workouts: WorkoutRow[]): boolean {
  return qualifyingSessions(workouts).length >= GRADUATION_SESSIONS
}

/**
 * A recap line for the session that earned the graduation — shown only on the
 * session that tipped it over, so it reads as news rather than a standing nag.
 * `prev` is the history from before the session, `added` the session's own rows.
 */
export function graduationNote(prev: WorkoutRow[], added: WorkoutRow[]): string | null {
  if (!added.some((r) => r.exercise === HANGING_RAISE_KEY)) return null
  if (shouldGraduateHangingRaise(prev)) return null
  if (!shouldGraduateHangingRaise([...prev, ...added])) return null
  return `${GRADUATION_SETS}×${GRADUATION_REPS} knee raises — time to switch to full leg raises`
}
