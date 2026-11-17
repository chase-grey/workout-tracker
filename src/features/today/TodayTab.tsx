import { useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useData } from '../../store/DataContext'
import { ThisWeek } from './ThisWeek'
import { DailyHabits } from './DailyHabits'
import { WeightCard } from './WeightCard'
import { BackendBanner } from '../../components/BackendBanner'
import { PROGRESS_PHOTO_HISTORY } from '../../config/photos'
import { photoReminder } from '../../lib/photoReminder'
import { NeverAskPhotos } from '../../components/NeverAskPhotos'
import { toISODate } from '../../lib/dates'
import { dayOrder, type VariantKey } from '../../config/plan'
import { lastTrainingSession } from '../../lib/session'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../../config/flexRoutines'
import type { DayType } from '../../types'
import { MdPhotoCamera } from 'react-icons/md'
import { weeklyAbsDays, WEEKLY_ABS_GOAL } from '../../lib/weeklyAbs'
import { hasPillar, ownerFlavour, readsBodyFat, weighsIn } from '../../lib/profile'
import { lastStretchRoutine } from '../../lib/stretchRotation'
import { cardioSummary } from '../../lib/cardio'
import { HomeTiles } from './HomeTiles'
import { TourCard } from './TourCard'
import { CardioLogSheet } from './CardioLogSheet'
import { candidateTiles, type HomeTile } from '../../lib/homeTiles'

type Props = {
  onStart: (dayType: DayType, variant?: VariantKey) => void
  onStartStretch: (routine: FlexRoutineKey) => void
  onStartAbs: () => void
}

export function TodayTab({ onStart, onStartStretch, onStartAbs }: Props) {
  const { logProgressPhoto, updateSettings, settings, workouts, bodyWeights, plan, flexEntries, cardioEntries, logCardio, deleteCardio } =
    useData()
  // What this person tracks decides what the page offers (see lib/profile). The
  // owner's own extras — the photo history, the core block — stay his.
  const profile = settings.profile
  const owner = ownerFlavour(profile)
  const strength = hasPillar(profile, 'strength')
  const [flash, setFlash] = useState<{ text: string; undo?: () => void } | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const [loggingCardio, setLoggingCardio] = useState(false)
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
  const reminder = photoReminder({ lastPhoto, bodyWeights, workouts, plan, photosOff: settings.photosOff })
  const snoozed = !!settings.photoSnoozeUntil && toISODate(new Date()) < settings.photoSnoozeUntil
  const photoDue = !photoDismissed && !snoozed && reminder.due && (owner || strength)

  const snoozePhotoAWeek = () => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    updateSettings({ ...settings, photoSnoozeUntil: toISODate(d) })
    setPhotoDismissed(true)
  }

  const flashMsg = (text: string, undo?: () => void) => {
    setFlash({ text, undo })
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), undo ? 5000 : 1800)
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

  // That rotation only orders the tiles until they've been dragged into an
  // order of their own (see HomeTiles); from then on that order holds.
  const liftDays = dayOrder(plan).filter((t) => plan[t].exercises.length > 0)
  const candidates = candidateTiles({
    liftDays: [
      ...nextUpFirst(liftDays.filter((t) => t !== 'fullbody'), dimmedDay),
      ...liftDays.filter((t) => t === 'fullbody'),
    ],
    // The core block is the owner's.
    core: owner,
    routines: nextUpFirst(FLEX_ROUTINE_KEYS, dimmedStretch),
    pins: settings.cardioPins ?? [],
  })

  const tileLabel = (t: HomeTile) => {
    switch (t.type) {
      case 'lift':
        return plan[t.day].label
      case 'stretch':
        return FLEX_ROUTINES[t.routine].label
      case 'pin':
        return t.pin.kind
      default:
        return t.type
    }
  }
  const tileDetail = (t: HomeTile) =>
    t.type === 'pin' ? cardioSummary({ minutes: t.pin.minutes, distanceMi: t.pin.distanceMi }) : undefined
  const tileDimmed = (t: HomeTile) =>
    (t.type === 'lift' && t.day === dimmedDay) ||
    (t.type === 'stretch' && t.routine === dimmedStretch) ||
    (t.type === 'core' && absRemaining === 0)

  const openTile = (t: HomeTile) => {
    switch (t.type) {
      case 'lift':
        return onStart(t.day)
      case 'stretch':
        return onStartStretch(t.routine)
      case 'core':
        return onStartAbs()
      case 'cardio':
        return setLoggingCardio(true)
      case 'pin': {
        // One tap logs it for today; the flash holds the way back.
        const id = uuid()
        const { kind, minutes, distanceMi } = t.pin
        void logCardio({ id, date: toISODate(new Date()), kind, minutes, ...(distanceMi ? { distanceMi } : {}) })
        flashMsg(`${kind} logged`, () => void deleteCardio(id))
        return
      }
    }
  }

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
            {reminder.reason}.
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
            <NeverAskPhotos onConfirm={() => updateSettings({ ...settings, photosOff: true })} />
          </div>
        </div>
      )}

      {flash && (
        <div className="flex min-h-[44px] items-center justify-center gap-3 rounded-xl bg-accent-2/20 px-2 text-sm text-accent-2">
          <span>{flash.text}</span>
          {flash.undo && (
            <button
              onClick={() => {
                flash.undo?.()
                window.clearTimeout(flashTimer.current)
                setFlash(null)
              }}
              className="min-h-[44px] px-2 font-semibold underline"
            >
              undo
            </button>
          )}
        </div>
      )}

      <TourCard anchor="week" />
      <ThisWeek onSelectWeek={showHabitWeek} />

      {hasPillar(profile, 'diet') && (
        <div ref={habitsRef}>
          <TourCard anchor="habits" />
          <DailyHabits weekStart={habitWeek} onShowCurrentWeek={() => setHabitWeek(null)} />
        </div>
      )}

      {(weighsIn(profile) || readsBodyFat(profile)) && <WeightCard />}

      <TourCard anchor="tiles" />
      <HomeTiles
        candidates={candidates}
        label={tileLabel}
        detail={tileDetail}
        dimmed={tileDimmed}
        onOpen={openTile}
      />

      {loggingCardio && (
        <CardioLogSheet
          onSave={(entry) => void logCardio(entry)}
          entries={cardioEntries}
          onDelete={(id) => void deleteCardio(id)}
          onClose={() => setLoggingCardio(false)}
        />
      )}
    </div>
  )
}
