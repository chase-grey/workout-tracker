/** Rough time estimates for the guided session UIs. */

import type { DayType } from '../types'

/** Assumed working time per set when we have nothing better (lifting). */
export const WORK_PER_SET_SEC = 40

/** Median of actual durations kicks in once we have at least this many sessions of a day type. */
export const MIN_DURATION_SAMPLES = 3

/** Ignore recorded durations outside this range (app left open, accidental starts). */
export const MIN_SANE_DURATION_SEC = 2 * 60
export const MAX_SANE_DURATION_SEC = 4 * 60 * 60

/** A completed workout's actual wall-clock length, kept device-local to learn typical timing. */
export type SessionDuration = { date: string; dayType: DayType; seconds: number }

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

/** Whether a recorded duration is plausible enough to learn from. */
export function isSaneDuration(seconds: number): boolean {
  return seconds >= MIN_SANE_DURATION_SEC && seconds <= MAX_SANE_DURATION_SEC
}

/**
 * Median total length of past sessions for one day type, or null until we have
 * enough samples to trust it. Only plausible durations are counted.
 */
export function medianTotalSec(
  history: SessionDuration[],
  dayType: DayType,
  minSamples = MIN_DURATION_SAMPLES,
): number | null {
  const samples = history.filter((d) => d.dayType === dayType && isSaneDuration(d.seconds))
  if (samples.length < minSamples) return null
  return median(samples.map((d) => d.seconds))
}

/**
 * Estimated seconds left in the current session.
 *
 * Once enough real sessions have been logged for this day type, scale the
 * median total length by the fraction of sets still remaining. Until then, fall
 * back to the structural per-set estimate so the number is useful from day one.
 */
export function remainingSecs(opts: {
  history: SessionDuration[]
  dayType: DayType
  doneSets: number
  totalSets: number
  fallbackItems: RemainingItem[]
}): number {
  const { history, dayType, doneSets, totalSets, fallbackItems } = opts
  const learned = medianTotalSec(history, dayType)
  if (learned != null && totalSets > 0) {
    const remainingFraction = Math.max(0, totalSets - doneSets) / totalSets
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
