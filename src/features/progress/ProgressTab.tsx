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
import { availableExercises, exerciseSeries, filterRange, type Metric, type Point } from '../../lib/progress'
import { GoalsPanel } from './GoalsPanel'
import { FlexProgress } from '../flex/FlexProgress'
import { WeightLogSheet } from '../today/WeightLogSheet'

const BENCH_COMBO = '__bench__'

const RANGES: { label: string; months: number | null }[] = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: 'All', months: null },
]

const METRICS: { label: string; value: Metric }[] = [
  { label: 'Est. 1RM', value: '1rm' },
  { label: 'Top set', value: 'weight' },
  { label: 'Volume', value: 'volume' },
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

function Chart({ data, unit }: { data: Point[]; unit: string }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
        No data in this range
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-surface p-2">
      <ResponsiveContainer width="100%" height={224}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis tick={axisTick} width={40} domain={['auto', 'auto']} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#a3a3a3' }} formatter={(v) => [`${v} ${unit}`, '']} />
          <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
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
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis dataKey="date" tick={axisTick} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis tick={axisTick} width={40} domain={['auto', 'auto']} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#a3a3a3' }} formatter={(v, n) => [`${v} ${unit}`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="flat" name="Flat" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          <Line type="monotone" dataKey="incline" name="Incline" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ProgressTab() {
  const { workouts, bodyWeights } = useData()
  const [exercise, setExercise] = useState(BENCH_COMBO)
  const [metric, setMetric] = useState<Metric>('1rm')
  const [months, setMonths] = useState<number | null>(3)
  const [showWeight, setShowWeight] = useState(false)

  const latestWeight = bodyWeights.filter((b) => b.weightLbs >= 50).slice(-1)[0]

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

  const unit = metric === 'volume' ? 'vol' : 'lbs'

  return (
    <div className="flex flex-col gap-4 pb-24">
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
      <Chart data={weightSeries} unit="lbs" />

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

      {showWeight && <WeightLogSheet onClose={() => setShowWeight(false)} />}
    </div>
  )
}
