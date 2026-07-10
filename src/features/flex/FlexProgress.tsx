import { useMemo, useState } from 'react'
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
import { MdPhotoCamera } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { flexStats } from '../../lib/flex'
import { parseISODate } from '../../lib/dates'
import { PoseMeasure } from './PoseMeasure'

const GOAL = 180
const MEASURE_CADENCE_DAYS = 7

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl bg-surface py-3">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  )
}

/** Side-splits progress + angle logging, shown as a section of the Progress tab. */
export function FlexProgress() {
  const { flexEntries, logFlex } = useData()
  const [angle, setAngle] = useState('')
  const [measuring, setMeasuring] = useState(false)

  const stats = useMemo(() => flexStats(flexEntries, undefined, { goalDeg: GOAL }), [flexEntries])

  const chartData = useMemo(
    () =>
      flexEntries
        .filter((e) => e.angleDeg != null)
        .map((e) => ({ date: e.date, value: e.angleDeg as number }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [flexEntries],
  )

  const lastMeasured = chartData.length ? chartData[chartData.length - 1].date : null
  const daysSince = lastMeasured
    ? Math.floor((Date.now() - parseISODate(lastMeasured).getTime()) / 86400000)
    : Infinity
  const measureDue = daysSince >= MEASURE_CADENCE_DAYS

  const saveAngle = () => {
    const n = Number(angle)
    if (!Number.isFinite(n) || n <= 0) return
    void logFlex(n)
    setAngle('')
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Side splits</h3>

      {measureDue && (
        <div className="rounded-2xl bg-accent/15 p-3 text-sm text-accent">
          <MdPhotoCamera className="inline align-text-bottom mr-1" aria-hidden />
          Time to measure — log today's split angle.
        </div>
      )}

      <div className="flex gap-2">
        <Stat value={stats.latestAngle != null ? `${stats.latestAngle}°` : '—'} label="Current" />
        <Stat value={stats.bestAngle != null ? `${stats.bestAngle}°` : '—'} label="Best" />
        <Stat value={`${GOAL}°`} label="Goal" />
      </div>

      <div className="flex gap-2">
        <Stat value={`${stats.sessionsThisWeek}/${stats.weeklyGoal}`} label="This week" />
        <div className="flex flex-[2] flex-col justify-center rounded-2xl bg-surface px-4">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">Projected 180°</span>
          <span className="text-lg font-bold">
            {stats.etaDate ? fmtDate(stats.etaDate) : '—'}
            {stats.slopePerWeek > 0 && (
              <span className="ml-2 text-sm font-normal text-accent-2">+{stats.slopePerWeek}°/wk</span>
            )}
          </span>
        </div>
      </div>

      {chartData.length >= 2 ? (
        <div className="rounded-2xl bg-surface p-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#262626" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#737373', fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fill: '#737373', fontSize: 11 }} width={32} domain={['auto', 180]} />
              <Tooltip
                contentStyle={{ background: '#171717', border: '1px solid #333', borderRadius: 12 }}
                formatter={(v) => [`${v}°`, 'angle']}
              />
              <ReferenceLine y={GOAL} stroke="#6b7280" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-2xl bg-surface text-sm text-neutral-500">
          Log a couple measurements to see your progression
        </div>
      )}

      <div className="rounded-2xl bg-surface p-3">
        <p className="mb-2 text-sm font-medium text-neutral-300">Log a measurement</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="angle °"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            className="min-h-[44px] w-0 flex-1 rounded-xl bg-surface-2 px-3 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={saveAngle}
            disabled={!angle.trim()}
            className="min-h-[44px] rounded-xl bg-accent px-4 font-semibold text-black disabled:opacity-30"
          >
            Save angle
          </button>
        </div>
        <button
          onClick={() => setMeasuring(true)}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl bg-surface-2 text-sm font-medium text-neutral-300 active:opacity-80"
        >
          <MdPhotoCamera aria-hidden /> Measure from photo (beta)
        </button>
      </div>

      {measuring && (
        <PoseMeasure onAngle={(deg) => setAngle(String(deg))} onClose={() => setMeasuring(false)} />
      )}
    </div>
  )
}
