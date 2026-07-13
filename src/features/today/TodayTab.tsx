import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { useActiveSession } from './useActiveSession'
import { ActiveSession } from './ActiveSession'
import { ThisWeek } from './ThisWeek'
import { CalorieLogger } from './CalorieLogger'
import { WeightCard } from './WeightCard'
import { StretchSession } from '../flex/StretchSession'
import { storage } from '../../services/storage'
import { PROGRESS_PHOTO_HISTORY } from '../../config/photos'
import { photoReminder } from '../../lib/photoReminder'
import { toISODate } from '../../lib/dates'
import { MdPhotoCamera } from 'react-icons/md'

export function TodayTab() {
  const { saveSession, quickLog, logProgressPhoto, updateSettings, settings, workouts, bodyWeights } =
    useData()
  const controls = useActiveSession()
  const [flash, setFlash] = useState<string | null>(null)
  const [photoDismissed, setPhotoDismissed] = useState(false)
  const [stretching, setStretching] = useState(() => storage.loadStretch() != null)

  if (controls.session) {
    const dayType = controls.session.dayType
    return (
      <ActiveSession
        session={controls.session}
        controls={controls}
        onFinish={(s) => {
          void saveSession(s)
          controls.clear()
        }}
        onSkip={() => {
          void quickLog(dayType)
          controls.clear()
        }}
      />
    )
  }

  if (stretching) {
    return (
      <StretchSession
        onClose={() => {
          storage.saveStretch(null)
          setStretching(false)
        }}
      />
    )
  }

  const lastPhoto =
    [settings.lastProgressPhoto, ...PROGRESS_PHOTO_HISTORY]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null
  const reminder = photoReminder({ lastPhoto, bodyWeights, workouts })
  const snoozed = !!settings.photoSnoozeUntil && toISODate(new Date()) < settings.photoSnoozeUntil
  const photoDue = !photoDismissed && !snoozed && reminder.due

  const snoozePhotoAWeek = () => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    updateSettings({ ...settings, photoSnoozeUntil: toISODate(d) })
    setPhotoDismissed(true)
  }

  const flashMsg = (m: string) => {
    setFlash(m)
    setTimeout(() => setFlash(null), 1800)
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      {photoDue && (
        <div className="rounded-2xl bg-accent/15 p-3">
          <p className="text-sm text-accent">
            <MdPhotoCamera className="inline align-text-bottom mr-1" aria-hidden />
            Progress-photo time — {reminder.reason}.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                logProgressPhoto()
                flashMsg('Photo logged')
              }}
              className="min-h-[40px] flex-1 rounded-xl bg-accent text-sm font-semibold text-black"
            >
              I took it
            </button>
            <button
              onClick={snoozePhotoAWeek}
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

      <ThisWeek />

      <CalorieLogger />

      <WeightCard />

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Start a session
        </p>
        <button
          onClick={() => controls.start('push')}
          className="min-h-[64px] rounded-2xl bg-surface text-xl font-bold active:bg-surface-2"
        >
          Push Day
        </button>
        <button
          onClick={() => controls.start('pull')}
          className="min-h-[64px] rounded-2xl bg-surface text-xl font-bold active:bg-surface-2"
        >
          Pull + Legs Day
        </button>
        <button
          onClick={() => {
            if (!storage.loadStretch()) storage.saveStretch({ step: 0, done: [] })
            setStretching(true)
          }}
          className="min-h-[64px] rounded-2xl bg-surface text-xl font-bold active:bg-surface-2"
        >
          Stretch
        </button>
      </div>
    </div>
  )
}
