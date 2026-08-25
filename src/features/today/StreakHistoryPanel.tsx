import { useState } from 'react'
import { MdAcUnit, MdLocalFireDepartment, MdStar } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { parseISODate } from '../../lib/dates'
import { splitAtCurrentRun, type WeekResult } from '../../lib/weeklyStreak'

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

function Row({ row }: { row: WeekResult }) {
  // Each week against the bar it was actually held to, not today's: a goal a week
  // predates was zeroed out for it (see weeklyStreak.weeklyStreakHistory), and
  // reporting it here as missed would blame the week for a habit that wasn't
  // being tracked yet.
  const goals = row.goals
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
          {goals.vitaminDays > 0 && (
            <Count label="pills" value={row.counts.vitaminDays} goal={goals.vitaminDays} />
          )}
          {goals.whiteningDays > 0 && (
            <Count label="strips" value={row.counts.whiteningDays} goal={goals.whiteningDays} />
          )}
        </div>
      </div>
      <Outcome row={row} />
    </div>
  )
}

/**
 * The weeks behind the streak, dropped open under the streak on the Today tab.
 *
 * Only the current run is listed: those are the weeks the flame is counting.
 * Everything from the last broken streak back sits under the "…", since it can't
 * explain the number on screen — unless the run is empty, when the older weeks
 * are all there is to show and open where they'd otherwise leave nothing.
 *
 * It scrolls past a few weeks rather than growing without bound, so a long
 * history doesn't push the week's bars off the screen they were opened from.
 */
export function StreakHistoryPanel() {
  const { streakHistory } = useData()
  const { earlier, run } = splitAtCurrentRun(streakHistory)
  const [showEarlier, setShowEarlier] = useState(run.length === 0)

  // Most recent first: the week that decided the current streak reads at the top.
  const runRows = [...run].reverse()
  const earlierRows = [...earlier].reverse()

  return (
    <div className="mb-3 max-h-[45vh] overflow-y-auto rounded-xl bg-surface-2 px-3 py-1">
      {runRows.map((row) => (
        <Row key={row.week} row={row} />
      ))}

      {earlierRows.length > 0 && (
        <>
          <button
            onClick={() => setShowEarlier((v) => !v)}
            aria-expanded={showEarlier}
            aria-label={showEarlier ? 'hide earlier weeks' : 'earlier weeks'}
            className="my-1 min-h-[36px] w-full rounded-lg bg-surface text-sm font-medium text-neutral-300 active:bg-border"
          >
            {showEarlier ? 'hide' : '…'}
          </button>
          {showEarlier && (
            <div className="opacity-70">
              {earlierRows.map((row) => (
                <Row key={row.week} row={row} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
