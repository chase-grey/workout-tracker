import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../store/DataContext'
import { exerciseSeries, type Metric } from '../lib/progress'
import type { VariantKey } from '../config/plan'
import { epley1RM } from '../lib/epley'
import { fmtDateLabel, LINE_PRIMARY, timeXAxis, withTime } from '../lib/chart'
import type { Target } from '../lib/progression'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/**
 * All-time chart for one exercise, opened from the target row mid-workout so the
 * set you're about to do lands in the context of everything you've lifted on it.
 *
 * The metric defaults to est. 1RM, which is the honest way to compare sets at
 * different weight × rep combinations. A reps-only move has no weight to work
 * from, so it charts total reps per session instead. The dashed line marks where
 * today's target sits against that history.
 */
export function ExerciseHistorySheet({
  exerciseKey,
  name,
  target,
  plannedSets,
  slot,
  repsOnly = false,
  onClose,
}: {
  exerciseKey: string
  name: string
  /** Today's prescribed target, drawn as a reference line. */
  target?: Target
  /** Sets planned today, for scaling a per-set target onto a session-total axis. */
  plannedSets?: number
  /**
   * The A/B slot today's set belongs to, so the chart shows the sessions today is
   * actually comparable to — a second press reads against past second presses,
   * not against the days the lift led. Absent for the lifts (and days) the
   * variants train alike, which chart every session.
   */
  slot?: VariantKey
  /**
   * The lift is tracked by reps alone, so weight-based metrics would chart a flat
   * zero line. Taken from the plan rather than inferred from the target, which is
   * also weightless on the first-ever session of a loaded lift.
   */
  repsOnly?: boolean
  onClose: () => void
}) {
  const { workouts } = useData()
  const [metric, setMetric] = useState<Metric>(repsOnly ? 'reps' : '1rm')

  const data = useMemo(
    () => exerciseSeries(workouts, exerciseKey, metric, slot),
    [workouts, exerciseKey, metric, slot],
  )

  // Where today's target falls on the current metric's scale. The reps and volume
  // series are session TOTALS (see exerciseSeries), but a target is per-set, so
  // those have to be scaled by the number of sets planned or the line would sit on
  // the chart floor claiming to be today's work.
  const targetValue = useMemo(() => {
    if (!target) return null
    if (metric === 'reps') return plannedSets != null ? target.reps * plannedSets : null
    if (target.weightLbs == null) return null
    if (metric === '1rm') return Math.round(epley1RM(target.weightLbs, target.reps) * 10) / 10
    if (metric === 'weight') return target.weightLbs
    if (metric === 'volume') {
      return plannedSets != null ? target.weightLbs * target.reps * plannedSets : null
    }
    return null
  }, [target, metric, plannedSets])

  const best = data.length ? Math.max(...data.map((p) => p.value)) : 0
  const unit = metric === 'reps' ? 'reps' : metric === 'volume' ? 'vol' : 'lbs'
  const options: { label: string; value: Metric }[] = repsOnly
    ? [{ label: 'reps', value: 'reps' }]
    : [
        { label: 'est. 1rm', value: '1rm' },
        { label: 'top set', value: 'weight' },
        { label: 'volume', value: 'volume' },
        { label: 'reps', value: 'reps' },
      ]

  return (
    // Above the rest overlay (z-50) so it's reachable from either screen.
    <div className="fixed inset-0 z-60 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-bold">{name}</h3>
          <span className="text-sm text-neutral-400 tabular-nums">
            {data.length ? `best ${best} ${unit}` : 'no history yet'}
          </span>
        </div>

        {options.length > 1 && (
          <div className="mb-3 flex gap-1 rounded-xl bg-surface-2 p-1">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => setMetric(o.value)}
                className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
                  o.value === metric ? 'bg-accent text-black' : 'text-neutral-400'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {data.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-2xl bg-surface-2 text-sm text-neutral-500">
            first time logging this — no chart yet
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-2 p-2">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={withTime(data)} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="#262626" vertical={false} />
                <XAxis {...timeXAxis} tick={axisTick} />
                <YAxis tick={axisTick} width={40} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelStyle={{ color: '#a3a3a3' }}
                  labelFormatter={(ms) => fmtDateLabel(Number(ms))}
                  formatter={(v) => [`${v} ${unit}`, metric]}
                />
                {targetValue != null && (
                  <ReferenceLine
                    y={targetValue}
                    stroke="#facc15"
                    strokeDasharray="4 4"
                    label={{ value: 'today', fill: '#facc15', fontSize: 11, position: 'insideTopRight' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={LINE_PRIMARY}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
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
