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

// ---------------------------------------------------------------------------
// Per-exercise rolling averages (the accurate, mix-independent estimate).
//
// For each exercise we keep a rolling AVERAGE active seconds per set plus the
// sample count N, and one pooled rest average across all exercises. This keeps
// time-left accurate for long-used exercises even when the workout mix changes,
// which a per-session (whole-workout) median can't do. See `foldAvg` for the
// incremental update: adding one set-sample is the classic
// newAvg = avg + (sample − avg)/(N+1); we generalise it to fold a whole
// session's summed active time over its set count in one step.
// ---------------------------------------------------------------------------

/** A rolling average and the number of samples that produced it. */
export type Avg = { avgSec: number; n: number }

export const EMPTY_AVG: Avg = { avgSec: 0, n: 0 }

/** Per-exercise active-time averages plus a pooled rest average. */
export type ExerciseAverages = {
  /** Keyed by exercise key → average active seconds per set. */
  active: Record<string, Avg>
  /** Pooled average rest seconds per rest interval, across all exercises. */
  rest: Avg
}

export const EMPTY_EXERCISE_AVERAGES: ExerciseAverages = { active: {}, rest: EMPTY_AVG }

/**
 * Fold `count` samples whose values sum to `sumSec` into a rolling average.
 * Equivalent to applying newAvg = avg + (sample − avg)/(N+1) once per sample,
 * so the result is the exact running mean of every set-sample ever folded:
 *   newAvg = (avg·N + sumSec) / (N + count)
 * A single-sample update is just foldAvg(prev, sample, 1).
 */
export function foldAvg(prev: Avg, sumSec: number, count: number): Avg {
  if (!(count > 0)) return prev
  const n = prev.n + count
  return { avgSec: (prev.avgSec * prev.n + sumSec) / n, n }
}

/** One exercise's contribution from a finished session (summed active time + set count). */
export type ExerciseTimeSample = { exercise: string; totalActiveSec: number; sets: number }

/** A finished session's timing samples, ready to fold into the averages. */
export type SessionTimeSamples = {
  exercises: ExerciseTimeSample[]
  /** Total rest seconds this session and how many rest intervals it spanned. */
  restTotalSec: number
  restCount: number
}

/** Fold a finished session's samples into the running averages (pure). */
export function applySessionSamples(prev: ExerciseAverages, s: SessionTimeSamples): ExerciseAverages {
  const active: Record<string, Avg> = { ...prev.active }
  for (const e of s.exercises) {
    if (!e.exercise || !(e.sets > 0) || !isFiniteSec(e.totalActiveSec)) continue
    active[e.exercise] = foldAvg(active[e.exercise] ?? EMPTY_AVG, e.totalActiveSec, e.sets)
  }
  const rest =
    s.restCount > 0 && isFiniteSec(s.restTotalSec) ? foldAvg(prev.rest, s.restTotalSec, s.restCount) : prev.rest
  return { active, rest }
}

function isFiniteSec(n: number): boolean {
  return typeof n === 'number' && isFinite(n) && n >= 0
}

/** A remaining (not-yet-done) set, with structural fallbacks for day-one. */
export type RemainingStep = { exercise: string; fallbackActiveSec: number; fallbackRestSec: number }

/**
 * Estimated seconds left in a workout = Σ over remaining sets of that exercise's
 * learned average active time + the pooled learned rest. Each term falls back to
 * its structural guess (WORK_PER_SET_SEC / the step's prescribed rest) until a
 * real sample exists, so the number is useful from day one and only grows more
 * accurate as an exercise accumulates history.
 */
export function remainingWorkoutSecs(averages: ExerciseAverages, steps: RemainingStep[]): number {
  const restLearned = averages.rest.n > 0 ? averages.rest.avgSec : null
  let sum = 0
  for (const s of steps) {
    const a = averages.active[s.exercise]
    const active = a && a.n > 0 ? a.avgSec : s.fallbackActiveSec
    const rest = restLearned != null ? restLearned : s.fallbackRestSec
    sum += Math.max(0, active) + Math.max(0, rest)
  }
  return sum
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
