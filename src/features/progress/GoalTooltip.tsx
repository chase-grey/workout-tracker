import { exerciseName } from '../../config/plan'
import { fmtDateLabel } from '../../lib/chart'
import { fmtSet } from '../../lib/exerciseHistory'
import type { DaySets } from '../../lib/goalSets'

const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/** One series' entry in the hovered point, as recharts hands it over. */
type Entry = {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
  payload?: { date?: string }
}

/** Trim a plotted value to one decimal — a projected curve carries a long tail. */
function num(v: number | string | undefined): string {
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : String(v ?? '')
}

/**
 * The tooltip on a goal's chart: the session as it was logged, above the numbers
 * the lines plot for it (see goalSets for why the sets are the interesting half).
 *
 * The lifts are named only when a day trained more than one of them, which is the
 * bench goal's two presses — anywhere else the goal's own title already says what
 * the sets are sets of.
 */
export function GoalTooltip({
  active,
  payload,
  label,
  sets,
  unit,
}: {
  active?: boolean
  payload?: Entry[]
  /** The hovered point's `t` timestamp (see chart.timeXAxis). */
  label?: string | number
  /** The sets behind each date (see goalSets.setsByDate); absent for a goal with none. */
  sets?: Record<string, DaySets[]>
  unit: string
}) {
  if (!active || !payload?.length) return null
  const plotted = payload.filter((p) => p.value != null)
  const date = payload[0].payload?.date
  const day = (date && sets?.[date]) || []

  return (
    <div style={tooltipStyle} className="px-2.5 py-1.5 text-xs">
      <p className="text-neutral-400 tabular-nums">{fmtDateLabel(Number(label))}</p>
      {day.map((d) => (
        <p key={d.exercise} className="mt-0.5 text-neutral-200 tabular-nums">
          {day.length > 1 && <span className="text-neutral-500">{exerciseName(d.exercise)} </span>}
          {d.sets.map(fmtSet).join(' · ')}
        </p>
      ))}
      {plotted.map((p) => (
        <p key={String(p.dataKey)} className="mt-0.5 tabular-nums" style={{ color: p.color }}>
          {p.name} {num(p.value)} {unit}
        </p>
      ))}
    </div>
  )
}
