import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { useActiveSession } from './useActiveSession'
import { ActiveSession } from './ActiveSession'
import { WeightLogSheet } from './WeightLogSheet'
import { StreakBar } from '../../components/StreakBar'
import { Sparkline } from '../../components/Sparkline'
import { WeeklySummary } from '../summary/WeeklySummary'

export function TodayTab() {
  const { bodyWeights, saveSession } = useData()
  const controls = useActiveSession()
  const [showWeight, setShowWeight] = useState(false)

  if (controls.session) {
    return (
      <ActiveSession
        session={controls.session}
        controls={controls}
        onFinish={(s) => {
          void saveSession(s)
          controls.clear()
        }}
      />
    )
  }

  const recent = bodyWeights.slice(-7)
  const latest = recent[recent.length - 1]

  return (
    <div className="flex flex-col gap-5 pb-24">
      <StreakBar />

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Start a workout
        </p>
        <button
          onClick={() => controls.start('push')}
          className="min-h-[64px] rounded-2xl bg-accent text-xl font-bold text-black active:opacity-80"
        >
          Push Day
        </button>
        <button
          onClick={() => controls.start('pull')}
          className="min-h-[64px] rounded-2xl bg-surface text-xl font-bold active:bg-surface-2"
        >
          Pull Day
        </button>
      </div>

      <div className="rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">Body weight</p>
            <p className="text-2xl font-bold tabular-nums">
              {latest ? `${latest.weightLbs} lbs` : '—'}
            </p>
          </div>
          <Sparkline values={recent.map((r) => r.weightLbs)} />
        </div>
        <button
          onClick={() => setShowWeight(true)}
          className="mt-3 min-h-[44px] w-full rounded-xl bg-surface-2 font-medium active:opacity-80"
        >
          Log weight
        </button>
      </div>

      <WeeklySummary />

      {showWeight && <WeightLogSheet onClose={() => setShowWeight(false)} />}
    </div>
  )
}
