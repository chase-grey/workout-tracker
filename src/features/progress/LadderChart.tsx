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
import { LINE_GOAL, LINE_GOAL_LABEL, niceScale, timeXAxis, withTime } from '../../lib/chart'
import { useChartReadout } from '../../lib/useChartReadout'
import { AxisBreak } from '../../components/AxisBreak'
import { ChartTag } from '../../components/ChartTag'
import type { DaySets } from '../../lib/goalSets'
import { GoalTooltip } from './GoalTooltip'

const axisTick = { fill: '#737373', fontSize: 11 }

/** One measured line: a cold or warm angle, or a lift's readings. */
export type LadderSeries = {
  key: string
  name: string
  color: string
  /** Dashed, for readings that aren't the headline — the cold ones. */
  dashed?: boolean
}

/** One rung being aimed at, with the curve it was committed to if it has one. */
export type LadderGoal = {
  /** Label for the target line, e.g. "goal 120°". */
  label: string
  target: number
  lock?: LockedProjection
}

/** A date's readings, one field per {@link LadderSeries} key. */
export type LadderReading = { date: string; [key: string]: number | string | null }

type Row = { date: string; [key: string]: number | string | null | undefined }

/** The readings and each committed curve, one row per date. */
function mergeRows(readings: LadderReading[], goals: LadderGoal[]): Row[] {
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
 * A history of measurements against the rungs being aimed at: every reading taken
 * (a stretch log's cold and warm, left and right; a lift's one line), each target
 * line, and the curve running into it once that target has been committed to.
 *
 * One chart for a whole ladder of goals, rather than one per rung: the rungs all
 * read off the same log, so a chart apiece drew that log over and over and made
 * four milestones on one road look like four separate efforts. That holds for a
 * ladder of angles, for the two squat targets, and for the pull-up rungs alike —
 * which is why this chart isn't about angles anymore.
 */
export function LadderChart({
  readings,
  series,
  goals,
  unit,
  sets,
  empty,
}: {
  readings: LadderReading[]
  series: LadderSeries[]
  goals: LadderGoal[]
  /** What the plotted numbers are counted in, for the tooltip. */
  unit: string
  /**
   * The sets behind each date, for the tooltip — the session as it was performed
   * rather than the one number the line plots (see goalSets). Absent for readings
   * no lift feeds, which is every flexibility ladder.
   */
  sets?: Record<string, DaySets[]>
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
          <Tooltip {...readout.tooltip} content={<GoalTooltip sets={sets} unit={unit} />} />
          {/* Named lines only where there's more than one to tell apart: a lift
              ladder plots a single series, and a legend under it would name the
              only line on the chart. */}
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {/* Tags hang under their lines, on the side the readings have already
              left — the targets climb away from the data on every ladder but the
              toe touch, whose targets sit below it and leave that side emptier
              still. ChartTag flips a tag that won't fit either way. */}
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
