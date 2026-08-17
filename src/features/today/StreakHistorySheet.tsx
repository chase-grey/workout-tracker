import { useState } from 'react'
import { MdAcUnit, MdLocalFireDepartment, MdStar } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { parseISODate } from '../../lib/dates'
import { splitAtCurrentRun, type WeekResult, type WeeklyGoalConfig } from '../../lib/weeklyStreak'

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

/**
 * The weeks behind the streak, opened by tapping the streak on the Today tab.
 *
 * Only the current run is listed: those are the weeks the flame is counting.
 * Everything from the last broken streak back sits under the "…", since it can't
 * explain the number on screen — unless the run is empty, when the older weeks
 * are all there is to show and open where they'd otherwise be a blank sheet.
 */
export function StreakHistorySheet({ onClose }: { onClose: () => void }) {
  const { streakHistory, streaks, goals } = useData()
  const { earlier, run } = splitAtCurrentRun(streakHistory)
  const [showEarlier, setShowEarlier] = useState(run.length === 0)

  // Most recent first: the week that decided the current streak reads at the top.
  const runRows = [...run].reverse()
  const earlierRows = [...earlier].reverse()

  return (
    <div className="fixed inset-0 z-60 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-bold">completed weeks</h3>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <span className="flex items-center gap-1 text-accent">
              <MdLocalFireDepartment aria-hidden /> {streaks.streak}
            </span>
            <span className="flex items-center gap-1 text-neutral-300">
              <MdAcUnit aria-hidden /> {streaks.freezes}
            </span>
          </div>
        </div>

        {runRows.length > 0 && (
          <div>
            {runRows.map((row) => (
              <Row key={row.week} row={row} goals={goals} />
            ))}
          </div>
        )}

        {earlierRows.length > 0 && (
          <>
            <button
              onClick={() => setShowEarlier((v) => !v)}
              aria-expanded={showEarlier}
              className="mt-2 min-h-[36px] w-full rounded-lg bg-surface-2 text-sm font-medium text-neutral-300 active:bg-border"
            >
              {showEarlier ? 'hide' : '…'}
            </button>
            {showEarlier && (
              <div className="mt-1 opacity-70">
                {earlierRows.map((row) => (
                  <Row key={row.week} row={row} goals={goals} />
                ))}
              </div>
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="mt-4 min-h-[48px] w-full rounded-2xl bg-surface-2 font-semibold text-neutral-200 active:opacity-80"
        >
          close
        </button>
      </div>
    </div>
  )
}
