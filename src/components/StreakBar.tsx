import { useData } from '../store/DataContext'

function Stat({ icon, value, label, dim }: { icon: string; value: number; label: string; dim?: boolean }) {
  return (
    <div className={`flex flex-1 flex-col items-center rounded-2xl bg-surface py-3 ${dim ? 'opacity-40' : ''}`}>
      <span className="text-2xl leading-none">{icon}</span>
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
        <Stat icon="🔥" value={streaks.activeStreak} label="Active" dim={atRisk} />
        <Stat icon="🔥🔥" value={streaks.doubleStreak} label="Double" dim={atRisk} />
        <Stat icon="❄️" value={streaks.freezeCredits} label="Freezes" />
      </div>
      {atRisk && (
        <p className="mt-2 text-center text-xs text-accent">
          ⚠️ Streak at risk — no workout logged yet this week.
        </p>
      )}
    </div>
  )
}
