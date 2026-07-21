/** Rough time estimates for the guided session UIs. */

import type { DayType } from '../types'

/** Assumed working time per set when we have nothing better (lifting). */
export const WORK_PER_SET_SEC = 40

/** Median of actual durations kicks in once we have at least this many matching sessions. */
export const MIN_DURATION_SAMPLES = 3

/** Ignore recorded durations outside this range (app left open, accidental starts). */
export const MIN_SANE_DURATION_SEC = 2 * 60
export const MAX_SANE_DURATION_SEC = 4 * 60 * 60

export type SessionKind = 'workout' | 'stretch'

/**
 * A completed session's actual wall-clock length, synced to the Sheet so the
 * app can learn typical timing and report time spent. `restSec` is the portion
 * spent on the rest-timer screen; the rest is "active" work/stretch time.
 */
export type SessionDuration = {
  date: string // YYYY-MM-DD
  kind: SessionKind
  dayType?: DayType // push/pull for workouts; omitted for stretches
  totalSec: number
  restSec: number
}

/** Selects the comparable subset of history for an estimate. */
export type DurationSelector = { kind: SessionKind; dayType?: DayType }

export type RemainingItem = { remainingSets: number; workSec: number; restSec: number }

/** Total estimated seconds left = Σ remainingSets × (workSec + restSec). */
export function estimateSecs(items: RemainingItem[]): number {
  return items.reduce((sum, i) => sum + Math.max(0, i.remainingSets) * (i.workSec + i.restSec), 0)
}

/** Median of a list of numbers (0 for an empty list). */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Whether a recorded total duration is plausible enough to learn from. */
export function isSaneDuration(totalSec: number): boolean {
  return totalSec >= MIN_SANE_DURATION_SEC && totalSec <= MAX_SANE_DURATION_SEC
}

/** History entries comparable to `sel`: same kind, and same day type when one is given. */
function matching(history: SessionDuration[], sel: DurationSelector): SessionDuration[] {
  return history.filter(
    (d) =>
      d.kind === sel.kind &&
      (sel.dayType == null || d.dayType === sel.dayType) &&
      isSaneDuration(d.totalSec),
  )
}

/**
 * Median total length of past comparable sessions, or null until there are
 * enough samples to trust it.
 */
export function medianTotalSec(
  history: SessionDuration[],
  sel: DurationSelector,
  minSamples = MIN_DURATION_SAMPLES,
): number | null {
  const samples = matching(history, sel)
  if (samples.length < minSamples) return null
  return median(samples.map((d) => d.totalSec))
}

/**
 * Estimated seconds left in the current session.
 *
 * Once enough real sessions of this kind (and day type) have been logged, scale
 * the median total length by the fraction of steps still remaining. Until then,
 * fall back to the structural per-step estimate so the number is useful from
 * day one.
 */
export function remainingSecs(opts: {
  history: SessionDuration[]
  sel: DurationSelector
  doneSteps: number
  totalSteps: number
  fallbackItems: RemainingItem[]
}): number {
  const { history, sel, doneSteps, totalSteps, fallbackItems } = opts
  const learned = medianTotalSec(history, sel)
  if (learned != null && totalSteps > 0) {
    const remainingFraction = Math.max(0, totalSteps - doneSteps) / totalSteps
    return learned * remainingFraction
  }
  return estimateSecs(fallbackItems)
}

/** Human-friendly duration, e.g. "~12 min" / "<1 min" / "0 min". */
export function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return '0 min'
  const min = Math.round(totalSec / 60)
  if (min < 1) return '<1 min'
  return `~${min} min`
}
