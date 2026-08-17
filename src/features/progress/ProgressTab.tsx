import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../../store/DataContext'
import {
  exerciseSeries,
  exercisesByFrequency,
  filterRange,
  offSlotSeries,
  sessionCount,
  type Metric,
  type Point,
} from '../../lib/progress'
import { weeklyCalorieSurplusSeries } from '../../lib/calories'
import { buildGoals, GOAL_IDS } from '../../lib/goals'
import {
  fmtDateLabel,
  LINE_PRIMARY,
  LINE_SECONDARY,
  MARK_OFF_SLOT,
  niceScale,
  offSlotDot,
  OFF_SLOT_NAME,
  timeXAxis,
  withTime,
} from '../../lib/chart'
import { useChartReadout } from '../../lib/useChartReadout'
import { AxisBreak } from '../../components/AxisBreak'
import { ExercisePicker } from './ExercisePicker'
import { GoalsPanel } from './GoalsPanel'
import { MetricChart } from './MetricChart'
import { MuscleAvatar } from './MuscleAvatar'
import { TimeSpent } from './TimeSpent'
import { MeasurementLogSheet } from '../today/MeasurementLogSheet'
import { bodyFatSeries, waistSeries, latestMeasurement, effectiveBodyFat } from '../../lib/bodyComp'
import { ReviewOverlay } from '../../components/ReviewOverlay'
import {
  buildReview,
  monthKeyOf,
  prevMonthKey,
  prevYearKey,
  reviewHasData,
  yearKeyOf,
  type Review,
  type ReviewKind,
} from '../../lib/review'

const BENCH_COMBO = '__bench__'

const RANGES: { label: string; months: number | null }[] = [
  { label: '3m', months: 3 },
  { label: '6m', months: 6 },
  { label: 'all', months: null },
]

const METRICS: { label: string; value: Metric }[] = [
  { label: 'est. 1rm', value: '1rm' },
  { label: 'top set', value: 'weight' },
  { label: 'volume', value: 'volume' },
  { label: 'reps', value: 'reps' },
]

function Pills<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
            o.value === value ? 'bg-accent text-black' : 'text-neutral-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/**
 * The two presses on one set of rows, plus the sessions neither line reads.
 *
 * The off-slot sessions share a column because they can't collide: incline leads
 * variant A and flat leads variant B, so exactly one of the two presses is the
 * day's second one, and a date never has an off-slot reading for both.
 */
function mergeSeries(flat: Point[], incline: Point[], offSlot: Point[] = []) {
  const m = new Map<string, { date: string; flat?: number; incline?: number; off?: number }>()
  for (const p of flat) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), flat: p.value })
  for (const p of incline) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), incline: p.value })
  for (const p of offSlot) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), off: p.value })
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

function BenchChart({ data, unit }: { data: ReturnType<typeof mergeSeries>; unit: string }) {
  const readout = useChartReadout()
  const yScale = useMemo(
    () =>
      niceScale(
        data.flatMap((r) => [r.flat, r.incline, r.off]).filter((v): v is number => v != null),
      ),
    [data],
  )
  const hasOff = data.some((r) => r.off != null)
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
        no bench data in this range
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-surface p-2" {...readout.card}>
      <ResponsiveContainer width="100%" height={224}>
        <LineChart
          data={withTime(data)}
          margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
          {...readout.chart}
        >
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} tick={axisTick} />
          <YAxis tick={axisTick} width={40} domain={yScale.domain} ticks={yScale.ticks} />
          <AxisBreak broken={yScale.broken} bg="#171717" />
          <Tooltip
            {...readout.tooltip}
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a3a3a3' }}
            labelFormatter={(ms) => fmtDateLabel(Number(ms))}
            formatter={(v, n) => [`${v} ${unit}`, n]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="flat" name="flat" stroke={LINE_PRIMARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="incline" name="incline" stroke={LINE_SECONDARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          {/* Whichever press followed the other that day. Rings rather than a
              third line: it's a session, not a series of its own. */}
          {hasOff && (
            <Line
              dataKey="off"
              name={OFF_SLOT_NAME}
              stroke={MARK_OFF_SLOT}
              strokeWidth={0}
              dot={offSlotDot('#171717')}
              activeDot={{ r: 4 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const BODY_METRICS: { label: string; value: 'bf' | 'waist' }[] = [
  { label: 'body fat %', value: 'bf' },
  { label: 'waist', value: 'waist' },
]

export function ProgressTab() {
  const { workouts, bodyWeights, measurements, settings, calorieEntries, flexEntries } = useData()
  const [exercise, setExercise] = useState(BENCH_COMBO)
  const [metric, setMetric] = useState<Metric>('1rm')
  const [months, setMonths] = useState<number | null>(null)
  const [showMeasure, setShowMeasure] = useState(false)
  const [bodyMetric, setBodyMetric] = useState<'bf' | 'waist'>('bf')
  const [recap, setRecap] = useState<Review | null>(null)

  // The recap buttons are a treat, not clutter: show "Month in review" only on
  // the 1st of the month, and "Year in review" only during the first week of January.
  const today = new Date()
  const showMonthReview = today.getDate() === 1
  const showYearReview = today.getMonth() === 0 && today.getDate() <= 7

  const reviewData = useMemo(
    () => ({
      workouts,
      flexDates: flexEntries.map((f) => f.date),
      calorieEntries,
      bodyWeights,
    }),
    [workouts, flexEntries, calorieEntries, bodyWeights],
  )

  // Open the recap for the most recently completed period; fall back to the
  // current period (to-date) when the last one has no data yet.
  const openRecap = (kind: ReviewKind) => {
    const now = new Date()
    const last = kind === 'month' ? prevMonthKey(now) : prevYearKey(now)
    const key = reviewHasData(reviewData, kind, last)
      ? last
      : kind === 'month'
        ? monthKeyOf(now)
        : yearKeyOf(now)
    setRecap(buildReview(reviewData, kind, key))
  }

  const heightIn = settings.heightIn ?? 0
  const lastMeasure = latestMeasurement(measurements)
  const latestBf = lastMeasure ? effectiveBodyFat(lastMeasure, heightIn) : null
  const bodySeries = useMemo(
    () =>
      filterRange(
        bodyMetric === 'bf' ? bodyFatSeries(measurements, heightIn) : waistSeries(measurements),
        months,
      ),
    [measurements, heightIn, bodyMetric, months],
  )

  // Weekly rather than daily, complete days only, unlogged days assumed —
  // see weeklyCalorieSurplusSeries.
  const calorieSurplus = useMemo(
    () => filterRange(weeklyCalorieSurplusSeries(calorieEntries), months),
    [calorieEntries, months],
  )

  // The 6-pack target, once its projection has been locked in (ETA within six
  // months). The locked target, not the live one — the same number the goals
  // panel measures pace against, so the chart line and the panel agree.
  const bodyFatGoalLines = useMemo(() => {
    const locked = settings.lockedGoals ?? {}
    return buildGoals({ workouts, bodyWeights, measurements, heightIn })
      .filter((g) => g.id === GOAL_IDS.sixPack && locked[g.id] != null)
      .map((g) => ({ value: locked[g.id]!.target, label: '6-pack' }))
  }, [workouts, bodyWeights, measurements, heightIn, settings.lockedGoals])

  // Most-trained first, so the picker leads with the lifts actually in rotation.
  // The bench combo counts the sessions of both presses, which lands it wherever
  // benching really sits — first when it leads, and it wins ties against the two
  // series it's built from.
  const exerciseOptions = useMemo(() => {
    const combo = {
      key: BENCH_COMBO,
      name: 'bench press (flat + incline)',
      sessions: sessionCount(workouts, ['flat_bench', 'incline_bench']),
    }
    return [combo, ...exercisesByFrequency(workouts)].sort((a, b) => b.sessions - a.sessions)
  }, [workouts])

  const series = useMemo(
    () => filterRange(exerciseSeries(workouts, exercise, metric), months),
    [workouts, exercise, metric, months],
  )
  // The sessions that series leaves out because they trained the lift second (see
  // progress.offSlotSeries) — drawn beside it, so a logged workout is never
  // simply missing from the chart.
  const offSeries = useMemo(
    () => filterRange(offSlotSeries(workouts, exercise, metric), months),
    [workouts, exercise, metric, months],
  )
  const benchSeries = useMemo(
    () =>
      mergeSeries(
        filterRange(exerciseSeries(workouts, 'flat_bench', metric), months),
        filterRange(exerciseSeries(workouts, 'incline_bench', metric), months),
        filterRange(
          [
            ...offSlotSeries(workouts, 'flat_bench', metric),
            ...offSlotSeries(workouts, 'incline_bench', metric),
          ],
          months,
        ),
      ),
    [workouts, metric, months],
  )

  // Names the line in the legend and the tooltip, which the rings beside it make
  // worth saying out loud.
  const exerciseLabel = useMemo(
    () => exerciseOptions.find((o) => o.key === exercise)?.name,
    [exerciseOptions, exercise],
  )

  const unit = metric === 'volume' ? 'vol' : metric === 'reps' ? 'reps' : 'lbs'

  return (
    <div className="flex flex-col gap-4 pb-4">
      <h2 className="text-xl font-bold">progress</h2>

      {(showMonthReview || showYearReview) && (
        <div className="flex gap-2">
          {showMonthReview && (
            <button
              onClick={() => openRecap('month')}
              className="min-h-[44px] flex-1 rounded-xl bg-surface text-sm font-semibold active:bg-surface-2"
            >
              month in review
            </button>
          )}
          {showYearReview && (
            <button
              onClick={() => openRecap('year')}
              className="min-h-[44px] flex-1 rounded-xl bg-surface text-sm font-semibold active:bg-surface-2"
            >
              year in review
            </button>
          )}
        </div>
      )}

      <Pills options={RANGES.map((r) => ({ label: r.label, value: r.months }))} value={months} onChange={setMonths} />

      <GoalsPanel months={months} />

      <MuscleAvatar />

      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">lifts</h3>
      <ExercisePicker options={exerciseOptions} value={exercise} onChange={setExercise} />
      <Pills options={METRICS} value={metric} onChange={setMetric} />
      {exercise === BENCH_COMBO ? (
        <BenchChart data={benchSeries} unit={unit} />
      ) : (
        <MetricChart data={series} unit={unit} label={exerciseLabel} offSlot={offSeries} />
      )}

      <div className="mt-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wider text-neutral-500">
          body fat
          {latestBf != null
            ? ` · ${latestBf}%`
            : lastMeasure?.waistIn != null
              ? ` · ${lastMeasure.waistIn}" waist`
              : ''}
        </h3>
        <button
          onClick={() => setShowMeasure(true)}
          className="min-h-[36px] rounded-lg bg-surface px-3 text-sm font-medium active:bg-surface-2"
        >
          log measurement
        </button>
      </div>
      <Pills options={BODY_METRICS} value={bodyMetric} onChange={setBodyMetric} />
      {bodyMetric === 'bf' && heightIn === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          set my height in settings to estimate body fat % from my measurements.
        </div>
      ) : (
        <MetricChart
          data={bodySeries}
          unit={bodyMetric === 'bf' ? '%' : 'in'}
          label={bodyMetric === 'bf' ? 'body fat' : 'waist'}
          calories={calorieSurplus}
          goalLines={bodyMetric === 'bf' ? bodyFatGoalLines : undefined}
        />
      )}

      <TimeSpent months={months} />

      {showMeasure && <MeasurementLogSheet onClose={() => setShowMeasure(false)} />}
      {recap && <ReviewOverlay review={recap} onClose={() => setRecap(null)} />}
    </div>
  )
}
