import { useMemo } from 'react'
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../../store/DataContext'
import { activityTotals, monthlyActivity, projectMonth, secToMin } from '../../lib/activityTime'
import { CHART_SURFACE, CHART_SURFACE_2, LINE_GOAL, LINE_PRIMARY, LINE_SECONDARY, niceScale } from '../../lib/chart'
import { useChartReadout } from '../../lib/useChartReadout'
import { AxisBreak } from '../../components/AxisBreak'

/** The accent ladder, brightest bucket first: work, then stretch, then rest. Read at render so it follows the theme. */
const colors = () => ({ workout: LINE_PRIMARY, stretch: LINE_SECONDARY, rest: LINE_GOAL })

const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "2026-07" → "Jul '26". */
function monthLabel(m: string): string {
  const [y, mo] = m.split('-')
  return `${MONTH_ABBR[Number(mo) - 1] ?? mo} '${y.slice(2)}`
}

/** Seconds → "1h 20m" / "45m". */
function fmtHm(sec: number): string {
  const min = secToMin(sec)
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

const axisTick = { fill: '#737373', fontSize: 11 }
type MonthRow = {
  month: string
  workout: number
  stretch: number
  rest: number
  workoutPace?: number
  stretchPace?: number
  restPace?: number
}

const PACE_KEY = { workout: 'workoutPace', stretch: 'stretchPace', rest: 'restPace' } as const

const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }

export function TimeSpent() {
  const { durations } = useData()
  // One per chart: reading the donut shouldn't leave the months chart lit up.
  const split = useChartReadout()
  const monthlyReadout = useChartReadout()

  const totals = useMemo(() => activityTotals(durations), [durations])
  const grandTotal = totals.workoutSec + totals.stretchSec + totals.restSec

  const pieData = useMemo(
    () =>
      [
        { key: 'workout', name: 'working out', sec: totals.workoutSec, fill: colors().workout },
        { key: 'stretch', name: 'stretch', sec: totals.stretchSec, fill: colors().stretch },
        { key: 'rest', name: 'resting', sec: totals.restSec, fill: colors().rest },
      ].filter((d) => d.sec > 0),
    [totals],
  )

  // Each month's minutes, plus — when this month is still under way — where it
  // is on pace to finish. The pace keys sit on the last finished month too (at
  // its actual value) so a dashed segment runs from there to the projection.
  const monthly = useMemo(() => {
    const months = monthlyActivity(durations)
    const rows: MonthRow[] = months.map((m) => ({
      month: monthLabel(m.month),
      workout: secToMin(m.workoutSec),
      stretch: secToMin(m.stretchSec),
      rest: secToMin(m.restSec),
    }))
    const last = months[months.length - 1]
    const proj = last ? projectMonth(last, new Date()) : null
    if (proj && rows.length > 1) {
      const cur = rows[rows.length - 1]
      const prev = rows[rows.length - 2]
      cur.workoutPace = secToMin(proj.workoutSec)
      cur.stretchPace = secToMin(proj.stretchSec)
      cur.restPace = secToMin(proj.restSec)
      prev.workoutPace = prev.workout
      prev.stretchPace = prev.stretch
      prev.restPace = prev.rest
    }
    return rows
  }, [durations])
  const paceRow = monthly[monthly.length - 1]?.workoutPace != null ? monthly[monthly.length - 1] : null

  const minutesScale = useMemo(
    () =>
      niceScale(
        monthly.flatMap((m) => [m.workout, m.stretch, m.rest, m.workoutPace, m.stretchPace, m.restPace].filter((v): v is number => v != null)),
      ),
    [monthly],
  )

  return (
    <>
      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">
        time spent{grandTotal > 0 ? ` · ${fmtHm(grandTotal)}` : ''}
      </h3>

      {grandTotal === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          no sessions logged yet — finish a workout or stretch to start tracking time.
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-surface p-2" {...split.card}>
            <ResponsiveContainer width="100%" height={224}>
              <PieChart {...split.chart}>
                {/* The ring is one more thing Recharts makes focusable in its own
                    right, on top of the plot around it. */}
                <Pie
                  rootTabIndex={-1}
                  data={pieData}
                  dataKey="sec"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="none"
                >
                  {pieData.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip
                  {...split.tooltip}
                  contentStyle={tooltipStyle}
                  formatter={(v, n) => [fmtHm(Number(v)), n]}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value, entry) => {
                    // recharts payload carries the slice's datum
                    const sec = (entry?.payload as { sec?: number } | undefined)?.sec ?? 0
                    return (
                      <span className="text-neutral-300">
                        {value} · {fmtHm(sec)}
                      </span>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {monthly.length > 1 && (
            <div className="rounded-2xl bg-surface p-2" {...monthlyReadout.card}>
              <ResponsiveContainer width="100%" height={224}>
                <LineChart
                  data={monthly}
                  margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                  {...monthlyReadout.chart}
                >
                  <CartesianGrid stroke={CHART_SURFACE_2} vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} />
                  <YAxis
                    tick={axisTick}
                    width={40}
                    unit="m"
                    domain={minutesScale.domain}
                    ticks={minutesScale.ticks}
                  />
                  <AxisBreak broken={minutesScale.broken} bg={CHART_SURFACE} />
                  <Tooltip
                    {...monthlyReadout.tooltip}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: 'var(--color-neutral-400)' }}
                    formatter={(v, n, item) => {
                      const row = item?.payload as MonthRow | undefined
                      const key = item?.dataKey as keyof typeof PACE_KEY | undefined
                      const pace = row === paceRow && key && key in PACE_KEY ? row?.[PACE_KEY[key]] : undefined
                      return [pace != null ? `${v} min · on pace for ${pace}` : `${v} min`, n]
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="workout" name="working out" stroke={colors().workout} strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="stretch" name="stretch" stroke={colors().stretch} strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="rest" name="resting" stroke={colors().rest} strokeWidth={2} dot={{ r: 2 }} />
                  {paceRow &&
                    (['workout', 'stretch', 'rest'] as const).map((k) => (
                      <Line
                        key={k}
                        type="linear"
                        dataKey={PACE_KEY[k]}
                        stroke={colors()[k]}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        strokeOpacity={0.7}
                        dot={(p: { cx?: number; cy?: number; index?: number }) =>
                          p.index === monthly.length - 1 && p.cx != null && p.cy != null ? (
                            <circle key={`${k}-pace`} cx={p.cx} cy={p.cy} r={3} fill={CHART_SURFACE} stroke={colors()[k]} strokeWidth={1.5} />
                          ) : (
                            <g key={`${k}-pace-${p.index}`} />
                          )
                        }
                        activeDot={false}
                        legendType="none"
                        tooltipType="none"
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  )
}
