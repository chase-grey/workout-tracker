import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { ThisWeek } from './ThisWeek'
import { CalorieLogger } from './CalorieLogger'
import { WeightCard } from './WeightCard'
import { PROGRESS_PHOTO_HISTORY } from '../../config/photos'
import { photoReminder } from '../../lib/photoReminder'
import { toISODate } from '../../lib/dates'
import { DAY_TYPES, type VariantKey } from '../../config/plan'
import { lastTrainingSession } from '../../lib/session'
import type { DayType } from '../../types'
import { MdPhotoCamera } from 'react-icons/md'

type Props = {
  onStart: (dayType: DayType, variant?: VariantKey) => void
  onStartStretch: () => void
}

export function TodayTab({ onStart, onStartStretch }: Props) {
  const { logProgressPhoto, updateSettings, settings, workouts, bodyWeights, plan } = useData()
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

  // If the last training day was push or pull, dim that day's button so the app
  // nudges you toward the other half of the split. A full-body day trains both, so
  // it dims neither; stretch + core isn't training and never changes this. Dimming
  // is only a hint — the button still starts the session.
  const lastDay = lastTrainingSession(workouts)?.dayType ?? null
  const dimmedDay: DayType | null = lastDay === 'push' || lastDay === 'pull' ? lastDay : null

  return (
    // No bottom padding of its own: `main` already pads below the scroll area, and
    // stacking a second 1rem on top of it pushed the home page just past the
    // viewport — enough to make it scroll by a hair with nothing to scroll to.
    <div className="flex flex-col gap-3">
      {photoDue && (
        <div className="rounded-2xl bg-accent/15 p-3">
          <p className="text-sm text-accent">
            <MdPhotoCamera className="inline align-text-bottom mr-1" aria-hidden />
            progress-photo time — {reminder.reason}.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                logProgressPhoto()
                flashMsg('photo logged')
              }}
              className="min-h-[40px] flex-1 rounded-xl bg-accent text-sm font-semibold text-black"
            >
              took it
            </button>
            <button
              onClick={snoozePhotoAWeek}
              className="min-h-[40px] rounded-xl bg-surface px-3 text-sm text-neutral-400"
            >
              later
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
        <p className="px-1 text-xs font-semibold tracking-wider text-neutral-500">
          start a session
        </p>
        <button
          onClick={onStartStretch}
          className="min-h-[52px] rounded-2xl bg-surface text-lg font-bold active:bg-surface-2"
        >
          stretch + core
        </button>
        {DAY_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onStart(t)}
            className={`min-h-[52px] rounded-2xl bg-surface text-lg font-bold active:bg-surface-2 ${
              t === dimmedDay ? 'opacity-50' : ''
            }`}
          >
            {plan[t].label}
          </button>
        ))}
      </div>
    </div>
  )
}
