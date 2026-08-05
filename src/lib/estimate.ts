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
// sample count N, and one pooled rest *ratio* across all exercises. This keeps
// time-left accurate for long-used exercises even when the workout mix changes,
// which a per-session (whole-workout) median can't do. See `foldAvg` for the
// incremental update: adding one set-sample is the classic
// newAvg = avg + (sample − avg)/(N+1); we generalise it to fold a whole
// session's summed active time over its set count in one step.
// ---------------------------------------------------------------------------

/** A rolling average and the number of samples that produced it. */
export type Avg = { avgSec: number; n: number }

export const EMPTY_AVG: Avg = { avgSec: 0, n: 0 }

/**
 * How long the user actually rests relative to what was prescribed: a rolling
 * mean of (observed ÷ prescribed) over rest intervals, plus the sample count.
 *
 * Deliberately unitless. Prescribed rests span a wide range — a full inter-set
 * rest of a heavy lift (up to 150s), a brief circuit station change (30s), a
 * capped transition between exercises — so a pooled average of observed
 * *seconds* is dragged toward the short ones and then underestimates every long
 * rest, getting worse the more you train. A ratio scales each step by its own
 * prescription while still learning that you rest, say, 1.15× or 0.8× of it.
 */
export type RestRatio = { ratio: number; n: number }

/** No samples yet → assume the prescription is what happens. */
export const EMPTY_REST_RATIO: RestRatio = { ratio: 1, n: 0 }

/** One freak session (a phone call mid-rest, a skipped rest) can't wreck the mean. */
export const MIN_REST_RATIO = 0.25
export const MAX_REST_RATIO = 4

/**
 * A rest ratio held inside the sane band; anything unusable reads as 1×. Zero is
 * clamped up to the floor rather than rejected — tapping through every rest is a
 * real observation. A *stored* zero is instead treated as "no samples" by
 * {@link normalizeExerciseAverages} and {@link learnedRestRatio}.
 */
export function clampRestRatio(ratio: number): number {
  if (!isFinite(ratio) || ratio < 0) return 1
  return Math.min(MAX_REST_RATIO, Math.max(MIN_REST_RATIO, ratio))
}

/** Per-exercise active-time averages plus the pooled rest ratio. */
export type ExerciseAverages = {
  /** Keyed by exercise key → average active seconds per set. */
  active: Record<string, Avg>
  /** Pooled observed÷prescribed rest ratio, across all exercises. */
  restRatio: RestRatio
}

export const EMPTY_EXERCISE_AVERAGES: ExerciseAverages = { active: {}, restRatio: EMPTY_REST_RATIO }

/**
 * Coerce a persisted or fetched payload into the current shape, degrading
 * anything unrecognised to "no samples yet".
 *
 * Earlier builds stored a pooled `rest: { avgSec, n }` in SECONDS. Reading such
 * a value as a ratio would price every rest at (say) 90× its prescription, so a
 * legacy payload must lose its rest learning rather than keep it — the estimate
 * falls back to prescribed rest and re-learns from the next session.
 */
export function normalizeExerciseAverages(raw: unknown): ExerciseAverages {
  if (!raw || typeof raw !== 'object') return EMPTY_EXERCISE_AVERAGES
  const o = raw as { active?: unknown; restRatio?: unknown }
  const active: Record<string, Avg> = {}
  if (o.active && typeof o.active === 'object') {
    for (const [key, v] of Object.entries(o.active as Record<string, unknown>)) {
      if (!key || !v || typeof v !== 'object') continue
      const avgSec = Number((v as { avgSec?: unknown }).avgSec)
      const n = Number((v as { n?: unknown }).n)
      if (isFiniteSec(avgSec) && isFinite(n) && n > 0) active[key] = { avgSec, n }
    }
  }
  const r = o.restRatio
  const ratio = r && typeof r === 'object' ? Number((r as { ratio?: unknown }).ratio) : NaN
  const n = r && typeof r === 'object' ? Number((r as { n?: unknown }).n) : NaN
  const restRatio: RestRatio =
    isFinite(ratio) && ratio > 0 && isFinite(n) && n > 0
      ? { ratio: clampRestRatio(ratio), n }
      : EMPTY_REST_RATIO
  return { active, restRatio }
}

/** The learned rest ratio, or null while there's nothing trustworthy to apply. */
export function learnedRestRatio(averages: ExerciseAverages): number | null {
  const r = averages.restRatio
  if (!r || !(r.n > 0) || !isFinite(r.ratio) || r.ratio <= 0) return null
  return clampRestRatio(r.ratio)
}

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

/**
 * Fold a session's observed-vs-prescribed rest into the running ratio, as
 * `count` samples of that session's ratio (the same batch semantics as
 * {@link foldAvg}). The session's ratio is clamped before folding, so one weird
 * session is bounded no matter how many rests it spanned.
 */
export function foldRestRatio(
  prev: RestRatio,
  observedSec: number,
  prescribedSec: number,
  count: number,
): RestRatio {
  if (!(count > 0) || !isFiniteSec(observedSec) || !(prescribedSec > 0) || !isFinite(prescribedSec)) return prev
  const sample = clampRestRatio(observedSec / prescribedSec)
  const n = prev.n + count
  return { ratio: (prev.ratio * prev.n + sample * count) / n, n }
}

/** One exercise's contribution from a finished session (summed active time + set count). */
export type ExerciseTimeSample = { exercise: string; totalActiveSec: number; sets: number }

/** A finished session's timing samples, ready to fold into the averages. */
export type SessionTimeSamples = {
  exercises: ExerciseTimeSample[]
  /** Total seconds actually spent resting this session. */
  restTotalSec: number
  /**
   * Total seconds those rests were prescribed to run for — the sum of every
   * rest the session actually served up (see `restBeforeNextSet`), which is what
   * makes `restTotalSec` interpretable as a ratio.
   */
  restPrescribedSec: number
  /** How many rest intervals the session spanned. */
  restCount: number
}

/** Fold a finished session's samples into the running averages (pure). */
export function applySessionSamples(prev: ExerciseAverages, s: SessionTimeSamples): ExerciseAverages {
  const active: Record<string, Avg> = { ...prev.active }
  for (const e of s.exercises) {
    if (!e.exercise || !(e.sets > 0) || !isFiniteSec(e.totalActiveSec)) continue
    active[e.exercise] = foldAvg(active[e.exercise] ?? EMPTY_AVG, e.totalActiveSec, e.sets)
  }
  const restRatio = foldRestRatio(prev.restRatio, s.restTotalSec, s.restPrescribedSec, s.restCount)
  return { active, restRatio }
}

function isFiniteSec(n: number): boolean {
  return typeof n === 'number' && isFinite(n) && n >= 0
}

/**
 * A remaining (not-yet-done) set: which exercise it trains, the day-one guess at
 * its active time, and the rest that will actually be prescribed after it (a full
 * inter-set rest, a circuit station change, or a capped transition — see
 * `restBeforeNextSet`; 0 for the final set, which finishes instead of resting).
 */
export type RemainingStep = { exercise: string; fallbackActiveSec: number; prescribedRestSec: number }

/**
 * Estimated seconds left in a workout = Σ over remaining sets of that exercise's
 * learned average active time + that step's own prescribed rest scaled by the
 * learned rest ratio. Each term falls back to its structural guess
 * (WORK_PER_SET_SEC / the prescription as written) until a real sample exists,
 * so the number is useful from day one and only grows more accurate as history
 * accumulates.
 *
 * Rest is scaled rather than replaced on purpose: a single learned rest duration
 * pooled across full rests, station changes and transitions collapses to
 * something near the short ones and then systematically underestimates the long
 * ones.
 */
export function remainingWorkoutSecs(averages: ExerciseAverages, steps: RemainingStep[]): number {
  const ratio = learnedRestRatio(averages)
  let sum = 0
  for (const s of steps) {
    const a = averages.active[s.exercise]
    const active = a && a.n > 0 ? a.avgSec : s.fallbackActiveSec
    const prescribed = Math.max(0, s.prescribedRestSec)
    sum += Math.max(0, active) + (ratio != null ? prescribed * ratio : prescribed)
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
