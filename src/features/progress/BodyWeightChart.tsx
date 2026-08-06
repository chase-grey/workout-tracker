import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Point } from '../../lib/progress'
import { projectedSeries, type LockedProjection } from '../../lib/goalLock'
import { parseISODate } from '../../lib/dates'
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
import { SplitLegend } from './MetricChart'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/** One bodyweight target drawn on the chart, with its commitment if it has one. */
export type BodyWeightGoal = {
  /** Label for the target line, e.g. "goal 180". */
  label: string
  target: number
  /** The line the goal was committed to, once locked in (and not yet reached). */
  lock?: LockedProjection
  /** ETA implied by the pace actually being held, when it differs from the lock's. */
  revisedEta?: string | null
  behind?: boolean
}

/** Weigh-ins, the calorie overlay, and each goal's locked line, one row per date. */
type Row = { date: string; value?: number; cal?: number; [projKey: string]: number | string | undefined }

function mergeRows(points: Point[], calories: Point[], goals: BodyWeightGoal[], from: string): Row[] {
  const m = new Map<string, Row>()
  const at = (date: string): Row => {
    const row = m.get(date) ?? { date }
    m.set(date, row)
    return row
  }
  for (const p of points) at(p.date).value = p.value
  for (const p of calories) at(p.date).cal = p.value
  // A lock taken months ago would drag the visible window back to its own start,
  // undoing the range pill — so each locked line is clipped to where the weigh-ins
  // on screen begin. Its shape is unchanged; it just enters from the left edge.
  goals.forEach((g, i) => {
    if (!g.lock) return
    for (const p of projectedSeries(g.lock)) {
      if (p.date >= from) at(p.date)[`proj${i}`] = p.value
    }
  })
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

const msOf = (iso: string): number => parseISODate(iso).getTime()
const fmtDate = (iso: string): string => fmtDateLabel(msOf(iso))

/**
 * Body weight and everything aimed at it, on one pair of axes: the weigh-ins, the
 * weekly calorie surplus that moves them, and both bodyweight goals — each a
 * target line, plus the committed curve and the dates it lands on once the goal
 * has been locked in.
 *
 * Splitting these across a chart per goal drew the same weigh-in history three
 * times over and made the two targets look like unrelated efforts, when the whole
 * point is that one line is climbing past 180 on its way to 190. Both ETAs are
 * dots on their own target line rather than text: the locked one where the
 * committed curve lands, and the one the current pace implies where that pace
 * would land instead, so the gap between the dates is a distance you can see.
 *
 * The lock date isn't marked — a locked curve visibly begins there, which says
 * the same thing without a second vertical rule per goal.
 */
export function BodyWeightChart({
  points,
  calories,
  goals,
  empty,
}: {
  points: Point[]
  /** Weekly-avg calorie surplus (intake − goal) to overlay on a right axis. */
  calories?: Point[]
  goals: BodyWeightGoal[]
  /** Placeholder text when there's nothing to plot. */
  empty?: string
}) {
  const overlay = calories != null && calories.length > 0

  const rows = useMemo(() => {
    const from = points.reduce((min, p) => (p.date < min ? p.date : min), points[0]?.date ?? '')
    return withTime(mergeRows(points, overlay ? calories! : [], goals, from))
  }, [points, calories, overlay, goals])

  // The left axis has to frame both targets, not just the weigh-ins, or a goal
  // still well above the data would sit off the top of the chart.
  const yScale = useMemo(
    () => niceScale([...points.map((p) => p.value), ...goals.map((g) => g.target)]),
    [points, goals],
  )
  const calScale = useMemo(() => niceScale((calories ?? []).map((p) => p.value)), [calories])

  // A revised ETA later than the locked one falls past the data's own span, so the
  // axis is widened by hand or its dot would be clipped off the edge. The extra
  // padding is for the date labels, centred on an x that would otherwise be the
  // right edge itself.
  const revisedMs = useMemo(
    () =>
      goals.map((g) =>
        g.lock && g.revisedEta && g.revisedEta !== g.lock.etaDate ? msOf(g.revisedEta) : null,
      ),
    [goals],
  )
  const dated = goals.some((g) => g.lock)
  const xDomain = useMemo(() => {
    const ts = rows.map((r) => r.t)
    const min = Math.min(...ts)
    const max = Math.max(...ts, ...revisedMs.filter((ms): ms is number => ms != null))
    return [min, max + (dated ? (max - min) * 0.07 : 0)] as [number, number]
  }, [rows, revisedMs, dated])

  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
        {empty ?? 'no data in this range'}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-surface p-2">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 8, right: overlay ? 0 : 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} domain={xDomain} tick={axisTick} />
          <YAxis yAxisId="left" tick={axisTick} width={40} domain={yScale.domain} ticks={yScale.ticks} />
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
                : [`${v} lbs`, n]
            }
          />
          {/* The targets themselves. Both climb away from the data, so the labels
              hang under their lines, on the side the weigh-ins have already left —
              and the higher target sits on the axis ceiling, where a label above
              its line would be cut off by the top of the plot. */}
          {goals.map((g) => (
            <ReferenceLine
              key={g.label}
              yAxisId="left"
              y={g.target}
              stroke={LINE_GOAL}
              strokeDasharray="5 4"
              label={{ value: g.label, fill: LINE_GOAL_LABEL, fontSize: 10, position: 'insideTopLeft' }}
            />
          ))}
          {/* The commitment: where each locked curve meets its target. */}
          {goals.map((g) =>
            g.lock ? (
              <ReferenceDot
                key={`eta-${g.label}`}
                yAxisId="left"
                x={msOf(g.lock.etaDate)}
                y={g.target}
                r={4}
                fill={LINE_GOAL}
                stroke="#0a0a0a"
                label={{ value: fmtDate(g.lock.etaDate), fill: LINE_GOAL_LABEL, fontSize: 9, position: 'bottom' }}
              />
            ) : null,
          )}
          {/* Where the pace being held now would land instead — dark green when
              that's later than the commitment, bright when it beats it. The second
              date gets its own row so two ETAs days apart don't overprint. */}
          {goals.map((g, i) =>
            revisedMs[i] != null ? (
              <ReferenceDot
                key={`revised-${g.label}`}
                yAxisId="left"
                x={revisedMs[i]!}
                y={g.target}
                r={4}
                fill={g.behind ? LINE_SECONDARY : LINE_PRIMARY}
                stroke="#0a0a0a"
                label={{
                  value: fmtDate(g.revisedEta!),
                  fill: g.behind ? LINE_SECONDARY : LINE_PRIMARY,
                  fontSize: 9,
                  position: 'bottom',
                  dy: 11,
                }}
              />
            ) : null,
          )}
          {overlay && (
            <>
              {/* Only the two real series get a legend entry — the committed
                  curves are furniture, and name themselves off the target line
                  they land on. */}
              <Legend
                content={({ payload }) => (
                  <SplitLegend payload={payload?.filter((e) => !String(e.dataKey).startsWith('proj'))} />
                )}
              />
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
          {/* The committed curves sit with the rest of the goal furniture — the
              same dark green as the target lines they run into, which also keeps
              them off the calorie line's shade. Behind the weigh-ins, so the line
              you're reading stays the brightest one. */}
          {goals.map((g, i) =>
            g.lock ? (
              <Line
                key={`line-${g.label}`}
                yAxisId="left"
                type="monotone"
                dataKey={`proj${i}`}
                name={g.label}
                legendType="none"
                stroke={LINE_GOAL}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            ) : null,
          )}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="value"
            name="weight"
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
