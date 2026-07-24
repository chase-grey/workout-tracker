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
import { calorieSurplusSeries } from '../../lib/calories'
import { fmtDateLabel, LINE_PRIMARY, LINE_SECONDARY, timeXAxis, withTime } from '../../lib/chart'
import { GoalsPanel } from './GoalsPanel'
import { FlexProgress } from '../flex/FlexProgress'
import { TimeSpent } from './TimeSpent'
import { WeightLogSheet } from '../today/WeightLogSheet'
import { MeasurementLogSheet } from '../today/MeasurementLogSheet'
import { bodyFatSeries, waistSeries, latestMeasurement, effectiveBodyFat } from '../../lib/bodyComp'

const BENCH_COMBO = '__bench__'

const RANGES: { label: string; months: number | null }[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: 'All', months: null },
]

const METRICS: { label: string; value: Metric }[] = [
  { label: 'Est. 1RM', value: '1rm' },
  { label: 'Top set', value: 'weight' },
  { label: 'Volume', value: 'volume' },
  { label: 'Reps', value: 'reps' },
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
}: {
  data: Point[]
  unit: string
  /** Series name shown in the legend/tooltip when the calorie overlay is on. */
  label?: string
  /** Optional 7-day-avg calorie surplus (intake − goal) to overlay on a right axis. */
  calories?: Point[]
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
        No data in this range
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
                ? [`${Number(v) > 0 ? '+' : ''}${v} cal/day`, 'vs goal (7d avg)']
                : [`${v} ${unit}`, label ?? '']
            }
          />
          {overlay && (
            <>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine yAxisId="cal" y={0} stroke="#404040" strokeDasharray="3 3" />
              <Line
                yAxisId="cal"
                type="monotone"
                dataKey="cal"
                name="Cal surplus"
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
        No bench data in this range
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
          <Line type="monotone" dataKey="flat" name="Flat" stroke={LINE_PRIMARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="incline" name="Incline" stroke={LINE_SECONDARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const BODY_METRICS: { label: string; value: 'bf' | 'waist' }[] = [
  { label: 'Body fat %', value: 'bf' },
  { label: 'Waist', value: 'waist' },
]

export function ProgressTab() {
  const { workouts, bodyWeights, measurements, settings, calorieEntries } = useData()
  const [exercise, setExercise] = useState(BENCH_COMBO)
  const [metric, setMetric] = useState<Metric>('1rm')
  const [months, setMonths] = useState<number | null>(null)
  const [showWeight, setShowWeight] = useState(false)
  const [showMeasure, setShowMeasure] = useState(false)
  const [bodyMetric, setBodyMetric] = useState<'bf' | 'waist'>('bf')

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

  const calorieSurplus = useMemo(
    () => filterRange(calorieSurplusSeries(calorieEntries), months),
    [calorieEntries, months],
  )

  const exerciseOptions = useMemo(
    () => [{ key: BENCH_COMBO, name: 'Bench press (flat + incline)' }, ...availableExercises(workouts)],
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
      <h2 className="text-xl font-bold">Progress</h2>

      <Pills options={RANGES.map((r) => ({ label: r.label, value: r.months }))} value={months} onChange={setMonths} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Body weight{latestWeight ? ` · ${latestWeight.weightLbs} lbs` : ''}
        </h3>
        <button
          onClick={() => setShowWeight(true)}
          className="min-h-[36px] rounded-lg bg-surface px-3 text-sm font-medium active:bg-surface-2"
        >
          Log weight
        </button>
      </div>
      <Chart data={weightSeries} unit="lbs" label="Weight" calories={calorieSurplus} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Body fat
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
          Log measurement
        </button>
      </div>
      <Pills options={BODY_METRICS} value={bodyMetric} onChange={setBodyMetric} />
      {bodyMetric === 'bf' && heightIn === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          Set your height in Settings to estimate body fat % from your measurements.
        </div>
      ) : (
        <Chart
          data={bodySeries}
          unit={bodyMetric === 'bf' ? '%' : 'in'}
          label={bodyMetric === 'bf' ? 'Body fat' : 'Waist'}
          calories={calorieSurplus}
        />
      )}

      <GoalsPanel />

      <h3 className="mt-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">Lifts</h3>
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
    </div>
  )
}
