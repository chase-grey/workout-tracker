import { useMemo } from 'react'
import { useData } from '../store/DataContext'
import type { VariantKey } from '../config/plan'
import { lastPerformance, type Target } from '../lib/progression'
import {
  exerciseHistory,
  fmtBestSet,
  fmtSessionDate,
  fmtSet,
  fmtTarget,
  sessionsAtTargetLabel,
  targetDeltaLabel,
  type CountUnit,
} from '../lib/exerciseHistory'
import { discomfortCounts, discomfortReports, fmtDiscomfortCount } from '../lib/discomfort'

/**
 * Recent-performance sheet for one exercise, opened from the target row
 * mid-workout so the set you're about to do lands against what you last actually
 * did.
 *
 * It leads with today's target and how it differs from the last session, then
 * lists the last few sessions set by set — the numbers as logged, so a session
 * that fell apart on its third set still reads that way. The long view (trends,
 * estimated 1RM) belongs to the progress tab, which owns the charts.
 */
export function ExerciseHistorySheet({
  exerciseKey,
  name,
  target,
  slot,
  repsOnly = false,
  unit = 'rep',
  onClose,
}: {
  exerciseKey: string
  name: string
  /** Today's prescribed target, shown at the top and compared against history. */
  target?: Target
  /**
   * The A/B slot today's set belongs to, so the sessions listed are the ones
   * today is actually comparable to — a second press reads against past second
   * presses, not against the days the lift led. Absent for the lifts (and days)
   * the variants train alike, which list every session.
   */
  slot?: VariantKey
  /**
   * The lift is tracked by reps alone, so its sets and target read as bare reps.
   * Taken from the plan rather than inferred from the target, which is also
   * weightless on the first-ever session of a loaded lift.
   */
  repsOnly?: boolean
  /**
   * What the logged number counts. A timed hold logs seconds in the same field a
   * lift logs reps, so its sets read `30s` rather than `30 reps` (see
   * PlannedExercise.timed).
   */
  unit?: CountUnit
  onClose: () => void
}) {
  const { workouts } = useData()

  const history = useMemo(
    () => exerciseHistory(workouts, exerciseKey, slot),
    [workouts, exerciseKey, slot],
  )
  // Slot-scoped, so the delta reads against a session trained under the same
  // fatigue. The sheet isn't handed the exercise's rep range, so repMin stays 1 —
  // plain "heaviest set of the last session", which is what the delta claims.
  const last = useMemo(
    () => lastPerformance(workouts, exerciseKey, 1, slot),
    [workouts, exerciseKey, slot],
  )

  // Every session this lift was flagged in, not just the ones in `slot`: which
  // press led that day has nothing to do with a knee, and scoping it would hide
  // half the repeats the tally exists to show (see lib/discomfort).
  const flags = useMemo(
    () => discomfortCounts(discomfortReports(workouts, exerciseKey)),
    [workouts, exerciseKey],
  )

  const delta = targetDeltaLabel(target, last, repsOnly, unit)
  const atTarget = sessionsAtTargetLabel(history, target, repsOnly, unit)

  return (
    // Above the rest overlay (z-50) so it's reachable from either screen.
    <div className="fixed inset-0 z-60 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <h3 className="mb-3 text-lg font-bold">{name}</h3>

        {target && (
          <div className="mb-3 rounded-2xl bg-surface-2 p-3">
            <div className="text-xs text-neutral-500">today</div>
            <div className="text-2xl font-bold tabular-nums">{fmtTarget(target, repsOnly, unit)}</div>
            {delta && <div className="text-sm text-neutral-400">{delta}</div>}
          </div>
        )}

        {flags.length > 0 && (
          <div className="mb-3 rounded-2xl bg-surface-2 p-3">
            <div className="text-xs text-neutral-500">discomfort flagged</div>
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-amber-400">
              {flags.map((c) => (
                <span key={c.spot}>{fmtDiscomfortCount(c)}</span>
              ))}
            </div>
          </div>
        )}

        {history.recent.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-2xl bg-surface-2 text-sm text-neutral-500">
            nothing logged for this yet
          </div>
        ) : (
          <>
            <div className="mb-1 text-xs text-neutral-500">recent sessions</div>
            <div className="divide-y divide-border rounded-2xl bg-surface-2 px-3">
              {history.recent.map((s) => (
                <div key={s.id} className="flex gap-3 py-2 text-sm">
                  <span className="w-16 shrink-0 text-neutral-500">{fmtSessionDate(s.date)}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-neutral-200 tabular-nums">
                    {s.sets.map((set, i) => (
                      <span key={i}>{fmtSet(set, unit)}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 px-1 text-xs text-neutral-500 tabular-nums">
              {history.best && (
                <span>
                  best {fmtBestSet(history.best, unit)} · {fmtSessionDate(history.best.date)}
                </span>
              )}
              {atTarget && <span>{atTarget}</span>}
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="mt-4 min-h-[48px] w-full rounded-2xl bg-surface-2 font-semibold text-neutral-200 active:opacity-80"
        >
          close
        </button>
      </div>
    </div>
  )
}
