import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Point } from '../../lib/progress'
import { projectedSeries, type LockedProjection } from '../../lib/goalLock'
import { enumerateWeeks, parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import {
  fmtDateLabel,
  fmtTick,
  LINE_GOAL,
  LINE_GOAL_LABEL,
  LINE_PRIMARY,
  LINE_SECONDARY,
  niceScale,
  timeXAxis,
  withTime,
} from '../../lib/chart'
import { AxisBreak } from '../../components/AxisBreak'
import { ChartTag } from '../../components/ChartTag'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/** Days at or above the calorie goal that light a week's Monday up, and how brightly. */
const HIT_DAYS_BRIGHT = 6
const HIT_DAYS_DIM = 5

/** Roughly how many date labels fit across the axis before they collide. */
const MAX_TICK_LABELS = 11

/** One bodyweight target drawn on the chart, with its commitment if it has one. */
export type BodyWeightGoal = {
  /** Label for the target line, e.g. "goal 180". */
  label: string
  target: number
  /** The line the goal was committed to, once locked in (and not yet reached). */
  lock?: LockedProjection
}

/** Weigh-ins and each goal's locked line, one row per date. */
type Row = { date: string; value?: number; [projKey: string]: number | string | undefined }

function mergeRows(points: Point[], goals: BodyWeightGoal[], from: string): Row[] {
  const m = new Map<string, Row>()
  const at = (date: string): Row => {
    const row = m.get(date) ?? { date }
    m.set(date, row)
    return row
  }
  for (const p of points) at(p.date).value = p.value
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

/** What a week's Monday tick is worth: a colour, and whether it carries its date. */
type WeekTickMeta = { fill: string | null; labelled: boolean }

/**
 * One Monday on the axis, tinted by how well that week fed the goal — bright
 * green at {@link HIT_DAYS_BRIGHT} days on target, dark green at
 * {@link HIT_DAYS_DIM}. Long ranges hold more Mondays than there is room to
 * print, so the dates thin out; a week that loses its label keeps a coloured pip
 * in its place, and a good run still reads straight across the axis.
 */
function WeekTick({
  x,
  y,
  payload,
  weeks,
}: {
  x?: number
  y?: number
  payload?: { value: number }
  weeks: Map<number, WeekTickMeta>
}) {
  const ms = payload?.value ?? 0
  const meta = weeks.get(ms)
  if (!meta) return null
  return (
    <g>
      {meta.fill && !meta.labelled && <circle cx={x} cy={(y ?? 0) + 8} r={2.5} fill={meta.fill} />}
      {meta.labelled && (
        <text
          x={x}
          y={y}
          dy={14}
          textAnchor="middle"
          fontSize={axisTick.fontSize}
          fill={meta.fill ?? axisTick.fill}
          fontWeight={meta.fill ? 600 : undefined}
        >
          {fmtTick(ms)}
        </text>
      )}
    </g>
  )
}

/**
 * Body weight and both goals aimed at it, on one pair of axes: the weigh-ins,
 * each target line, and the committed curve running into it once a goal has been
 * locked in.
 *
 * Splitting these across a chart per goal drew the same weigh-in history twice
 * over and made the two targets look like unrelated efforts, when the whole point
 * is that one line is climbing past 180 on its way to 190.
 *
 * The X axis is the calorie record. Weeks are what move body weight, so the ticks
 * are Mondays and each one is coloured by how many days that week hit the calorie
 * goal — the eating that produced the curve, read off the same axis as the curve,
 * rather than a second series crossing it on its own scale.
 *
 * No dates are marked on the chart: the ETA dots multiplied by goal and by
 * revision until four of them sat on two target lines with nothing to say which
 * was which. The dates belong to the goal rows underneath, where each has a name.
 */
export function BodyWeightChart({
  points,
  calorieWeeks,
  goals,
  empty,
}: {
  points: Point[]
  /** Days on target per Mon–Sun week, keyed by Monday — see calorieHitsByWeek. */
  calorieWeeks?: Map<string, number>
  goals: BodyWeightGoal[]
  /** Placeholder text when there's nothing to plot. */
  empty?: string
}) {
  const rows = useMemo(() => {
    const from = points.reduce((min, p) => (p.date < min ? p.date : min), points[0]?.date ?? '')
    return withTime(mergeRows(points, goals, from))
  }, [points, goals])

  // The left axis has to frame both targets, not just the weigh-ins, or a goal
  // still well above the data would sit off the top of the chart.
  const yScale = useMemo(
    () => niceScale([...points.map((p) => p.value), ...goals.map((g) => g.target)]),
    [points, goals],
  )

  const xDomain = useMemo(() => {
    const ts = rows.map((r) => r.t)
    return [Math.min(...ts), Math.max(...ts)] as [number, number]
  }, [rows])

  // Every Monday the chart spans, and what each one is worth. The first tick is
  // the Monday of the week the data starts in, which can sit just left of the
  // domain — Recharts drops ticks outside it, so that week simply goes unmarked.
  const weekTicks = useMemo(() => {
    if (rows.length === 0) return []
    const first = weekStartISO(toISODate(new Date(xDomain[0])))
    const last = toISODate(new Date(xDomain[1]))
    return enumerateWeeks(first, last).map(msOf)
  }, [rows, xDomain])

  const weekMeta = useMemo(() => {
    const stride = Math.ceil(weekTicks.length / MAX_TICK_LABELS) || 1
    return new Map<number, WeekTickMeta>(
      weekTicks.map((ms, i) => {
        const hits = calorieWeeks?.get(toISODate(new Date(ms))) ?? 0
        const fill = hits >= HIT_DAYS_BRIGHT ? LINE_PRIMARY : hits >= HIT_DAYS_DIM ? LINE_SECONDARY : null
        return [ms, { fill, labelled: i % stride === 0 }]
      }),
    )
  }, [weekTicks, calorieWeeks])

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
        <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis
            {...timeXAxis}
            domain={xDomain}
            ticks={weekTicks}
            interval={0}
            tick={<WeekTick weeks={weekMeta} />}
          />
          <YAxis yAxisId="left" tick={axisTick} width={40} domain={yScale.domain} ticks={yScale.ticks} />
          <AxisBreak broken={yScale.broken} bg="#171717" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a3a3a3' }}
            labelFormatter={(ms) => fmtDateLabel(Number(ms))}
            formatter={(v, n) => [`${v} lbs`, n]}
          />
          {/* The targets themselves. Both climb away from the data, so the tags
              hang under their lines, on the side the weigh-ins have already left —
              and the higher target sits on the axis ceiling, where a tag above
              its line would be cut off by the top of the plot. */}
          {goals.map((g) => (
            <ReferenceLine
              key={g.label}
              yAxisId="left"
              y={g.target}
              stroke={LINE_GOAL}
              strokeDasharray="5 4"
              label={<ChartTag text={g.label} color={LINE_GOAL_LABEL} bg="#171717" size={10} />}
            />
          ))}
          {/* The committed curves sit with the rest of the goal furniture — the
              same dark green as the target lines they run into. Behind the
              weigh-ins, so the line you're reading stays the brightest one. */}
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
