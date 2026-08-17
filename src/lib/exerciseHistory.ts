/**
 * Recent-performance readout for one exercise: the last few sessions set by set,
 * plus the two facts that put today's target in context (the best set you've ever
 * done, and how long you've been sitting at the weight you're about to lift).
 *
 * Mid-workout the useful question isn't "what does my estimated 1RM curve look
 * like" — it's "what did I actually do last time, and is today more?". So this
 * module shapes raw rows into sessions rather than into a trend, and keeps the
 * numbers as they were logged: no 1RM estimates, no per-session aggregates that
 * hide a bad third set.
 *
 * Pure module — no React/DOM — so it stays unit-testable.
 */

import type { WorkoutRow } from '../types'
import type { VariantKey } from '../config/plan'
import type { LastPerformance, Target } from './progression'

/** How many past sessions the sheet lists by default. */
export const RECENT_SESSION_LIMIT = 5

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** One set as it was logged. A null weight is an unloaded (reps-only) set. */
export type LoggedSet = { weightLbs: number | null; reps: number }

export type ExerciseSession = {
  /** Grouping key — the session id, or the date for rows saved without one. */
  id: string
  date: string
  /** Every set of the exercise that session, in the order they were performed. */
  sets: LoggedSet[]
  /** Heaviest weight worked that session; null when nothing was loaded. */
  topWeight: number | null
  /** Best reps at `topWeight` — or the most reps in a set when nothing was loaded. */
  topReps: number
}

/** A single set worth remembering, with the session it happened in. */
export type BestSet = { date: string; weightLbs: number | null; reps: number }

export type ExerciseHistory = {
  /** Most recent sessions first, capped at the limit. */
  recent: ExerciseSession[]
  /** Every session in scope, ignoring the limit. */
  sessions: number
  /**
   * The best set ever logged: the heaviest, taking the best reps at that weight.
   * A lift with no weight anywhere falls back to the most reps in a set, so a
   * reps-only move still has a record to beat. Null when there's no history.
   */
  best: BestSet | null
  /** Sessions worked at each weight, keyed by the session's top weight. */
  sessionsByWeight: Record<number, number>
  /** Sessions at each top rep count — the reps-only reading of the above. */
  sessionsByReps: Record<number, number>
}

/** Trim a weight to one decimal so 137.5 reads as itself and 135.0 as `135`. */
function num(n: number): string {
  return String(Math.round(n * 10) / 10)
}

function plural(n: number, word: string): string {
  return `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`
}

/**
 * What the number logged for a set counts. Reps for nearly everything; seconds for
 * a timed hold, where the same field carries how long it was held (see
 * PlannedExercise.timed) and calling that "30 reps" would be nonsense.
 */
export type CountUnit = 'rep' | 'sec'

/** A logged count in words: `12 reps`, or `30s` for a hold. */
function count(n: number, unit: CountUnit): string {
  return unit === 'sec' ? `${n}s` : plural(n, 'rep')
}

/** `'2026-07-29'` → `jul 29`, with a `'25` suffix once the year isn't this one. */
export function fmtSessionDate(date: string, today: Date = new Date()): string {
  const [y, m, d] = date.split('-')
  const label = `${MONTH_ABBR[Number(m) - 1] ?? m} ${Number(d)}`
  return Number(y) === today.getFullYear() ? label : `${label} '${y.slice(2)}`
}

/** One set as `130×8`, or just `18` — `18s` for a hold — when it carried no weight. */
export function fmtSet(set: LoggedSet, unit: CountUnit = 'rep'): string {
  if (set.weightLbs != null) return `${num(set.weightLbs)}×${set.reps}`
  return unit === 'sec' ? `${set.reps}s` : String(set.reps)
}

/** The best set for the footer: `155×5`, or `22 reps` when it carried no weight. */
export function fmtBestSet(set: LoggedSet, unit: CountUnit = 'rep'): string {
  return set.weightLbs == null ? count(set.reps, unit) : fmtSet(set, unit)
}

/** Today's prescription as `135 × 8`, or `8 reps` when there's no weight to give. */
export function fmtTarget(target: Target, repsOnly = false, unit: CountUnit = 'rep'): string {
  if (repsOnly || target.weightLbs == null) return count(target.reps, unit)
  return `${num(target.weightLbs)} × ${target.reps}`
}

/**
 * The best reps at the session's working weight — the heaviest weight it touched,
 * or simply the most reps in a set when nothing was loaded.
 */
function topOf(sets: LoggedSet[]): { topWeight: number | null; topReps: number } {
  let topWeight: number | null = null
  for (const s of sets) {
    if (s.weightLbs != null && (topWeight == null || s.weightLbs > topWeight)) topWeight = s.weightLbs
  }
  let topReps = 0
  for (const s of sets) {
    if (topWeight == null || s.weightLbs === topWeight) topReps = Math.max(topReps, s.reps)
  }
  return { topWeight, topReps }
}

/** Whether `set` outranks the best seen so far: heavier first, then more reps. */
function beats(set: LoggedSet, best: BestSet): boolean {
  if (set.weightLbs == null) return best.weightLbs == null && set.reps > best.reps
  if (best.weightLbs == null) return true
  return set.weightLbs > best.weightLbs || (set.weightLbs === best.weightLbs && set.reps > best.reps)
}

/**
 * The recent history of one exercise, newest session first.
 *
 * `slot` scopes the read to one A/B slot the way `exerciseSeries` does: a
 * session recorded in the other slot is dropped, and a session with no slot
 * recorded is kept whatever the scope — imported history, or a day that doesn't
 * run variants, neither of which sat behind a second press of the same lift.
 */
export function exerciseHistory(
  rows: WorkoutRow[],
  exerciseKey: string,
  slot?: VariantKey,
  limit: number = RECENT_SESSION_LIMIT,
): ExerciseHistory {
  type Group = {
    id: string
    date: string
    variant?: VariantKey
    sets: { order: number; weightLbs: number | null; reps: number }[]
  }

  const bySession = new Map<string, Group>()
  for (const r of rows) {
    if (r.exercise !== exerciseKey) continue
    const id = r.session_id || r.date
    const g = bySession.get(id) ?? { id, date: r.date, sets: [] }
    // A blank from the sheet or a CSV round-trip reads as "no slot recorded".
    if (g.variant == null && r.variant) g.variant = r.variant
    g.sets.push({ order: r.set_number, weightLbs: r.weight_lbs, reps: r.reps })
    bySession.set(id, g)
  }

  if (slot != null) {
    for (const [id, g] of bySession) {
      if (g.variant != null && g.variant !== slot) bySession.delete(id)
    }
  }

  // Oldest → newest, so the walk below credits a record to the first session that
  // hit it rather than the last. Rows arrive in save order, and the sort is
  // stable, so two sessions on one date keep the order they were logged in.
  const sessions: ExerciseSession[] = [...bySession.values()]
    .map((g) => {
      // set_number, not row order: an edited session can write its sets back in
      // any order, and the sheet's numbering is what the lifter actually did.
      const sets = [...g.sets]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ weightLbs: s.weightLbs, reps: s.reps }))
      return { id: g.id, date: g.date, sets, ...topOf(sets) }
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let best: BestSet | null = null
  const sessionsByWeight: Record<number, number> = {}
  const sessionsByReps: Record<number, number> = {}
  for (const s of sessions) {
    for (const set of s.sets) {
      if (best == null || beats(set, best)) {
        best = { date: s.date, weightLbs: set.weightLbs, reps: set.reps }
      }
    }
    if (s.topWeight != null) sessionsByWeight[s.topWeight] = (sessionsByWeight[s.topWeight] ?? 0) + 1
    if (s.topReps > 0) sessionsByReps[s.topReps] = (sessionsByReps[s.topReps] ?? 0) + 1
  }

  return {
    recent: [...sessions].reverse().slice(0, Math.max(0, limit)),
    sessions: sessions.length,
    best,
    sessionsByWeight,
    sessionsByReps,
  }
}

/**
 * Today's target against the last comparable session's top set, in one line.
 *
 * `last` comes from `lastPerformance`, which is already slot-scoped, so the
 * comparison is against a session trained under the same fatigue wherever one
 * exists.
 */
export function targetDeltaLabel(
  target: Target | undefined,
  last: LastPerformance | null,
  repsOnly = false,
  unit: CountUnit = 'rep',
): string {
  if (last === null) return 'first time logging this'
  if (target == null) return ''

  const repDelta = target.reps - last.topReps

  // No weight on either side of the comparison: reps are the whole story.
  if (repsOnly || target.weightLbs == null || last.topWeight == null) {
    if (repDelta === 0) return 'same as last session'
    return `${repDelta > 0 ? '+' : '-'}${count(Math.abs(repDelta), unit)} from last session`
  }

  const weightDelta = target.weightLbs - last.topWeight
  if (weightDelta !== 0) {
    return `${weightDelta > 0 ? '+' : '-'}${num(Math.abs(weightDelta))} lbs from last session`
  }
  if (repDelta === 0) return 'same as last session'
  return `same weight, ${repDelta > 0 ? '+' : '-'}${count(Math.abs(repDelta), unit)}`
}

/**
 * How long today's load has been the load — `4 sessions at 130 lbs`, or the rep
 * count for a lift that carries no weight. Empty when the target's weight has
 * never been worked, which the delta line above already covers.
 */
export function sessionsAtTargetLabel(
  history: ExerciseHistory,
  target: Target | undefined,
  repsOnly = false,
  unit: CountUnit = 'rep',
): string {
  if (target == null) return ''
  if (repsOnly || target.weightLbs == null) {
    const sessions = history.sessionsByReps[target.reps] ?? 0
    return sessions === 0 ? '' : `${plural(sessions, 'session')} at ${count(target.reps, unit)}`
  }
  const atWeight = history.sessionsByWeight[target.weightLbs] ?? 0
  return atWeight === 0 ? '' : `${plural(atWeight, 'session')} at ${num(target.weightLbs)} lbs`
}
