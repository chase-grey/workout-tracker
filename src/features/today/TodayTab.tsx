import { Fragment, useRef, useState } from 'react'
import { useData } from '../../store/DataContext'
import { ThisWeek } from './ThisWeek'
import { DailyHabits } from './DailyHabits'
import { WeightCard } from './WeightCard'
import { BackendBanner } from '../../components/BackendBanner'
import { PROGRESS_PHOTO_HISTORY } from '../../config/photos'
import { photoReminder } from '../../lib/photoReminder'
import { toISODate } from '../../lib/dates'
import { dayOrder, type VariantKey } from '../../config/plan'
import { lastTrainingSession } from '../../lib/session'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../../config/flexRoutines'
import type { DayType } from '../../types'
import { MdPhotoCamera } from 'react-icons/md'
import { weeklyAbsDays, WEEKLY_ABS_GOAL } from '../../lib/weeklyAbs'
import { hasPillar, ownerFlavour } from '../../lib/profile'
import { lastStretchRoutine } from '../../lib/stretchRotation'
import { CardioCard } from './CardioCard'

const sessionButton =
  'min-h-[52px] rounded-2xl bg-surface text-lg font-bold active:bg-surface-2'

type Props = {
  onStart: (dayType: DayType, variant?: VariantKey) => void
  onStartStretch: (routine: FlexRoutineKey) => void
  onStartAbs: () => void
}

export function TodayTab({ onStart, onStartStretch, onStartAbs }: Props) {
  const { logProgressPhoto, updateSettings, settings, workouts, bodyWeights, plan, flexEntries, cardioEntries, goals, logCardio, deleteCardio } =
    useData()
  // What this person tracks decides what the page offers (see lib/profile). The
  // owner's own extras — the photo history, the core block — stay his.
  const profile = settings.profile
  const owner = ownerFlavour(profile)
  const strength = hasPillar(profile, 'strength')
  const flexibility = hasPillar(profile, 'flexibility')
  const [flash, setFlash] = useState<string | null>(null)
  const [photoDismissed, setPhotoDismissed] = useState(false)
  const [habitWeek, setHabitWeek] = useState<string | null>(null)
  const habitsRef = useRef<HTMLDivElement>(null)

  const showHabitWeek = (week: string) => {
    setHabitWeek(week)
    requestAnimationFrame(() => habitsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  const lastPhoto =
    [settings.lastProgressPhoto, ...(owner ? PROGRESS_PHOTO_HISTORY : [])]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null
  const reminder = photoReminder({ lastPhoto, bodyWeights, workouts, plan })
  const snoozed = !!settings.photoSnoozeUntil && toISODate(new Date()) < settings.photoSnoozeUntil
  const photoDue = !photoDismissed && !snoozed && reminder.due && (owner || strength)

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

  // Dim the button of whichever lift day was trained last, so the app nudges you
  // on round the three — push, pull + legs and full body each take a turn in the
  // week now that every day has a form that fits inside an hour (see
  // SessionLength). Stretch + core isn't training and never changes this. Dimming
  // is only a hint — the button still starts the session.
  const lastDay = lastTrainingSession(workouts)?.dayType ?? null
  const dimmedDay: DayType | null = lastDay

  // The two stretch routines would dim the same way and for the same reason —
  // whichever was done last steps back so the other reads as up next — but for
  // now head to toe is the focus, so the side split is pinned dim and head to
  // toe always reads as up next. Dimming is only a hint; the side split still
  // starts. To go back to alternating, read `lastStretchRoutine` from
  // lib/stretchRotation off `flexEntries` here instead of the constant.
  // That pin is the owner's focus; anyone else's two routines take turns.
  const dimmedStretch: FlexRoutineKey | null = owner ? 'side_split' : lastStretchRoutine(flexEntries)
  const abDays = weeklyAbsDays(workouts, plan, toISODate(new Date()))
  const absRemaining = Math.max(0, WEEKLY_ABS_GOAL - abDays.length)

  // Whichever half of an alternating pair reads as up next takes the top row:
  // the dimmed one was just done, so it steps down and the button you're
  // likelier to want is the first one your eye and thumb land on. With nothing
  // dimmed — no history yet, or a full-body day, which dims neither — the pair
  // keeps the order it already had.
  const nextUpFirst = <T,>(pair: T[], dimmed: T | null) =>
    dimmed && pair.length === 2 && pair[0] === dimmed ? [pair[1], pair[0]] : pair

  // The alternating lifts in the left column. Full body is placed rather than
  // ordered — it sits at bottom right whatever Settings says — so the order
  // chosen there applies to the two days that alternate. A full-body day just
  // done dims its own button and leaves this pair's order alone.
  // A day with no exercises is a slot the plan doesn't use — a two-day starter
  // plan leaves its third empty — so it gets no button.
  const liftDays = strength
    ? nextUpFirst(
        dayOrder(plan).filter((t) => t !== 'fullbody' && plan[t].exercises.length > 0),
        dimmedDay,
      )
    : []
  const showFullBody = strength && plan.fullbody.exercises.length > 0

  // The right column: the same two routines, rotated the same way.
  const stretchRoutines = flexibility ? nextUpFirst(FLEX_ROUTINE_KEYS, dimmedStretch) : []
  const showCore = owner && strength
  // With only one of the two columns in use, its buttons run across both rather
  // than down one side of an empty half.
  const paired = liftDays.length > 0 && stretchRoutines.length > 0

  return (
    // No bottom padding of its own: `main` already pads below the scroll area, and
    // stacking a second 1rem on top of it pushed the home page just past the
    // viewport — enough to make it scroll by a hair with nothing to scroll to.
    <div className="flex flex-col gap-2">
      <BackendBanner />
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
              className="min-h-[40px] flex-1 rounded-xl bg-accent text-sm font-semibold text-on-accent"
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

      <ThisWeek onSelectWeek={showHabitWeek} />

      {hasPillar(profile, 'diet') && (
        <div ref={habitsRef}>
          <DailyHabits weekStart={habitWeek} onShowCurrentWeek={() => setHabitWeek(null)} />
        </div>
      )}

      {hasPillar(profile, 'cardio') && (
        <CardioCard
          entries={cardioEntries}
          goal={goals.cardio ?? 0}
          onLog={(entry) => void logCardio(entry)}
          onDelete={(id) => void deleteCardio(id)}
        />
      )}

      <WeightCard />

      {/* Lift days and stretches alternate within their columns; core sits at
          the bottom left beside full body. */}
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
                paired && <div />
              )}
              {r ? (
                <button
                  onClick={() => onStartStretch(r)}
                  className={`${sessionButton} ${r === dimmedStretch ? 'opacity-50' : ''}`}
                >
                  {FLEX_ROUTINES[r].label}
                </button>
              ) : (
                paired && <div />
              )}
            </Fragment>
          )
        })}
        {showCore ? (
          <button onClick={onStartAbs} className={`${sessionButton} ${absRemaining === 0 ? 'opacity-50' : ''}`}>
            core
          </button>
        ) : (
          showFullBody && paired && <div />
        )}
        {showFullBody && (
          <button
            onClick={() => onStart('fullbody')}
            className={`${sessionButton} ${dimmedDay === 'fullbody' ? 'opacity-50' : ''}`}
          >
            {plan.fullbody.label}
          </button>
        )}
      </div>
    </div>
  )
}
