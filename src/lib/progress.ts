import type { WorkoutRow } from '../types'
import { ALL_EXERCISES, QUICK_LOG_KEY } from '../config/plan'
import { epley1RM } from './epley'
import { parseISODate } from './dates'

export type Metric = '1rm' | 'weight' | 'volume'
export type Point = { date: string; value: number }

/** One data point per session for a given exercise, sorted oldest → newest. */
export function exerciseSeries(rows: WorkoutRow[], exerciseKey: string, metric: Metric): Point[] {
  const bySession = new Map<string, { date: string; sets: { w: number | null; reps: number }[] }>()
  for (const r of rows) {
    if (r.exercise !== exerciseKey) continue
    const key = r.session_id || r.date
    const g = bySession.get(key) ?? { date: r.date, sets: [] }
    g.sets.push({ w: r.weight_lbs, reps: r.reps })
    bySession.set(key, g)
  }

  const points = [...bySession.values()].map((g) => {
    let value = 0
    if (metric === 'volume') {
      value = g.sets.reduce((s, x) => s + (x.w ?? 0) * x.reps, 0)
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

/** Keep points within the last `months` (null = all time). */
export function filterRange(points: Point[], months: number | null, today: Date = new Date()): Point[] {
  if (months == null) return points
  const cutoff = new Date(today.getFullYear(), today.getMonth() - months, today.getDate())
  return points.filter((p) => parseISODate(p.date) >= cutoff)
}
