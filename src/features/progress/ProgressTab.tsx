import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../../store/DataContext'
import { ALL_EXERCISES } from '../../config/plan'
import { exerciseSeries, filterRange, type Metric } from '../../lib/progress'

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

function Chart({ data, unit }: { data: { date: string; value: number }[]; unit: string }) {
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
          <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis tick={{ fill: '#737373', fontSize: 11 }} width={40} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#171717', border: '1px solid #333', borderRadius: 12 }}
            labelStyle={{ color: '#a3a3a3' }}
            formatter={(v) => [`${v} ${unit}`, '']}
          />
          <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ProgressTab() {
  const { workouts, bodyWeights } = useData()
  const [exercise, setExercise] = useState(ALL_EXERCISES[0].key)
  const [metric, setMetric] = useState<Metric>('1rm')
  const [months, setMonths] = useState<number | null>(3)

  const series = useMemo(
    () => filterRange(exerciseSeries(workouts, exercise, metric), months),
    [workouts, exercise, metric, months],
  )
  const weightSeries = useMemo(
    () => filterRange(bodyWeights.map((b) => ({ date: b.date, value: b.weightLbs })), months),
    [bodyWeights, months],
  )

  const unit = metric === 'volume' ? 'vol' : 'lbs'

  return (
    <div className="flex flex-col gap-4 pb-24">
      <h2 className="text-xl font-bold">Progress</h2>

      <select
        value={exercise}
        onChange={(e) => setExercise(e.target.value)}
        className="min-h-[44px] rounded-xl bg-surface px-3 text-base focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {ALL_EXERCISES.map((e) => (
          <option key={e.key} value={e.key}>
            {e.name}
          </option>
        ))}
      </select>

      <Pills options={METRICS} value={metric} onChange={setMetric} />
      <Chart data={series} unit={unit} />

      <Pills options={RANGES.map((r) => ({ label: r.label, value: r.months }))} value={months} onChange={setMonths} />

      <h3 className="mt-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Body weight
      </h3>
      <Chart data={weightSeries} unit="lbs" />
    </div>
  )
}
