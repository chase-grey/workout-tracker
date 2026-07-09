import type { IconType } from 'react-icons'
import { MdLocalFireDepartment, MdWhatshot, MdAcUnit, MdWarningAmber } from 'react-icons/md'
import { useData } from '../store/DataContext'

function Stat({ Icon, value, label, dim }: { Icon: IconType; value: number; label: string; dim?: boolean }) {
  return (
    <div className={`flex flex-1 flex-col items-center rounded-2xl bg-surface py-3 ${dim ? 'opacity-40' : ''}`}>
      <Icon className="text-2xl leading-none" aria-hidden />
      <span className="mt-1 text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  )
}

export function StreakBar() {
  const { streaks, atRisk } = useData()
  return (
    <div>
      <div className="flex gap-2">
        <Stat Icon={MdLocalFireDepartment} value={streaks.activeStreak} label="Active" dim={atRisk} />
        <Stat Icon={MdWhatshot} value={streaks.doubleStreak} label="Double" dim={atRisk} />
        <Stat Icon={MdAcUnit} value={streaks.freezeCredits} label="Freezes" />
      </div>
      {atRisk && (
        <p className="mt-2 text-center text-xs text-accent">
          <MdWarningAmber className="inline align-text-bottom mr-1" aria-hidden />
          Streak at risk — no workout logged yet this week.
        </p>
      )}
    </div>
  )
}
