import { useState } from 'react'
import { MdAcUnit, MdLocalFireDepartment, MdStar } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { parseISODate } from '../../lib/dates'
import type { WeekResult, WeeklyGoalConfig } from '../../lib/weeklyStreak'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "aug 3 – 9", or "jul 27 – aug 2" when the week straddles a month. */
function weekLabel(mondayISO: string): string {
  const mon = parseISODate(mondayISO)
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6)
  const start = `${MONTHS[mon.getMonth()]} ${mon.getDate()}`
  const end =
    mon.getMonth() === sun.getMonth()
      ? `${sun.getDate()}`
      : `${MONTHS[sun.getMonth()]} ${sun.getDate()}`
  return `${start} – ${end}`
}

function Count({ label, value, goal }: { label: string; value: number; goal: number }) {
  const met = value >= goal
  return (
    <span className={met ? 'text-accent-2' : 'text-amber-400'}>
      {label} {value}/{goal}
    </span>
  )
}

function Outcome({ row }: { row: WeekResult }) {
  if (row.outcome === 'advanced') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-accent">
        {row.exceeded && <MdStar className="text-accent-2" aria-hidden />}
        <MdLocalFireDepartment aria-hidden />
        {row.streakAfter}
      </span>
    )
  }
  if (row.outcome === 'froze') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-neutral-300">
        <MdAcUnit aria-hidden />−{row.freezesSpent}
      </span>
    )
  }
  return <span className="shrink-0 text-sm font-semibold text-amber-400">streak lost</span>
}

function Row({ row, goals }: { row: WeekResult; goals: WeeklyGoalConfig }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-300">
          {row.inProgress ? 'this week' : weekLabel(row.week)}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums">
          <Count label="workouts" value={row.counts.workouts} goal={goals.workouts} />
          <Count label="flex" value={row.counts.flex} goal={goals.flex} />
          <Count label="cal days" value={row.counts.calDays} goal={goals.calDays} />
        </div>
      </div>
      <Outcome row={row} />
    </div>
  )
}

const COLLAPSED = 8

export function StreakHistory() {
  const { streakHistory, streaks, goals } = useData()
  const [expanded, setExpanded] = useState(false)

  if (streakHistory.length === 0) return null

  // Most recent first: the week that decided the current streak reads at the top.
  const weeks = [...streakHistory].reverse()
  const shown = expanded ? weeks : weeks.slice(0, COLLAPSED)

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wider text-neutral-500">completed weeks</h3>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="flex items-center gap-1 text-accent">
            <MdLocalFireDepartment aria-hidden /> {streaks.streak}
          </span>
          <span className="flex items-center gap-1 text-neutral-300">
            <MdAcUnit aria-hidden /> {streaks.freezes}
          </span>
        </div>
      </div>

      <div>
        {shown.map((row) => (
          <Row key={row.week} row={row} goals={goals} />
        ))}
      </div>

      {weeks.length > COLLAPSED && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 min-h-[36px] w-full rounded-lg bg-surface-2 text-sm font-medium text-neutral-300 active:bg-border"
        >
          {expanded ? 'show less' : `show all ${weeks.length}`}
        </button>
      )}
    </div>
  )
}
