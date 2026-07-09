import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { useActiveSession } from './useActiveSession'
import { ActiveSession } from './ActiveSession'
import { WeightLogSheet } from './WeightLogSheet'
import { StreakBar } from '../../components/StreakBar'
import { Sparkline } from '../../components/Sparkline'
import { WeeklySummary } from '../summary/WeeklySummary'
import { parseISODate } from '../../lib/dates'

const PHOTO_CADENCE_DAYS = 14

export function TodayTab() {
  const { bodyWeights, saveSession, quickLog, logFlex, logProgressPhoto, settings } = useData()
  const controls = useActiveSession()
  const [showWeight, setShowWeight] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [photoDismissed, setPhotoDismissed] = useState(false)

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

  const last = settings.lastProgressPhoto
  const photoDue =
    !photoDismissed &&
    (!last || (Date.now() - parseISODate(last).getTime()) / 86400000 >= PHOTO_CADENCE_DAYS)

  const flashMsg = (m: string) => {
    setFlash(m)
    setTimeout(() => setFlash(null), 1800)
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <StreakBar />

      {photoDue && (
        <div className="rounded-2xl bg-accent/15 p-3">
          <p className="text-sm text-accent">📸 Progress-photo time — you should be able to see changes by now.</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                logProgressPhoto()
                flashMsg('Photo logged 📸')
              }}
              className="min-h-[40px] flex-1 rounded-xl bg-accent text-sm font-semibold text-black"
            >
              I took it
            </button>
            <button
              onClick={() => setPhotoDismissed(true)}
              className="min-h-[40px] rounded-xl bg-surface px-3 text-sm text-neutral-400"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {flash && (
        <div className="rounded-xl bg-accent-2/20 p-2 text-center text-sm text-accent-2">{flash}</div>
      )}

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
          Pull + Legs Day
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Quick log (no details)
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              void quickLog('push')
              flashMsg('Push day logged ✓')
            }}
            className="min-h-[48px] flex-1 rounded-xl bg-surface text-sm font-semibold active:bg-surface-2"
          >
            Push
          </button>
          <button
            onClick={() => {
              void quickLog('pull')
              flashMsg('Pull day logged ✓')
            }}
            className="min-h-[48px] flex-1 rounded-xl bg-surface text-sm font-semibold active:bg-surface-2"
          >
            Pull
          </button>
          <button
            onClick={() => {
              void logFlex(null, 'Stretch session (quick log)')
              flashMsg('Stretch logged ✓')
            }}
            className="min-h-[48px] flex-1 rounded-xl bg-surface text-sm font-semibold active:bg-surface-2"
          >
            Stretch
          </button>
        </div>
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
