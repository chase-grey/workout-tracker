import { Fragment, useState } from 'react'
import { useData } from '../../store/DataContext'
import { ThisWeek } from './ThisWeek'
import { DailyHabits } from './DailyHabits'
import { WeightCard } from './WeightCard'
import { PROGRESS_PHOTO_HISTORY } from '../../config/photos'
import { photoReminder } from '../../lib/photoReminder'
import { toISODate } from '../../lib/dates'
import { dayOrder, type VariantKey } from '../../config/plan'
import { lastTrainingSession } from '../../lib/session'
import { lastStretchRoutine } from '../../lib/stretchRotation'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../../config/flexRoutines'
import type { DayType } from '../../types'
import { MdPhotoCamera } from 'react-icons/md'

const sessionButton =
  'min-h-[52px] rounded-2xl bg-surface text-lg font-bold active:bg-surface-2'

type Props = {
  onStart: (dayType: DayType, variant?: VariantKey) => void
  onStartStretch: (routine: FlexRoutineKey) => void
}

export function TodayTab({ onStart, onStartStretch }: Props) {
  const { logProgressPhoto, updateSettings, settings, workouts, bodyWeights, plan, flexEntries } =
    useData()
  const [flash, setFlash] = useState<string | null>(null)
  const [photoDismissed, setPhotoDismissed] = useState(false)

  const lastPhoto =
    [settings.lastProgressPhoto, ...PROGRESS_PHOTO_HISTORY]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null
  const reminder = photoReminder({ lastPhoto, bodyWeights, workouts, plan })
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

  // The two stretch routines dim the same way and for the same reason: whichever
  // was done last steps back so the other reads as up next.
  const dimmedStretch = lastStretchRoutine(flexEntries)

  // Whichever half of an alternating pair reads as up next takes the top row:
  // the dimmed one was just done, so it steps down and the button you're
  // likelier to want is the first one your eye and thumb land on. With nothing
  // dimmed — no history yet, or a full-body day, which dims neither — the pair
  // keeps the order it already had.
  const nextUpFirst = <T,>(pair: T[], dimmed: T | null) =>
    dimmed && pair.length === 2 && pair[0] === dimmed ? [pair[1], pair[0]] : pair

  // The left column of the session grid. Full body is placed rather than
  // ordered — it sits on the bottom row whatever Settings says — so the order
  // chosen there applies to the two days that alternate.
  const liftDays = nextUpFirst(
    dayOrder(plan).filter((t) => t !== 'fullbody'),
    dimmedDay,
  )

  // The right column: the same two routines, rotated the same way.
  const stretchRoutines = nextUpFirst(FLEX_ROUTINE_KEYS, dimmedStretch)

  return (
    // No bottom padding of its own: `main` already pads below the scroll area, and
    // stacking a second 1rem on top of it pushed the home page just past the
    // viewport — enough to make it scroll by a hair with nothing to scroll to.
    <div className="flex flex-col gap-2">
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

      <DailyHabits />

      <WeightCard />

      {/* One grid rather than a row per kind: the lift days run down the left
          column, the stretch routines down the right, and full body takes the
          bottom row on its own. Each dimming pair still sits together, up next
          over just-done, and nothing is full width except the day that trains
          everything, so the page still fits without scrolling. */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: Math.max(liftDays.length, stretchRoutines.length) }, (_, i) => {
          const t = liftDays[i]
          const r = stretchRoutines[i]
          return (
            <Fragment key={i}>
              {t ? (
                <button
                  onClick={() => onStart(t)}
                  className={`${sessionButton} ${t === dimmedDay ? 'opacity-50' : ''}`}
                >
                  {plan[t].label}
                </button>
              ) : (
                <div />
              )}
              {r ? (
                <button
                  onClick={() => onStartStretch(r)}
                  className={`${sessionButton} ${r === dimmedStretch ? 'opacity-50' : ''}`}
                >
                  {FLEX_ROUTINES[r].label}
                </button>
              ) : (
                <div />
              )}
            </Fragment>
          )
        })}
        <button onClick={() => onStart('fullbody')} className={`${sessionButton} col-span-2`}>
          {plan.fullbody.label}
        </button>
      </div>
    </div>
  )
}
