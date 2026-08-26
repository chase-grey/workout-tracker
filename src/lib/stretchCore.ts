/**
 * The core block a Stretch + Core session ends with: whether today's stretch
 * should append it, and where its history lives.
 *
 * Pure module: no React/DOM, no storage.
 */

import type { WorkoutRow } from '../types'
import { MAT_SITUP_KEY, STRETCH_CORE } from '../config/plan'
import { isSupplementalSet } from './session'

/**
 * Whether an earlier *stretch* session today already logged core sets.
 *
 * Both routines end with the same mat sit-ups, and the head-to-toe routine is long
 * enough that running both in a day is a real thing to do — so the second session
 * of a day drops the core rather than doing it twice.
 *
 * The key is enough to say so now: the mat sit-up is the stretch block's own
 * movement and no training day prescribes it (see plan.MAT_SITUP_KEY), so a push
 * day's incline sit-ups correctly leave today's stretch with its core intact.
 */
export function coreDoneToday(workouts: WorkoutRow[], today: string): boolean {
  return workouts.some((r) => r.date === today && r.exercise === STRETCH_CORE.key)
}

/**
 * The exercise key the weighted sit-up shipped under before the mat one split off.
 * Every row of both movements is stored under it up to that point.
 */
const PRE_SPLIT_SITUP_KEY = 'weighted_situp'

/**
 * Rows with the stretch block's old sit-up sets moved onto the mat sit-up's key.
 *
 * The two sit-ups shared a key until the mat one got its own, so the history in the
 * sheet is a mix: incline sets off push days, and mat sets off stretches. Left
 * alone, every one of those mat sets would read as incline work — the incline lift
 * would prefill its next target off a set done flat on the floor, and the mat one
 * would come up with no history at all and prefill nothing.
 *
 * The note is what tells them apart, and it's reliable: `logCore` stamps
 * CORE_SESSION_NOTE on every row it writes and nothing else does. So a pre-split
 * sit-up row that carries it is a mat set, and it's re-keyed on the way in rather
 * than rewritten in the sheet — the sheet keeps what it recorded, and the re-key is
 * a fact about those rows that stays true however many times it's applied.
 *
 * The one thing it costs: a discomfort flag added after the fact matches its row by
 * session and exercise key (see discomfort.NotesEdit), so flagging one of these
 * pre-split stretch sessions would post the mat key and match nothing in the sheet.
 * Only the AI chat can do that, and only to a session it's told about by name.
 */
export function withMatSitups(rows: WorkoutRow[]): WorkoutRow[] {
  return rows.map((r) =>
    r.exercise === PRE_SPLIT_SITUP_KEY && isSupplementalSet(r)
      ? { ...r, exercise: MAT_SITUP_KEY }
      : r,
  )
}
