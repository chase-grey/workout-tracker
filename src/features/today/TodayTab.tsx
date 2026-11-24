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
import { trainingSessions } from '../../lib/session'
import { nextLiftDay } from '../../lib/liftRotation'
import { FLEX_ROUTINES, type FlexRoutineKey } from '../../config/flexRoutines'
import type { DayType } from '../../types'
import { MdPhotoCamera } from 'react-icons/md'
import { weeklyAbsDays, WEEKLY_ABS_GOAL } from '../../lib/weeklyAbs'
import { hasPillar, ownerFlavour, readsBodyFat, weighsIn } from '../../lib/profile'
import { dailyStanding, nextStretchUp } from '../../lib/dailyRoutine'
import { cardioSummary } from '../../lib/cardio'
import { HomeTiles } from './HomeTiles'
import { CardioLogSheet } from './CardioLogSheet'
import { CardioGoalSheet } from './CardioGoalSheet'
import { cardioSessionsForWeek, goalLabel, planActive, plannedDone, plannedOn } from '../../lib/cardioPlan'
import { candidateTiles, type HomeTile } from '../../lib/homeTiles'
import { WeekCalendar } from './WeekCalendar'
import { defaultCalendarDate, schedulablePillars, type CalendarAction, type PlannedCardio } from '../../lib/weekCalendar'
import { EditableStack, type StackCard } from '../../components/EditableStack'
import type { CardLayout } from '../../lib/cardLayout'
import { PILLARS } from '../../lib/profile'
import { WeekGoalOrder } from './WeekGoalOrder'
import { MuscleAvatar } from '../progress/MuscleAvatar'
import { CardioChart } from '../progress/CardioChart'
import { CardioPlanCard } from '../progress/CardioPlanCard'
import { TimeSpent } from '../progress/TimeSpent'
import { weekStartISO } from '../../lib/dates'
import { StretchLogCard } from './StretchLogCard'
import { logsStretchOnly, stretchRoutinesFor } from '../../lib/flexSkills'

type Props = {
  onStart: (dayType: DayType, variant?: VariantKey) => void
  onStartStretch: (routine: FlexRoutineKey) => void
  onStartAbs: () => void
}

export function TodayTab({ onStart, onStartStretch, onStartAbs }: Props) {
  const { logProgressPhoto, updateSettings, settings, workouts, bodyWeights, plan, flexEntries, cardioEntries, goals, logCardio, deleteCardio, logFlex } =
    useData()
  // What this person tracks decides what the page offers (see lib/profile). The
  // owner's own extras — the photo history, the core block — stay his.
  const profile = settings.profile
  const owner = ownerFlavour(profile)
  const strength = hasPillar(profile, 'strength')
  const [flash, setFlash] = useState<{ text: string; undo?: () => void } | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const [loggingCardio, setLoggingCardio] = useState(false)
  const [settingCardioGoal, setSettingCardioGoal] = useState(false)
  // Today's session from the cardio plan, until something's logged against it.
  const todayISO = toISODate(new Date())
  const cardioPlan = planActive(settings.cardioPlan, todayISO) ? settings.cardioPlan : undefined
  const todaysCardio =
    cardioPlan && !plannedDone(cardioPlan, cardioEntries, todayISO) ? plannedOn(cardioPlan, todayISO) : null
  const [photoDismissed, setPhotoDismissed] = useState(false)
  const [habitWeek, setHabitWeek] = useState<string | null>(null)
  const habitsRef = useRef<HTMLDivElement>(null)

  // The page's cards as they've been arranged (see components/EditableStack).
  // The calendar can also be switched off in Settings, so the two are kept as
  // one answer: off there is off here, and putting it back here turns it on there.
  const calendarOff = settings.showWeekCalendar === false
  const saved = settings.todayLayout
  const layout: CardLayout | undefined =
    saved || calendarOff
      ? {
          order: saved?.order ?? [],
          added: saved?.added,
          removed: [...(saved?.removed ?? []).filter((id) => id !== 'calendar'), ...(calendarOff ? ['calendar'] : [])],
        }
      : undefined
  const saveLayout = (next: CardLayout) =>
    updateSettings({ ...settings, todayLayout: next, showWeekCalendar: !next.removed.includes('calendar') })

  // The week calendar and the calorie card show the same week, and with the
  // calendar up its day is the one the calorie card logs to — the card's own
  // Mon–Sun strip steps aside for it.
  const showCalendar = !calendarOff
  const calendarRef = useRef<HTMLDivElement>(null)
  const [calendarDate, setCalendarDate] = useState<string | null>(null)
  const today = toISODate(new Date())
  const shownWeek = habitWeek ?? weekStartISO(today)
  const pickedDate = calendarDate ?? defaultCalendarDate(shownWeek, today)
  const showWeek = (week: string) => {
    setHabitWeek(week === weekStartISO(today) ? null : week)
    setCalendarDate(null)
  }
  // The week's planned cardio, from the cardio plan (see lib/cardioPlan).
  const plannedCardio: PlannedCardio[] = cardioSessionsForWeek(settings.cardioPlan, shownWeek)
  const runCalendarAction = (a: CalendarAction) => {
    if (a.type === 'lift') onStart(a.day)
    else if (a.type === 'stretch') onStartStretch(a.routine)
    else setLoggingCardio(true)
  }

  const showHabitWeek = (week: string) => {
    showWeek(week)
    const target = showCalendar ? calendarRef : habitsRef
    requestAnimationFrame(() => target.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
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

  // The lift days are one rotation: exactly one is up next, and it wears the
  // accent border. Which one is lib/liftRotation's call — the day that has waited
  // longest, with full body held until the day after a rest day. Stretch + core
  // isn't training and never changes this. The border is only a hint — every
  // button is as live as it looks, and starts its session.
  const liftDays = dayOrder(plan).filter((t) => plan[t].exercises.length > 0)
  const nextDay: DayType | null = nextLiftDay(trainingSessions(workouts), todayISO, liftDays)

  // The stretch that's up next: a routine owed by the day (the pelvic tilt
  // corrective, six days of seven) until today's is done, and otherwise the next
  // of the routines that take turns. With a daily routine trained, the ones that
  // take turns are never marked — see lib/dailyRoutine.
  const routines = stretchRoutinesFor(profile)
  const nextStretch: FlexRoutineKey | null = nextStretchUp(routines, flexEntries, todayISO)
  const abDays = weeklyAbsDays(workouts, plan, todayISO)
  const absRemaining = Math.max(0, WEEKLY_ABS_GOAL - abDays.length)

  // Whatever is up next leads its own kind: it's the button you're likelier to
  // want, so it's the first one your eye and thumb land on, and the rest keep
  // their order behind it.
  const nextUpFirst = <T,>(all: T[], next: T | null) =>
    next != null && all.includes(next) ? [next, ...all.filter((t) => t !== next)] : all

  // That rotation only orders the tiles until they've been dragged into an
  // order of their own (see HomeTiles); from then on that order holds.
  const candidates = candidateTiles({
    liftDays: nextUpFirst(liftDays, nextDay),
    // The core block is the owner's.
    core: owner,
    // Only the skills this person trains; one who just counts sessions gets the log card instead.
    routines: nextUpFirst(routines, nextStretch),
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
  const tileDetail = (t: HomeTile) => {
    if (t.type === 'pin') return cardioSummary({ minutes: t.pin.minutes, distanceMi: t.pin.distanceMi })
    if (t.type === 'cardio' && todaysCardio) return `today: ${todaysCardio.label}`
    if (t.type === 'stretch') {
      // A routine owed by the day says where its week stands.
      const week = dailyStanding(flexEntries, t.routine, todayISO)
      if (week) return `${week.done}/${week.goal} this week`
    }
    return undefined
  }
  const tileNext = (t: HomeTile) =>
    (t.type === 'lift' && t.day === nextDay) ||
    (t.type === 'stretch' && t.routine === nextStretch) ||
    (t.type === 'core' && absRemaining > 0 && !abDays.includes(todayISO))

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

  const calendar = (editing: boolean) => (
    <WeekCalendar
      weekStart={shownWeek}
      onWeekChange={showWeek}
      selected={pickedDate}
      onSelect={setCalendarDate}
      plannedCardio={plannedCardio}
      onAction={runCalendarAction}
      editing={editing}
    />
  )
  const habits = (editing: boolean) => (
    <DailyHabits
      weekStart={habitWeek}
      onShowCurrentWeek={() => showWeek(weekStartISO(today))}
      {...(showCalendar ? { date: pickedDate, onSelectDate: setCalendarDate } : {})}
      editing={editing}
    />
  )
  const tiles = (editing: boolean) => (
    <HomeTiles
      candidates={candidates}
      label={tileLabel}
      detail={tileDetail}
      next={tileNext}
      onOpen={openTile}
      editing={editing}
    />
  )
  const tracked = PILLARS.filter((p) => hasPillar(profile, p))
  const cardio = hasPillar(profile, 'cardio')

  // The photo reminder sits under the start tiles rather than over the page: it's
  // a nudge, and what the page is for comes first. With the tiles taken off the
  // page it goes to the foot instead.
  const photoBanner = photoDue && (
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
  )
  const tilesShown = !layout?.removed.includes('tiles')

  // Every card this person could have on Today, in the order it ships in. The
  // ones marked optional live on Progress and come here only when added.
  const cards: StackCard[] = [
    {
      id: 'week',
      label: 'this week',
      node: <ThisWeek onSelectWeek={showHabitWeek} />,
      editor: <WeekGoalOrder />,
    },
    {
      id: 'calendar',
      label: 'week calendar',
      node: <div ref={calendarRef}>{calendar(false)}</div>,
      editor: schedulablePillars(tracked, plannedCardio).length > 0 ? calendar(true) : undefined,
    },
    ...(hasPillar(profile, 'diet')
      ? [
          {
            id: 'calories',
            label: 'daily calories',
            node: (
              <div ref={habitsRef} className="flex flex-col gap-2">
                {habits(false)}
              </div>
            ),
            editor: habits(true),
          },
        ]
      : []),
    ...(logsStretchOnly(profile)
      ? [
          {
            id: 'stretchLog',
            label: 'stretching',
            node: (
              <StretchLogCard
                entries={flexEntries}
                goal={goals.flex}
                onLog={(date) => void logFlex({ date, note: 'logged' })}
              />
            ),
          },
        ]
      : []),
    ...(weighsIn(profile) || readsBodyFat(profile)
      ? [{ id: 'weight', label: 'body measurement', node: <WeightCard /> }]
      : []),
    {
      id: 'tiles',
      label: 'quick tiles',
      node: (
        <>
          {tiles(false)}
          {photoBanner}
        </>
      ),
      editor: tiles(true),
    },
    ...(strength ? [{ id: 'muscles', label: 'strength', node: <MuscleAvatar />, optional: true }] : []),
    ...(cardio
      ? [
          { id: 'cardioChart', label: 'cardio', node: <CardioChart entries={cardioEntries} />, optional: true },
          { id: 'cardioPlan', label: 'cardio goal', node: <CardioPlanCard />, optional: true },
        ]
      : []),
    { id: 'timeSpent', label: 'time spent', node: <TimeSpent />, optional: true },
  ]

  return (
    // No bottom padding of its own: `main` already pads below the scroll area, and
    // stacking a second 1rem on top of it pushed the home page just past the
    // viewport — enough to make it scroll by a hair with nothing to scroll to.
    <div className="flex flex-col gap-2">
      <BackendBanner />
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

      <EditableStack cards={cards} layout={layout} onLayout={saveLayout} gap="gap-2" />
      {!tilesShown && photoBanner}

      {loggingCardio && (
        <CardioLogSheet
          onSave={(entry) => void logCardio(entry)}
          entries={cardioEntries}
          onDelete={(id) => void deleteCardio(id)}
          onClose={() => setLoggingCardio(false)}
          planned={todaysCardio}
          goalName={cardioPlan ? goalLabel(cardioPlan.kind, cardioPlan.goal) : undefined}
          onGoal={() => setSettingCardioGoal(true)}
        />
      )}
      {/* Over the log sheet rather than in place of it: backing out returns to
          the log, and saving a plan closes both. */}
      {settingCardioGoal && (
        <CardioGoalSheet
          onClose={(saved) => {
            setSettingCardioGoal(false)
            if (saved) setLoggingCardio(false)
          }}
        />
      )}
    </div>
  )
}
