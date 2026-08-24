/**
 * Whether today's stretch session should append the core block.
 *
 * Both routines end with the same weighted sit-ups, and the head-to-toe routine
 * is long enough that running both in a day is a real thing to do — so the second
 * session of a day drops the core rather than doing it twice.
 *
 * Pure module: no React/DOM, no storage.
 */

import type { WorkoutRow } from '../types'
import { STRETCH_CORE } from '../config/plan'
import { isSupplementalSet } from './session'

/**
 * Whether an earlier *stretch* session today already logged core sets.
 *
 * It has to be the row's note as well as its exercise: the weighted sit-up is
 * real programmed work on push and on pull, so the key alone can't tell a stretch
 * session's four sets from a training day's. `logCore` stamps CORE_SESSION_NOTE on
 * every row it writes and nothing else does, which is exactly what makes a push
 * day's sit-ups correctly leave today's stretch with its core intact.
 */
export function coreDoneToday(workouts: WorkoutRow[], today: string): boolean {
  return workouts.some(
    (r) => r.date === today && r.exercise === STRETCH_CORE.key && isSupplementalSet(r),
  )
}
