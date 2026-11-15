/**
 * Aggregates logged session durations into the three reportable buckets:
 * active working out, active stretching, and resting (time on the rest-timer
 * screen, from both workout and stretch sessions).
 *
 *   total session time = active time + rest time
 *   active = total − rest, attributed to workout or stretch by session kind
 *   rest   = pooled across both kinds
 */
import type { SessionDuration } from './estimate'

export type ActivityTotals = { workoutSec: number; stretchSec: number; restSec: number }

/** One month's totals; `month` is a YYYY-MM key. */
export type ActivityMonth = ActivityTotals & { month: string }

/** Seconds → whole minutes. */
export function secToMin(sec: number): number {
  return Math.round(sec / 60)
}

/** Add one duration's contribution into a running totals bucket. */
function accumulate(into: ActivityTotals, d: SessionDuration): void {
  if (!(d.totalSec > 0)) return
  const rest = Math.max(0, Math.min(d.restSec || 0, d.totalSec))
  const active = d.totalSec - rest
  into.restSec += rest
  if (d.kind === 'stretch') into.stretchSec += active
  else into.workoutSec += active
}

/** Combined totals across all given durations. */
export function activityTotals(durations: SessionDuration[]): ActivityTotals {
  const totals: ActivityTotals = { workoutSec: 0, stretchSec: 0, restSec: 0 }
  for (const d of durations) accumulate(totals, d)
  return totals
}

/** Per-month totals, oldest month first. */
export function monthlyActivity(durations: SessionDuration[]): ActivityMonth[] {
  const byMonth = new Map<string, ActivityMonth>()
  for (const d of durations) {
    if (!d.date) continue
    const month = d.date.slice(0, 7) // YYYY-MM
    let bucket = byMonth.get(month)
    if (!bucket) {
      bucket = { month, workoutSec: 0, stretchSec: 0, restSec: 0 }
      byMonth.set(month, bucket)
    }
    accumulate(bucket, d)
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
}

/**
 * Where a month's totals land if the rest of it goes like the part already
 * lived. Only the month `today` falls in is still being written, so any other
 * month — or a current month on its last day — returns null: there is nothing
 * left to project. The elapsed share counts today as a whole day, so a session
 * logged this morning isn't stretched across a day that has barely started.
 */
export function projectMonth(m: ActivityMonth, today: Date): ActivityMonth | null {
  const y = today.getFullYear()
  const mo = today.getMonth()
  const key = `${y}-${String(mo + 1).padStart(2, '0')}`
  if (m.month !== key) return null
  const daysInMonth = new Date(y, mo + 1, 0).getDate()
  const elapsed = today.getDate()
  if (elapsed >= daysInMonth) return null
  const scale = daysInMonth / elapsed
  return {
    month: m.month,
    workoutSec: m.workoutSec * scale,
    stretchSec: m.stretchSec * scale,
    restSec: m.restSec * scale,
  }
}
