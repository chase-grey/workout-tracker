import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { MdAdd, MdChevronLeft, MdChevronRight, MdPlayArrow, MdViewAgenda, MdViewWeek } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { dayOrder } from '../../config/plan'
import { FLEX_ROUTINES, type FlexRoutineKey } from '../../config/flexRoutines'
import { calorieGoalOn } from '../../lib/calories'
import { parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import { hasPillar, ownerFlavour, PILLARS, type Pillar } from '../../lib/profile'
import { nextStretchRoutine, otherStretchRoutine } from '../../lib/stretchRotation'
import { pillarColours } from '../../lib/theme'
import { useTheme } from '../../lib/themeStore'
import { weeklyGoalsFor } from '../../lib/weeklyStreak'
import {
  pillarMarks,
  shiftWeek,
  togglePin,
  weekCalendar,
  type CalendarAction,
  type CalendarDay,
  type CalendarItem,
  type CalendarStatus,
  type PinnablePillar,
  type PlannedCardio,
  type WeekCalendarView,
} from '../../lib/weekCalendar'

const DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const PIN_VERB: Record<PinnablePillar, string> = { strength: 'lift', flexibility: 'stretch' }

type Props = {
  /** The Monday shown. */
  weekStart: string
  onWeekChange: (monday: string) => void
  /** The day picked — the one the calorie card below logs to. */
  selected: string
  onSelect: (date: string) => void
  plannedCardio: PlannedCardio[]
  onAction: (action: CalendarAction) => void
}

/** A pillar's mark: filled for done, a ring for planned, a faint ring for a missed calorie day. */
function Mark({ colour, status, size = 8 }: { colour: string; status: CalendarStatus | null; size?: number }) {
  const style: CSSProperties = { width: size, height: size }
  if (status === 'done') style.background = colour
  else if (status) {
    style.boxShadow = `inset 0 0 0 1.5px ${colour}`
    if (status === 'missed') style.opacity = 0.35
  }
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={style} />
}

function weekTitle(weekStart: string, today: string): string {
  const current = weekStartISO(today)
  if (weekStart === current) return 'this week'
  if (weekStart === shiftWeek(current, 1)) return 'next week'
  if (weekStart === shiftWeek(current, -1)) return 'last week'
  return `week of ${parseISODate(weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toLowerCase()}`
}

/**
 * Today's week, a day at a time: what each pillar did and what's still ahead
 * (see lib/weekCalendar). Two forms, swapped from the card's own header — a row
 * per day naming everything, or one strip of coloured marks.
 */
export function WeekCalendar({ weekStart, onWeekChange, selected, onSelect, plannedCardio, onAction }: Props) {
  const { workouts, plan, flexEntries, cardioEntries, calorieEntries, settings, updateSettings } = useData()
  const colours = pillarColours(useTheme())
  const profile = settings.profile
  const view: WeekCalendarView = settings.weekCalendarView ?? 'full'
  const [open, setOpen] = useState<string | null>(null)

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  const today = toISODate(now)

  const pillars = useMemo(() => PILLARS.filter((p) => hasPillar(profile, p)), [profile])
  const days = useMemo(() => {
    // The same "up next" Today's buttons show: the owner's focus is head to
    // toe; anyone else's two routines take turns.
    const next: FlexRoutineKey = ownerFlavour(profile) ? 'head_to_toe' : nextStretchRoutine(flexEntries)
    const liftDays = dayOrder(plan).filter((t) => plan[t].exercises.length > 0)
    return weekCalendar({
      weekStart,
      today,
      pillars,
      goalsFor: weeklyGoalsFor,
      workouts,
      liftDays,
      liftLabels: { push: plan.push.label, pull: plan.pull.label, fullbody: plan.fullbody.label },
      flexEntries,
      stretchRotation: ownerFlavour(profile) ? [next] : [next, otherStretchRoutine(next)],
      stretchLabels: { side_split: FLEX_ROUTINES.side_split.label, head_to_toe: FLEX_ROUTINES.head_to_toe.label },
      cardioEntries,
      plannedCardio,
      calorieEntries,
      calorieGoalOn,
      dietDirection: profile?.dietDirection ?? 'gain',
      pins: settings.calendarPins,
    })
  }, [weekStart, today, pillars, workouts, plan, flexEntries, cardioEntries, plannedCardio, calorieEntries, profile, settings.calendarPins])

  const furthest = shiftWeek(today, 1)
  const setView = (v: WeekCalendarView) => updateSettings({ ...settings, weekCalendarView: v })
  const pinnable = (['strength', 'flexibility'] as const).filter((p) => pillars.includes(p))
  const pick = (date: string) => {
    onSelect(date)
    setOpen((o) => (o === date && date === selected ? null : date))
  }

  const iconButton = 'flex h-9 w-9 items-center justify-center rounded-lg text-xl active:opacity-60 disabled:opacity-30'

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="mb-1 flex items-center justify-between gap-1">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500">{weekTitle(weekStart, today)}</h2>
        <div className="-mr-1 flex items-center">
          <button
            onClick={() => onWeekChange(shiftWeek(weekStart, -1))}
            aria-label="previous week"
            className={`${iconButton} text-neutral-400`}
          >
            <MdChevronLeft aria-hidden />
          </button>
          <button
            onClick={() => onWeekChange(shiftWeek(weekStart, 1))}
            disabled={weekStart >= furthest}
            aria-label="next week"
            className={`${iconButton} text-neutral-400`}
          >
            <MdChevronRight aria-hidden />
          </button>
          <div className="ml-1 flex rounded-lg bg-surface-2 p-0.5">
            {(
              [
                ['full', MdViewAgenda, 'full calendar'],
                ['simple', MdViewWeek, 'simple calendar'],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-label={label}
                aria-pressed={view === v}
                className={`flex h-8 w-8 items-center justify-center rounded-md text-base ${
                  view === v ? 'bg-accent text-on-accent' : 'text-neutral-400'
                }`}
              >
                <Icon aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'simple' ? (
        <SimpleStrip days={days} pillars={pillars} colours={colours} selected={selected} onSelect={onSelect} />
      ) : (
        <ul className="flex flex-col">
          {days.map((day) => (
            <li key={day.date}>
              <DayRow
                day={day}
                colours={colours}
                selected={day.date === selected}
                expanded={open === day.date}
                onTap={() => pick(day.date)}
              />
              {open === day.date && (
                <DayDetail
                  day={day}
                  colours={colours}
                  pinnable={pinnable}
                  pinned={(p) => settings.calendarPins?.[p]?.includes(day.weekday) ?? false}
                  onPin={(p) =>
                    updateSettings({ ...settings, calendarPins: togglePin(settings.calendarPins, p, day.weekday) })
                  }
                  onAction={onAction}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function itemText(i: CalendarItem): string {
  return i.amount ? `${i.label} ${i.amount}` : i.label
}

function DayRow({
  day,
  colours,
  selected,
  expanded,
  onTap,
}: {
  day: CalendarDay
  colours: Record<Pillar, string>
  selected: boolean
  expanded: boolean
  onTap: () => void
}) {
  const sessions = day.items.filter((i) => i.pillar !== 'diet')
  const diet = day.items.find((i) => i.pillar === 'diet')
  const isToday = day.when === 'today'
  return (
    <button
      onClick={onTap}
      aria-expanded={expanded}
      className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 py-1 text-left ${
        isToday ? 'bg-surface-2' : ''
      } ${selected ? 'ring-1 ring-accent' : ''}`}
    >
      <span className={`flex w-12 shrink-0 items-baseline gap-1 text-xs ${isToday ? 'text-accent' : 'text-neutral-500'}`}>
        <span className="font-semibold">{DOW[day.weekday]}</span>
        <span className="tabular-nums">{parseISODate(day.date).getDate()}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
        {sessions.length === 0 ? (
          <span className="text-neutral-600">rest</span>
        ) : (
          sessions.map((i, n) => (
            <span
              key={n}
              className={`flex items-center gap-1.5 ${i.status === 'done' ? 'text-neutral-100' : 'text-neutral-400'}`}
            >
              <Mark colour={colours[i.pillar]} status={i.status} />
              {itemText(i)}
            </span>
          ))
        )}
      </span>
      {diet && (
        <span
          className={`flex shrink-0 items-center gap-1 text-xs tabular-nums ${
            diet.status === 'done' ? 'text-neutral-200' : 'text-neutral-500'
          }`}
        >
          <Mark colour={colours.diet} status={diet.status} size={6} />
          {diet.amount}
        </span>
      )}
    </button>
  )
}

function DayDetail({
  day,
  colours,
  pinnable,
  pinned,
  onPin,
  onAction,
}: {
  day: CalendarDay
  colours: Record<Pillar, string>
  pinnable: PinnablePillar[]
  pinned: (p: PinnablePillar) => boolean
  onPin: (p: PinnablePillar) => void
  onAction: (a: CalendarAction) => void
}) {
  const startable = day.items.filter((i) => i.action)
  return (
    <div className="flex flex-col gap-1.5 px-2 pb-2 pt-1.5">
      {startable.map((i, n) => (
        <button
          key={n}
          onClick={() => i.action && onAction(i.action)}
          className="flex min-h-[44px] items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-semibold active:opacity-80"
        >
          <Mark colour={colours[i.pillar]} status="planned" />
          <span className="flex-1 text-left">{itemText(i)}</span>
          {i.action?.type === 'cardio' ? <MdAdd aria-hidden /> : <MdPlayArrow aria-hidden />}
        </button>
      ))}
      {pinnable.length > 0 && (
        <div className="flex gap-1.5">
          {pinnable.map((p) => (
            <button
              key={p}
              onClick={() => onPin(p)}
              aria-pressed={pinned(p)}
              className={`min-h-[36px] flex-1 rounded-lg px-2 text-xs font-medium ${
                pinned(p) ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-400'
              }`}
            >
              {PIN_VERB[p]} every {DOW[day.weekday]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The week as one strip: a letter per day and, under it, a mark per pillar in
 * a fixed order, so reading along a row of marks is reading one pillar's week.
 */
function SimpleStrip({
  days,
  pillars,
  colours,
  selected,
  onSelect,
}: {
  days: CalendarDay[]
  pillars: Pillar[]
  colours: Record<Pillar, string>
  selected: string
  onSelect: (date: string) => void
}) {
  return (
    <div className="flex gap-1">
      {days.map((day) => {
        const marks = pillarMarks(day, pillars)
        const label = [
          DOW[day.weekday],
          ...day.items.map((i) => `${i.label} ${i.status}`),
        ].join(', ')
        return (
          <button
            key={day.date}
            onClick={() => onSelect(day.date)}
            aria-label={label}
            aria-pressed={day.date === selected}
            className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 ${
              day.date === selected ? 'bg-surface-2 ring-1 ring-accent' : ''
            }`}
          >
            <span className={`text-[10px] leading-none ${day.when === 'today' ? 'text-accent' : 'text-neutral-500'}`}>
              {DOW[day.weekday][0]}
            </span>
            <span className="flex flex-col items-center gap-1">
              {pillars.map((p) => (
                <Mark key={p} colour={colours[p]} status={marks[p]} size={7} />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
