import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../../store/DataContext'
import { availableExercises, exerciseSeries, filterRange, type Metric, type Point } from '../../lib/progress'
import { weeklyCalorieSurplusSeries } from '../../lib/calories'
import { buildGoals, GOAL_IDS } from '../../lib/goals'
import { fmtDateLabel, LINE_PRIMARY, LINE_SECONDARY, timeXAxis, withTime } from '../../lib/chart'
import { GoalsPanel } from './GoalsPanel'
import { MuscleAvatar } from './MuscleAvatar'
import { FlexProgress } from '../flex/FlexProgress'
import { TimeSpent } from './TimeSpent'
import { WeightLogSheet } from '../today/WeightLogSheet'
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

/** Merge a metric series with a calorie-surplus series into one row per date. */
function mergeCalories(data: Point[], calories: Point[]) {
  const m = new Map<string, { date: string; value?: number; cal?: number }>()
  for (const p of data) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), value: p.value })
  for (const p of calories) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), cal: p.value })
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

function Chart({
  data,
  unit,
  label,
  calories,
  goalLines,
}: {
  data: Point[]
  unit: string
  /** Series name shown in the legend/tooltip when the calorie overlay is on. */
  label?: string
  /** Optional weekly-avg calorie surplus (intake − goal) to overlay on a right axis. */
  calories?: Point[]
  /** Targets of goals now close enough to be worth seeing on the chart. */
  goalLines?: { value: number; label: string }[]
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
        no data in this range
      </div>
    )
  }
  const overlay = calories != null && calories.length > 0
  const rows = overlay ? withTime(mergeCalories(data, calories)) : withTime(data)
  return (
    <div className="rounded-2xl bg-surface p-2">
      <ResponsiveContainer width="100%" height={224}>
        <LineChart data={rows} margin={{ top: 8, right: overlay ? 0 : 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} tick={axisTick} />
          <YAxis yAxisId="left" tick={axisTick} width={40} domain={['auto', 'auto']} />
          {overlay && (
            <YAxis
              yAxisId="cal"
              orientation="right"
              tick={axisTick}
              width={44}
              domain={['auto', 'auto']}
              tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a3a3a3' }}
            labelFormatter={(ms) => fmtDateLabel(Number(ms))}
            formatter={(v, n) =>
              n === 'cal'
                ? [`${Number(v) > 0 ? '+' : ''}${v} cal/day`, 'vs goal (weekly avg)']
                : [`${v} ${unit}`, label ?? '']
            }
          />
          {/* Goals whose projected finish is inside the lock-in horizon get a
              target line, so the chart shows what you're actually driving at. */}
          {goalLines?.map((g) => (
            <ReferenceLine
              key={g.label}
              yAxisId="left"
              y={g.value}
              stroke="#facc15"
              strokeDasharray="5 4"
              label={{ value: g.label, fill: '#facc15', fontSize: 10, position: 'insideTopLeft' }}
            />
          ))}
          {overlay && (
            <>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine yAxisId="cal" y={0} stroke="#404040" strokeDasharray="3 3" />
              <Line
                yAxisId="cal"
                type="monotone"
                dataKey="cal"
                name="cal surplus"
                stroke={LINE_SECONDARY}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </>
          )}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="value"
            name={label}
            stroke={LINE_PRIMARY}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function mergeSeries(flat: Point[], incline: Point[]) {
  const m = new Map<string, { date: string; flat?: number; incline?: number }>()
  for (const p of flat) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), flat: p.value })
  for (const p of incline) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), incline: p.value })
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

function BenchChart({ data, unit }: { data: ReturnType<typeof mergeSeries>; unit: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
        no bench data in this range
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-surface p-2">
      <ResponsiveContainer width="100%" height={224}>
        <LineChart data={withTime(data)} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} tick={axisTick} />
          <YAxis tick={axisTick} width={40} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a3a3a3' }}
            labelFormatter={(ms) => fmtDateLabel(Number(ms))}
            formatter={(v, n) => [`${v} ${unit}`, n]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="flat" name="flat" stroke={LINE_PRIMARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="incline" name="incline" stroke={LINE_SECONDARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
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
  const [showWeight, setShowWeight] = useState(false)
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

  const latestWeight = bodyWeights.filter((b) => b.weightLbs >= 50).slice(-1)[0]

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

  // Targets for goals whose projection has been locked in (ETA within six
  // months), split by which chart they belong on.
  const goalLines = useMemo(() => {
    const specs = buildGoals({ workouts, bodyWeights, measurements, heightIn })
    const locked = settings.lockedGoals ?? {}
    // The locked target, not the live one — the same number the goals panel
    // measures pace against, so the chart line and the panel agree.
    const targetOf = (id: string, fallback: number) => locked[id]?.target ?? fallback
    const within = (id: string) => locked[id] != null
    return {
      weight: specs
        .filter((g) => (g.id === GOAL_IDS.weight180 || g.id === GOAL_IDS.weight190) && within(g.id))
        .map((g) => ({
          value: targetOf(g.id, g.target),
          label: g.title.replace('bodyweight → ', 'goal '),
        })),
      bodyFat: specs
        .filter((g) => g.id === GOAL_IDS.sixPack && within(g.id))
        .map((g) => ({ value: targetOf(g.id, g.target), label: '6-pack' })),
    }
  }, [workouts, bodyWeights, measurements, heightIn, settings.lockedGoals])

  const exerciseOptions = useMemo(
    () => [{ key: BENCH_COMBO, name: 'bench press (flat + incline)' }, ...availableExercises(workouts)],
    [workouts],
  )

  const weightSeries = useMemo(
    () =>
      filterRange(
        bodyWeights.filter((b) => b.weightLbs >= 50).map((b) => ({ date: b.date, value: b.weightLbs })),
        months,
      ),
    [bodyWeights, months],
  )

  const series = useMemo(
    () => filterRange(exerciseSeries(workouts, exercise, metric), months),
    [workouts, exercise, metric, months],
  )
  const benchSeries = useMemo(
    () =>
      mergeSeries(
        filterRange(exerciseSeries(workouts, 'flat_bench', metric), months),
        filterRange(exerciseSeries(workouts, 'incline_bench', metric), months),
      ),
    [workouts, metric, months],
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

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wider text-neutral-500">
          body weight{latestWeight ? ` · ${latestWeight.weightLbs} lbs` : ''}
        </h3>
        <button
          onClick={() => setShowWeight(true)}
          className="min-h-[36px] rounded-lg bg-surface px-3 text-sm font-medium active:bg-surface-2"
        >
          log weight
        </button>
      </div>
      <Chart
        data={weightSeries}
        unit="lbs"
        label="weight"
        calories={calorieSurplus}
        goalLines={goalLines.weight}
      />

      <div className="flex items-center justify-between">
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
          set your height in settings to estimate body fat % from your measurements.
        </div>
      ) : (
        <Chart
          data={bodySeries}
          unit={bodyMetric === 'bf' ? '%' : 'in'}
          label={bodyMetric === 'bf' ? 'body fat' : 'waist'}
          calories={calorieSurplus}
          goalLines={bodyMetric === 'bf' ? goalLines.bodyFat : undefined}
        />
      )}

      <GoalsPanel />

      <MuscleAvatar />

      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">lifts</h3>
      <select
        value={exercise}
        onChange={(e) => setExercise(e.target.value)}
        className="min-h-[44px] rounded-xl bg-surface px-3 text-base focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {exerciseOptions.map((e) => (
          <option key={e.key} value={e.key}>
            {e.name}
          </option>
        ))}
      </select>
      <Pills options={METRICS} value={metric} onChange={setMetric} />
      {exercise === BENCH_COMBO ? <BenchChart data={benchSeries} unit={unit} /> : <Chart data={series} unit={unit} />}

      <FlexProgress />

      <TimeSpent months={months} />

      {showWeight && <WeightLogSheet onClose={() => setShowWeight(false)} />}
      {showMeasure && <MeasurementLogSheet onClose={() => setShowMeasure(false)} />}
      {recap && <ReviewOverlay review={recap} onClose={() => setRecap(null)} />}
    </div>
  )
}
