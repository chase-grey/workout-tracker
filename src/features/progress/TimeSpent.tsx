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
import {
  activityTotals,
  filterDurationsByMonths,
  monthlyActivity,
  secToMin,
} from '../../lib/activityTime'
import { LINE_GOAL, LINE_PRIMARY, LINE_SECONDARY, niceScale } from '../../lib/chart'
import { useChartReadout } from '../../lib/useChartReadout'
import { AxisBreak } from '../../components/AxisBreak'

/** The green ladder, brightest bucket first: work, then stretch, then rest. */
const COLORS = { workout: LINE_PRIMARY, stretch: LINE_SECONDARY, rest: LINE_GOAL } as const

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
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

export function TimeSpent({ months }: { months: number | null }) {
  const { durations } = useData()
  // One per chart: reading the donut shouldn't leave the months chart lit up.
  const split = useChartReadout()
  const monthlyReadout = useChartReadout()

  const inRange = useMemo(() => filterDurationsByMonths(durations, months), [durations, months])
  const totals = useMemo(() => activityTotals(inRange), [inRange])
  const grandTotal = totals.workoutSec + totals.stretchSec + totals.restSec

  const pieData = useMemo(
    () =>
      [
        { key: 'workout', name: 'working out', sec: totals.workoutSec, fill: COLORS.workout },
        { key: 'stretch', name: 'stretch + core', sec: totals.stretchSec, fill: COLORS.stretch },
        { key: 'rest', name: 'resting', sec: totals.restSec, fill: COLORS.rest },
      ].filter((d) => d.sec > 0),
    [totals],
  )

  const monthly = useMemo(
    () =>
      monthlyActivity(inRange).map((m) => ({
        month: monthLabel(m.month),
        workout: secToMin(m.workoutSec),
        stretch: secToMin(m.stretchSec),
        rest: secToMin(m.restSec),
      })),
    [inRange],
  )

  const minutesScale = useMemo(
    () => niceScale(monthly.flatMap((m) => [m.workout, m.stretch, m.rest])),
    [monthly],
  )

  return (
    <>
      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">
        time spent{grandTotal > 0 ? ` · ${fmtHm(grandTotal)}` : ''}
      </h3>

      {grandTotal === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          no sessions logged yet in this range — finish a workout or stretch to start tracking time.
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
                  <CartesianGrid stroke="#262626" vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} />
                  <YAxis
                    tick={axisTick}
                    width={40}
                    unit="m"
                    domain={minutesScale.domain}
                    ticks={minutesScale.ticks}
                  />
                  <AxisBreak broken={minutesScale.broken} bg="#171717" />
                  <Tooltip
                    {...monthlyReadout.tooltip}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: '#a3a3a3' }}
                    formatter={(v, n) => [`${v} min`, n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="workout" name="working out" stroke={COLORS.workout} strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="stretch" name="stretch + core" stroke={COLORS.stretch} strokeWidth={2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="rest" name="resting" stroke={COLORS.rest} strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </>
  )
}
