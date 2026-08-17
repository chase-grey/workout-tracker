/**
 * The sets behind a goal's readings, keyed by the date they were performed.
 *
 * A goal's line plots one number per session, and for some goals that number is
 * not a set anybody did: the pull-up ladder reads the reps the fourth set still
 * had in it (see progress.sustainedRepsSeries), so a session that went 9, 8, 6, 5
 * plots as 5. Off the chart alone that looks like a bad day rather than the good
 * one it was. The e1RM goals have the same gap in gentler form — the line is a
 * formula's answer, not a weight that was on the bar.
 *
 * So the tooltip on a goal's chart lists the session as it was logged, and the
 * line's own number goes back to being what it is: a summary of the sets shown
 * next to it.
 *
 * Keyed by date rather than by session id because a chart point carries its date
 * and nothing else. Two sessions of one lift on one day therefore read as a
 * single day's work, which is what a point on a date axis is.
 *
 * Pure module — no React/DOM.
 */

import type { WorkoutRow } from '../types'
import type { LoggedSet } from './exerciseHistory'

/** One lift's sets on one day, in the order they were performed. */
export type DaySets = { exercise: string; sets: LoggedSet[] }

/**
 * The sets logged on `keys`, by date — one entry per lift that was trained that
 * day, in the order the lifts first appear in the log.
 *
 * Several keys because a goal can count more than one lift: the bench goal reads
 * either press (see goals.BENCH_ALSO_KEYS), and a day that trained both has both
 * worth showing.
 */
export function setsByDate(rows: WorkoutRow[], keys: Iterable<string>): Record<string, DaySets[]> {
  const wanted = new Set(keys)
  type Ordered = { exercise: string; sets: { order: number; weightLbs: number | null; reps: number }[] }
  const byDate = new Map<string, Ordered[]>()

  for (const r of rows) {
    if (!wanted.has(r.exercise)) continue
    const day = byDate.get(r.date) ?? []
    const entry = day.find((d) => d.exercise === r.exercise) ?? { exercise: r.exercise, sets: [] }
    if (!day.includes(entry)) day.push(entry)
    entry.sets.push({ order: r.set_number, weightLbs: r.weight_lbs, reps: r.reps })
    byDate.set(r.date, day)
  }

  // set_number rather than row order: an edited session writes its sets back in
  // whatever order the sheet held them, and the numbering is what was performed.
  const out: Record<string, DaySets[]> = {}
  for (const [date, day] of byDate) {
    out[date] = day.map((d) => ({
      exercise: d.exercise,
      sets: [...d.sets].sort((a, b) => a.order - b.order).map((s) => ({ weightLbs: s.weightLbs, reps: s.reps })),
    }))
  }
  return out
}
