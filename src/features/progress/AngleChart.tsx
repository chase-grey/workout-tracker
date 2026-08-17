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
import { projectedSeries, type LockedProjection } from '../../lib/goalLock'
import {
  fmtDateLabel,
  LINE_GOAL,
  LINE_GOAL_LABEL,
  niceScale,
  timeXAxis,
  withTime,
} from '../../lib/chart'
import { useChartReadout } from '../../lib/useChartReadout'
import { AxisBreak } from '../../components/AxisBreak'
import { ChartTag } from '../../components/ChartTag'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/** One measured line: a cold or warm reading, left or right. */
export type AngleSeries = {
  key: string
  name: string
  color: string
  /** Dashed, for readings that aren't the headline — the cold ones. */
  dashed?: boolean
}

/** One angle being aimed at, with the curve it was committed to if it has one. */
export type AngleGoal = {
  /** Label for the target line, e.g. "goal 120°". */
  label: string
  target: number
  lock?: LockedProjection
}

/** A date's readings, one field per {@link AngleSeries} key. */
export type AngleReading = { date: string; [key: string]: number | string | null }

type Row = { date: string; [key: string]: number | string | null | undefined }

/** The readings and each committed curve, one row per date. */
function mergeRows(readings: AngleReading[], goals: AngleGoal[]): Row[] {
  const m = new Map<string, Row>()
  const at = (date: string): Row => {
    const row = m.get(date) ?? { date }
    m.set(date, row)
    return row
  }
  for (const r of readings) m.set(r.date, { ...r })
  // A commitment made months ago would drag the visible window back to its own
  // start, undoing the range pill — so each committed curve is clipped to where
  // the readings on screen begin, entering from the left edge with its shape
  // unchanged.
  const from = readings.reduce((min, r) => (r.date < min ? r.date : min), readings[0]?.date ?? '')
  goals.forEach((g, i) => {
    if (!g.lock) return
    for (const p of projectedSeries(g.lock)) {
      if (p.date >= from) at(p.date)[`proj${i}`] = p.value
    }
  })
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * A history of angle measurements against the angles being aimed at: every
 * reading taken (cold and warm, left and right), each target line, and the curve
 * running into it once that target has been committed to.
 *
 * One chart for a whole ladder of goals, rather than one per rung: the rungs all
 * read off the same stretch log, so a chart apiece drew that log over and over
 * and made four milestones on one road look like four separate efforts.
 */
export function AngleChart({
  readings,
  series,
  goals,
  empty,
}: {
  readings: AngleReading[]
  series: AngleSeries[]
  goals: AngleGoal[]
  /** Placeholder text when there's nothing to plot. */
  empty: string
}) {
  const readout = useChartReadout()
  const rows = useMemo(() => withTime(mergeRows(readings, goals)), [readings, goals])

  // The axis has to frame the targets as well as the readings, or a goal above
  // the data would sit off the top of the chart.
  const yScale = useMemo(
    () =>
      niceScale([
        ...readings.flatMap((r) => series.map((s) => r[s.key])).filter((v): v is number => typeof v === 'number'),
        ...goals.map((g) => g.target),
      ]),
    [readings, series, goals],
  )

  if (readings.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
        {empty}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-surface p-2" {...readout.card}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -12 }} {...readout.chart}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} tick={axisTick} />
          <YAxis tick={axisTick} width={40} domain={yScale.domain} ticks={yScale.ticks} />
          <AxisBreak broken={yScale.broken} bg="#171717" />
          <Tooltip
            {...readout.tooltip}
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a3a3a3' }}
            labelFormatter={(ms) => fmtDateLabel(Number(ms))}
            formatter={(v, n) => [`${v}°`, n]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/* The targets climb away from the data, so their tags hang under the
              lines, on the side the readings have already left. */}
          {goals.map((g) => (
            <ReferenceLine
              key={g.label}
              y={g.target}
              stroke={LINE_GOAL}
              strokeDasharray="5 4"
              label={<ChartTag text={g.label} color={LINE_GOAL_LABEL} bg="#171717" size={10} />}
            />
          ))}
          {/* Committed curves sit with the rest of the goal furniture, in the same
              dark green as the target lines they run into — and behind the
              readings, so the line being read stays the brightest one. */}
          {goals.map((g, i) =>
            g.lock ? (
              <Line
                key={`proj-${g.label}`}
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
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '4 3' : undefined}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
