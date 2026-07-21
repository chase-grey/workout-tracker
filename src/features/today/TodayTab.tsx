import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { ThisWeek } from './ThisWeek'
import { CalorieLogger } from './CalorieLogger'
import { WeightCard } from './WeightCard'
import { PROGRESS_PHOTO_HISTORY } from '../../config/photos'
import { photoReminder } from '../../lib/photoReminder'
import { toISODate } from '../../lib/dates'
import type { DayType } from '../../types'
import { MdPhotoCamera } from 'react-icons/md'

type Props = {
  onStart: (dayType: DayType) => void
  onStartStretch: () => void
}

export function TodayTab({ onStart, onStartStretch }: Props) {
  const { logProgressPhoto, updateSettings, settings, workouts, bodyWeights } = useData()
  const [flash, setFlash] = useState<string | null>(null)
  const [photoDismissed, setPhotoDismissed] = useState(false)

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
    <div className="flex flex-col gap-3 pb-4">
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
          onClick={() => onStart('push')}
          className="min-h-[52px] rounded-2xl bg-surface text-lg font-bold active:bg-surface-2"
        >
          Push Day
        </button>
        <button
          onClick={() => onStart('pull')}
          className="min-h-[52px] rounded-2xl bg-surface text-lg font-bold active:bg-surface-2"
        >
          Pull + Legs Day
        </button>
        <button
          onClick={onStartStretch}
          className="min-h-[52px] rounded-2xl bg-surface text-lg font-bold active:bg-surface-2"
        >
          Stretch
        </button>
      </div>
    </div>
  )
}
