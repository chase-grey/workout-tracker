/**
 * The sets behind a goal's readings, keyed by the date they were performed.
 *
 * A goal's line plots one number per session, and that number leaves the rest of
 * the session out: the pull-up ladder reads the best set alone (see
 * goals.PULLUP_GOAL_SETS), so a session that went 9, 8, 6, 5 plots as 9 and says
 * nothing of the three sets after it. The e1RM goals have the gap in another
 * form — the line is a formula's answer, not a weight that was on the bar.
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

/** How far under the day's best a set can fall and still count as done at that number. */
export const NEAR_BEST_REPS = 1

/** Past this many sets a mark stops growing — the count the plan trains everywhere. */
export const FULL_SETS = 4

/**
 * How many of a day's sets came within a rep of its best one.
 *
 * A rep goal plots the day's best set and nothing else, so 7 once and 7 four
 * times land on the same spot. This is what tells them apart: the number of
 * sets that backed the plotted one up. Only sets near the top count, because a
 * 10 followed by three 3s is one set of ten, not four.
 */
export function setsNearBest(day: DaySets[] | undefined): number {
  const reps = (day ?? []).flatMap((d) => d.sets.map((s) => s.reps))
  if (reps.length === 0) return 0
  const best = Math.max(...reps)
  return reps.filter((n) => n >= best - NEAR_BEST_REPS).length
}

/**
 * The radius of a reading's dot, given the sets behind it (see
 * {@link setsNearBest}): the usual 2 for one set, a pixel more for each set
 * after it, and no bigger once the day is a full {@link FULL_SETS}.
 */
export function setsDotRadius(sets: number): number {
  return 2 + Math.min(Math.max(sets, 1), FULL_SETS) - 1
}
