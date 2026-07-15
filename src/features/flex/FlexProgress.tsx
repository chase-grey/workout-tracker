import { useMemo } from 'react'
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
import { flexStats, splitSeries } from '../../lib/flex'
import { flexGoalPredictions, type FlexGoal } from '../../lib/flexPredict'
import { fmtDateLabel, timeXAxis, withTime } from '../../lib/chart'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

function Projections({ goals }: { goals: FlexGoal[] }) {
  if (goals.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {goals.map((g) => (
        <div key={g.label} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-sm">
          <span className="font-medium">{g.label}</span>
          <span className="text-neutral-400">
            {g.proj.onTrack && g.proj.etaWeeks === 0
              ? 'reached ✓'
              : g.proj.onTrack
                ? `ETA ${fmtDate(g.proj.etaDate)}`
                : 'need more data / not trending'}
          </span>
        </div>
      ))}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl bg-surface py-3">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  )
}

export function FlexProgress() {
  const { flexEntries } = useData()

  const stats = useMemo(() => flexStats(flexEntries), [flexEntries])
  const predictions = useMemo(() => flexGoalPredictions(flexEntries), [flexEntries])
  const splitGoals = predictions.filter((g) => g.kind === 'split')
  const tailorsGoals = predictions.filter((g) => g.kind === 'tailors')
  const split = useMemo(() => splitSeries(flexEntries), [flexEntries])
  const tailors = useMemo(() => {
    const m = new Map<string, { date: string; left?: number; right?: number }>()
    for (const e of flexEntries) {
      if (e.tailorsLeftDeg == null && e.tailorsRightDeg == null) continue
      const row = m.get(e.date) ?? { date: e.date }
      if (e.tailorsLeftDeg != null) row.left = e.tailorsLeftDeg
      if (e.tailorsRightDeg != null) row.right = e.tailorsRightDeg
      m.set(e.date, row)
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [flexEntries])

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Side splits</h3>
      <div className="flex gap-2">
        <Stat value={stats.split.latest != null ? `${stats.split.latest}°` : '—'} label="Current" />
        <Stat value={stats.split.best != null ? `${stats.split.best}°` : '—'} label="Best" />
        <Stat value="180°" label="Goal" />
      </div>
      {split.length >= 2 ? (
        <div className="rounded-2xl bg-surface p-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={withTime(split)} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#262626" vertical={false} />
              <XAxis {...timeXAxis} tick={axisTick} />
              <YAxis tick={axisTick} width={32} domain={['auto', 180]} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(ms) => fmtDateLabel(Number(ms))}
                formatter={(v) => [`${v}°`, 'split']}
              />
              <ReferenceLine y={180} stroke="#6b7280" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
          Log split measurements to see progression
        </div>
      )}
      <Projections goals={splitGoals} />

      <h3 className="mt-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">Tailor's pose</h3>
      <div className="flex gap-2">
        <Stat value={stats.tailorsLeft.latest != null ? `${stats.tailorsLeft.latest}°` : '—'} label="Left" />
        <Stat value={stats.tailorsRight.latest != null ? `${stats.tailorsRight.latest}°` : '—'} label="Right" />
        <Stat value="90°" label="Goal" />
      </div>
      {tailors.length >= 2 ? (
        <div className="rounded-2xl bg-surface p-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={withTime(tailors)} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#262626" vertical={false} />
              <XAxis {...timeXAxis} tick={axisTick} />
              <YAxis tick={axisTick} width={32} domain={['auto', 90]} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(ms) => fmtDateLabel(Number(ms))}
                formatter={(v, n) => [`${v}°`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={90} stroke="#6b7280" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="left" name="Left" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="right" name="Right" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
          Log tailor's-pose measurements to see progression
        </div>
      )}
      <Projections goals={tailorsGoals} />

      <p className="px-1 text-xs text-neutral-500">Log measurements during a stretch session (kebab → Log measurement).</p>
    </div>
  )
}
