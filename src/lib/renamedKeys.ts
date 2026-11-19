import { RENAMED_EXERCISE_KEYS } from '../config/plan'
import type { WorkoutRow } from '../types'

/**
 * Rows with any exercise key a movement used to be logged under moved onto the
 * key it is read as now (see plan.RENAMED_EXERCISE_KEYS).
 *
 * History is looked up by key everywhere — the next target, the challenge, the
 * best-ever, the charts, the strength ladder, the add sheet, the export — so a
 * movement logged under two keys is two movements to all of them. Re-keying the
 * rows where they enter the app, the cache read and the fetch, makes it one for
 * every reader at once without any of them knowing there was a second name.
 *
 * The sheet is not rewritten, for the reason lib/stretchCore.withMatSitups gives:
 * it keeps what it recorded, and the re-key stays true however many times it is
 * applied. It costs what that one costs, too: a note edited onto a re-keyed
 * session afterwards is posted under the new key and matches nothing in the sheet.
 */
export function withRenamedKeys(rows: WorkoutRow[]): WorkoutRow[] {
  return rows.map((r) => {
    const key = Object.hasOwn(RENAMED_EXERCISE_KEYS, r.exercise) ? RENAMED_EXERCISE_KEYS[r.exercise] : undefined
    return key ? { ...r, exercise: key } : r
  })
}
