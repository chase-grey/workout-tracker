/**
 * What a number typed into the workout checklist records.
 *
 * Every set is built prefilled with its target (see useActiveSession.start), so
 * a set that hasn't been done yet already holds numbers. The checklist shows
 * those as a prompt, not a record: an undone set's fields read empty with the
 * target as their placeholder. Typing into one is evidence the set happened —
 * nobody writes down a weight for a set they haven't lifted — so the edit marks
 * the set done as well as storing the number, and the field left alone keeps
 * its prefill, which is now what got logged for it.
 */

import type { CarriedSet } from './carryForward'
import type { SetLog } from '../types'

export type ChecklistEdit = {
  /** What to store on the set. */
  patch: Partial<SetLog>
  /** What the set now hands to the sets of its exercise still pending. */
  carried: CarriedSet
}

export function checklistSetEdit(set: SetLog, patch: Pick<SetLog, 'weightLbs'> | Pick<SetLog, 'reps'>): ChecklistEdit {
  const merged = { ...set, ...patch }
  return {
    patch: { ...patch, done: true },
    carried: { weightLbs: merged.weightLbs ?? null, reps: merged.reps },
  }
}
