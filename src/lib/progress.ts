import type { WorkoutRow } from '../types'
import { ALL_EXERCISES, QUICK_LOG_KEY, type VariantKey } from '../config/plan'
import { epley1RM } from './epley'
import { parseISODate } from './dates'
import { leadVariantForKey } from './pushVariant'

export type Metric = '1rm' | 'weight' | 'volume' | 'reps'
export type Point = { date: string; value: number }

/**
 * Which A/B slot of a variant day a series reads.
 *
 * - `'lead'` — only the slot that trains the lift freshest. The strength read:
 *   Push + Core benches twice a week, and the session that follows four other
 *   exercises is necessarily lighter, so plotting both draws a sawtooth that
 *   looks like backsliding every other session when nothing was lost.
 * - `'all'` — every session, whatever slot.
 * - `'A'` / `'B'` — one named slot, for comparing like with like against the
 *   session you're in right now.
 *
 * An exercise the variants train alike (most of the plan) reads every session
 * under any of these.
 */
export type SlotScope = 'lead' | 'all' | VariantKey

/**
 * The slot a metric reads when the caller doesn't say.
 *
 * Top weight and estimated 1RM are strength readings, so they read the lead slot
 * only. Volume and reps are workload, not strength — a second-press session's
 * sets are real work that really was done — so those count every session.
 */
function defaultSlot(metric: Metric): SlotScope {
  return metric === 'volume' || metric === 'reps' ? 'all' : 'lead'
}

/** One data point per session for a given exercise, sorted oldest → newest. */
export function exerciseSeries(
  rows: WorkoutRow[],
  exerciseKey: string,
  metric: Metric,
  /** Which A/B slot to read; omitted takes the metric's default (see defaultSlot). */
  slot?: SlotScope,
): Point[] {
  const scope = slot ?? defaultSlot(metric)
  const wanted =
    scope === 'all' ? null : scope === 'lead' ? leadVariantForKey(exerciseKey) : scope

  const bySession = new Map<
    string,
    { date: string; variant?: VariantKey; sets: { w: number | null; reps: number }[] }
  >()
  for (const r of rows) {
    if (r.exercise !== exerciseKey) continue
    const key = r.session_id || r.date
    const g = bySession.get(key) ?? { date: r.date, sets: [] }
    // A blank from the sheet or a CSV round-trip reads as "no slot recorded".
    if (g.variant == null && r.variant) g.variant = r.variant
    g.sets.push({ w: r.weight_lbs, reps: r.reps })
    bySession.set(key, g)
  }

  // Drop the sessions trained in another slot. A session with no slot recorded is
  // kept whatever the scope — imported history, or a day that doesn't run
  // variants, neither of which sat behind a second press of the same lift.
  if (wanted != null) {
    for (const [key, g] of bySession) {
      if (g.variant != null && g.variant !== wanted) bySession.delete(key)
    }
  }

  const points = [...bySession.values()].map((g) => {
    let value = 0
    if (metric === 'volume') {
      value = g.sets.reduce((s, x) => s + (x.w ?? 0) * x.reps, 0)
    } else if (metric === 'reps') {
      // Total reps in the session — the growth signal for bodyweight work
      // (deadbugs, hanging leg raises) where weight-based metrics stay flat.
      value = g.sets.reduce((s, x) => s + x.reps, 0)
    } else {
      for (const x of g.sets) {
        if (x.w == null) continue
        value = Math.max(value, metric === '1rm' ? epley1RM(x.w, x.reps) : x.w)
      }
    }
    return { date: g.date, value: Math.round(value * 10) / 10 }
  })

  return points.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * One point per session summing total reps across a *set* of exercise keys —
 * e.g. all core moves combined, so ab work shows up regardless of which ab
 * exercise (cable crunch, hanging leg raise, deadbug) was logged that session.
 */
export function combinedRepsSeries(rows: WorkoutRow[], keys: Set<string>): Point[] {
  const bySession = new Map<string, { date: string; reps: number }>()
  for (const r of rows) {
    if (!keys.has(r.exercise)) continue
    const key = r.session_id || r.date
    const g = bySession.get(key) ?? { date: r.date, reps: 0 }
    g.reps += r.reps
    bySession.set(key, g)
  }
  return [...bySession.values()]
    .map((g) => ({ date: g.date, value: g.reps }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Prettify a slug/free-text key into a Title Case display name. */
function prettifyKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * The exercises available to chart: all plan exercises (in plan order) followed
 * by any distinct exercise keys present in `workouts` that aren't in the plan,
 * sorted alphabetically by their derived display name.
 */
export function availableExercises(workouts: WorkoutRow[]): { key: string; name: string }[] {
  const planKeys = new Set(ALL_EXERCISES.map((e) => e.key))
  const planList = ALL_EXERCISES.map((e) => ({ key: e.key, name: e.name }))

  const extraKeys = new Set<string>()
  for (const r of workouts) {
    if (r.exercise && r.exercise !== QUICK_LOG_KEY && !planKeys.has(r.exercise)) extraKeys.add(r.exercise)
  }

  const extras = [...extraKeys]
    .map((key) => ({ key, name: prettifyKey(key) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  return [...planList, ...extras]
}

/** The distinct sessions each exercise key was logged in. */
function sessionsByExercise(rows: WorkoutRow[]): Map<string, Set<string>> {
  const byKey = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.exercise) continue
    const sessions = byKey.get(r.exercise) ?? new Set<string>()
    sessions.add(r.session_id || r.date)
    byKey.set(r.exercise, sessions)
  }
  return byKey
}

/**
 * How many distinct sessions logged any of `keys` — the union, so a combined
 * series (flat + incline bench) counts a session once even if both were trained.
 */
export function sessionCount(rows: WorkoutRow[], keys: Iterable<string>): number {
  const byKey = sessionsByExercise(rows)
  const all = new Set<string>()
  for (const key of keys) for (const s of byKey.get(key) ?? []) all.add(s)
  return all.size
}

/**
 * The chartable exercises ordered by how often they've actually been trained,
 * most sessions first, so the lifts in current rotation sit at the top of the
 * picker. Never-logged plan exercises fall to the bottom in plan order — the
 * sort is stable, so anything tied keeps availableExercises' ordering.
 */
export function exercisesByFrequency(
  workouts: WorkoutRow[],
): { key: string; name: string; sessions: number }[] {
  const byKey = sessionsByExercise(workouts)
  return availableExercises(workouts)
    .map((e) => ({ ...e, sessions: byKey.get(e.key)?.size ?? 0 }))
    .sort((a, b) => b.sessions - a.sessions)
}

/** Keep points within the last `months` (null = all time). */
export function filterRange(points: Point[], months: number | null, today: Date = new Date()): Point[] {
  if (months == null) return points
  const cutoff = new Date(today.getFullYear(), today.getMonth() - months, today.getDate())
  return points.filter((p) => parseISODate(p.date) >= cutoff)
}
