/**
 * Which stretch routine comes next.
 *
 * The two routines alternate the way the push variants do (see lib/pushVariant):
 *
 *   side split → head to toe → side split → …
 *
 * Read off logged history rather than a stored toggle, so it survives a
 * reinstall and agrees across devices. Pure module: no React/DOM, no storage.
 */

import { FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../config/flexRoutines'
import type { FlexEntry } from './flex'

/**
 * The routine most recently completed, or null with no stretch history at all.
 *
 * Walks to the newest-dated entry that records a completed session and takes the
 * *last* routine on it — a date's `routines` are in completion order, so a day
 * that ran both hands back the second one.
 *
 * An entry from before this shipped has no `routines` and counts as a side
 * split rather than being skipped. That is factually what those sessions were,
 * and it means the very first suggestion is head to toe — which is right, since
 * it has never been done. (Note the difference from `lastVariant`, which skips
 * untagged rows: there they were genuinely ambiguous, here they are not.)
 *
 * Measurement-only entries carry no `routines` and no legacy angle history of a
 * completed session, so they never turn the alternation over — see
 * `completedRoutinesOf`.
 */
export function lastStretchRoutine(entries: FlexEntry[]): FlexRoutineKey | null {
  let latest: { date: string; routine: FlexRoutineKey } | null = null
  for (const e of entries) {
    const routines = completedRoutinesOf(e)
    if (routines.length === 0) continue
    // Dates are YYYY-MM-DD, so a plain string compare orders them; `>=` lets a
    // later entry win a same-day tie, since entries arrive in log order.
    if (!latest || e.date >= latest.date) {
      latest = { date: e.date, routine: routines[routines.length - 1] }
    }
  }
  return latest?.routine ?? null
}

/**
 * The routines a single entry records as completed, in completion order.
 *
 * A tagged entry says so outright. An untagged one counts as a side split only
 * if it looks like a finished session rather than a bare measurement: a
 * measurement is logged with `note: 'measurement'` (see DataContext.logFlex),
 * and a session with the note it was finished under.
 */
function completedRoutinesOf(e: FlexEntry): FlexRoutineKey[] {
  if (e.routines?.length) return e.routines
  return e.note === 'measurement' ? [] : ['side_split']
}

/**
 * The routine up next — whichever one wasn't done last, and the side split with
 * nothing on record to turn over from.
 */
export function nextStretchRoutine(entries: FlexEntry[]): FlexRoutineKey {
  const last = lastStretchRoutine(entries)
  return last ? otherStretchRoutine(last) : FLEX_ROUTINE_KEYS[0]
}

/** The other routine — for the "actually, give me the other one" override. */
export function otherStretchRoutine(routine: FlexRoutineKey): FlexRoutineKey {
  return routine === 'side_split' ? 'head_to_toe' : 'side_split'
}
