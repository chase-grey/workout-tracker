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
import { flexStats, splitSeries, tailorsSeries } from '../../lib/flex'
import { flexGoalPredictions, type FlexGoal } from '../../lib/flexPredict'
import { fmtDateLabel, LINE_PRIMARY, LINE_SECONDARY, niceScale, timeXAxis, withTime } from '../../lib/chart'
import { AxisBreak } from '../../components/AxisBreak'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }
/** Cold lines run cool — blue for the left/only reading, violet for the right —
 *  against the warm lines' green and amber. */
const COLD_A = '#38bdf8'
const COLD_B = '#a78bfa'

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
                ? `eta ${fmtDate(g.proj.etaDate)}`
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
      <span className="text-[11px] tracking-wide text-neutral-500">{label}</span>
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
  const tailors = useMemo(() => tailorsSeries(flexEntries), [flexEntries])

  // Frame each axis with the goal (180° / 90°) so its dashed target line always
  // sits inside the chart.
  const splitScale = useMemo(
    () => niceScale([...split.flatMap((r) => [r.cold, r.warm]).filter((v): v is number => v != null), 180]),
    [split],
  )
  const tailorsScale = useMemo(
    () =>
      niceScale([
        ...tailors
          .flatMap((r) => [r.coldLeft, r.coldRight, r.warmLeft, r.warmRight])
          .filter((v): v is number => v != null),
        90,
      ]),
    [tailors],
  )

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-wider text-neutral-500">side splits</h3>
      <div className="flex gap-2">
        <Stat value={stats.coldSplit.latest != null ? `${stats.coldSplit.latest}°` : '—'} label="cold" />
        <Stat value={stats.warmSplit.latest != null ? `${stats.warmSplit.latest}°` : '—'} label="warm" />
        <Stat value="180°" label="goal" />
      </div>
      {split.length >= 2 ? (
        <div className="rounded-2xl bg-surface p-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={withTime(split)} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#262626" vertical={false} />
              <XAxis {...timeXAxis} tick={axisTick} />
              <YAxis tick={axisTick} width={32} domain={splitScale.domain} ticks={splitScale.ticks} />
              <AxisBreak broken={splitScale.broken} bg="#171717" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(ms) => fmtDateLabel(Number(ms))}
                formatter={(v, n) => [`${v}°`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={180} stroke="#6b7280" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="cold" name="cold" stroke={COLD_A} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="warm" name="warm" stroke={LINE_PRIMARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
          log split measurements to see progression
        </div>
      )}
      <Projections goals={splitGoals} />

      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">tailor's pose</h3>
      <div className="flex gap-2">
        <Stat value={stats.tailorsLeft.latest != null ? `${stats.tailorsLeft.latest}°` : '—'} label="warm left" />
        <Stat value={stats.tailorsRight.latest != null ? `${stats.tailorsRight.latest}°` : '—'} label="warm right" />
        <Stat value="90°" label="goal" />
      </div>
      {tailors.length >= 2 ? (
        <div className="rounded-2xl bg-surface p-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={withTime(tailors)} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#262626" vertical={false} />
              <XAxis {...timeXAxis} tick={axisTick} />
              <YAxis tick={axisTick} width={32} domain={tailorsScale.domain} ticks={tailorsScale.ticks} />
              <AxisBreak broken={tailorsScale.broken} bg="#171717" />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(ms) => fmtDateLabel(Number(ms))}
                formatter={(v, n) => [`${v}°`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={90} stroke="#6b7280" strokeDasharray="4 4" />
              {/* Cold readings are dashed so the warm pair stays the headline. */}
              <Line type="monotone" dataKey="coldLeft" name="cold L" stroke={COLD_A} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="coldRight" name="cold R" stroke={COLD_B} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="warmLeft" name="warm L" stroke={LINE_PRIMARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              <Line type="monotone" dataKey="warmRight" name="warm R" stroke={LINE_SECONDARY} strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
          log tailor's-pose measurements to see progression
        </div>
      )}
      <Projections goals={tailorsGoals} />
    </div>
  )
}
