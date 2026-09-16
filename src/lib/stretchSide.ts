import type { FlexRoutineKey } from '../config/flexRoutines'
import type { Side } from '../types'
import type { FlexEntry } from './flex'

/** Alternate each routine independently; older completed routines always led left. */
export function nextStretchSide(entries: FlexEntry[], routine: FlexRoutineKey): Side {
  let latest: { date: string; side: Side } | null = null
  for (const entry of entries) {
    const recorded = entry.startSides?.[routine]
    // New completions explicitly carry this map, even when all sided work was skipped.
    if (entry.startSides && !recorded) continue
    const completed = entry.routines?.length
      ? entry.routines.includes(routine)
      : entry.note !== 'measurement' && routine === 'side_split'
    if (!recorded && !completed) continue
    if (!latest || entry.date >= latest.date) {
      latest = { date: entry.date, side: recorded ?? 'left' }
    }
  }
  return latest?.side === 'left' ? 'right' : 'left'
}
