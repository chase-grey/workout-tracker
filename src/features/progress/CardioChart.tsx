import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cardioMinutesByWeek, type CardioEntry } from '../../lib/cardio'
import { CHART_SURFACE_2, LINE_PRIMARY, niceScale } from '../../lib/chart'
import { mondayOf, toISODate } from '../../lib/dates'

const WEEKS = 12
const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }

/** "2026-11-09" → "11/9". */
function weekLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function CardioChart({ entries }: { entries: CardioEntry[] }) {
  const data = useMemo(() => {
    const byWeek = cardioMinutesByWeek(entries)
    const monday = mondayOf(new Date())
    const rows: { week: string; minutes: number }[] = []
    for (let i = WEEKS - 1; i >= 0; i--) {
      const d = new Date(monday)
      d.setDate(d.getDate() - i * 7)
      const iso = toISODate(d)
      rows.push({ week: weekLabel(iso), minutes: Math.round(byWeek.get(iso) ?? 0) })
    }
    return rows
  }, [entries])

  if (entries.length === 0) return null

  const scale = niceScale([0, ...data.map((r) => r.minutes)])

  return (
    <>
      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">cardio</h3>
      <div className="rounded-2xl bg-surface p-2">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_SURFACE_2} vertical={false} />
            <XAxis dataKey="week" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} width={40} unit="m" domain={scale.domain} ticks={scale.ticks} allowDecimals={false} />
            <Tooltip
              cursor={false}
              contentStyle={tooltipStyle}
              labelStyle={{ color: 'var(--color-neutral-400)' }}
              formatter={(v) => [`${v} min`, 'cardio']}
            />
            <Bar dataKey="minutes" fill={LINE_PRIMARY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
