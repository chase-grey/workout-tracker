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
import type { Point } from '../../lib/progress'
import {
  fmtDateLabel,
  LINE_GOAL,
  LINE_GOAL_LABEL,
  LINE_PRIMARY,
  LINE_SECONDARY,
  niceScale,
  timeXAxis,
  withTime,
} from '../../lib/chart'
import { AxisBreak } from '../../components/AxisBreak'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/** Legend that follows the axes: the left-axis series sits left, cal surplus right. */
export function SplitLegend({ payload }: { payload?: { value?: unknown; dataKey?: unknown; color?: string }[] }) {
  const items = [...(payload ?? [])].sort((a, b) => Number(a.dataKey === 'cal') - Number(b.dataKey === 'cal'))
  return (
    <div className="flex justify-between px-3 text-xs text-neutral-400">
      {items.map((e) => (
        <span key={String(e.value)} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: e.color }} />
          {String(e.value)}
        </span>
      ))}
    </div>
  )
}

/** Merge a metric series with a calorie-surplus series into one row per date. */
function mergeCalories(data: Point[], calories: Point[]) {
  const m = new Map<string, { date: string; value?: number; cal?: number }>()
  for (const p of data) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), value: p.value })
  for (const p of calories) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), cal: p.value })
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function MetricChart({
  data,
  unit,
  label,
  calories,
  goalLines,
  empty,
}: {
  data: Point[]
  unit: string
  /** Series name shown in the legend/tooltip when the calorie overlay is on. */
  label?: string
  /** Optional weekly-avg calorie surplus (intake − goal) to overlay on a right axis. */
  calories?: Point[]
  /** Targets of goals now close enough to be worth seeing on the chart. */
  goalLines?: { value: number; label: string }[]
  /** Placeholder text when there's nothing to plot. */
  empty?: string
}) {
  const overlay = calories != null && calories.length > 0
  // The left axis must also frame any goal line, or a target above the data
  // would sit off the top of the chart.
  const yScale = useMemo(
    () => niceScale([...data.map((p) => p.value), ...(goalLines?.map((g) => g.value) ?? [])]),
    [data, goalLines],
  )
  const calScale = useMemo(() => niceScale((calories ?? []).map((p) => p.value)), [calories])
  const rows = useMemo(
    () => (overlay ? withTime(mergeCalories(data, calories!)) : withTime(data)),
    [overlay, data, calories],
  )

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
        {empty ?? 'no data in this range'}
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-surface p-2">
      <ResponsiveContainer width="100%" height={224}>
        <LineChart data={rows} margin={{ top: 8, right: overlay ? 0 : 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} tick={axisTick} />
          <YAxis
            yAxisId="left"
            tick={axisTick}
            width={40}
            domain={yScale.domain}
            ticks={yScale.ticks}
          />
          <AxisBreak broken={yScale.broken} bg="#171717" />
          {overlay && (
            <YAxis
              yAxisId="cal"
              orientation="right"
              tick={axisTick}
              width={44}
              domain={calScale.domain}
              ticks={calScale.ticks}
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
              stroke={LINE_GOAL}
              strokeDasharray="5 4"
              label={{ value: g.label, fill: LINE_GOAL_LABEL, fontSize: 10, position: 'insideTopLeft' }}
            />
          ))}
          {overlay && (
            <>
              <Legend content={<SplitLegend />} />
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
