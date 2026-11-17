import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { MdChevronLeft, MdChevronRight, MdEditCalendar, MdExpandLess, MdExpandMore } from 'react-icons/md'
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
  PINNABLE,
  WEEKDAY_SHORT as DOW,
  pillarMarks,
  shiftWeek,
  weekCalendar,
  type CalendarAction,
  type CalendarDay,
  type CalendarItem,
  type CalendarStatus,
  type PlannedCardio,
} from '../../lib/weekCalendar'
import { CalendarItemSheet } from './CalendarItemSheet'
import { ScheduleSheet } from './ScheduleSheet'

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
 * (see lib/weekCalendar).
 *
 * It opens small — one strip of coloured marks, and under it the sessions of
 * the day picked — because most looks at it are "what's today". The chevron
 * opens the whole week at a row per day, and `keep open` there makes that the
 * way it opens from then on. Either way a session is a button that shows what
 * it holds (CalendarItemSheet) rather than one that starts it, and which days
 * the sessions fall on is set from the header (ScheduleSheet).
 *
 * The calorie figures stay off it: the calorie card below logs to the day
 * picked here and says them once. A day's target shows only as its mark.
 */
export function WeekCalendar({ weekStart, onWeekChange, selected, onSelect, plannedCardio, onAction }: Props) {
  const { workouts, plan, flexEntries, cardioEntries, calorieEntries, settings, updateSettings } = useData()
  const colours = pillarColours(useTheme())
  const profile = settings.profile
  const kept = settings.weekCalendarView === 'full'
  const [expanded, setExpanded] = useState(kept)
  const [detail, setDetail] = useState<{ day: CalendarDay; item: CalendarItem } | null>(null)
  const [scheduling, setScheduling] = useState(false)

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
      weekPins: settings.calendarWeeks,
    })
  }, [
    weekStart,
    today,
    pillars,
    workouts,
    plan,
    flexEntries,
    cardioEntries,
    plannedCardio,
    calorieEntries,
    profile,
    settings.calendarPins,
    settings.calendarWeeks,
  ])

  const furthest = shiftWeek(today, 1)
  const title = weekTitle(weekStart, today)
  // A week the cardio plan lays out takes its days from the plan, not from here.
  const schedulable = PINNABLE.filter((p) => pillars.includes(p) && !(p === 'cardio' && plannedCardio.length > 0))
  const open = (day: CalendarDay, item: CalendarItem) => setDetail({ day, item })
  const picked = days.find((d) => d.date === selected)

  const iconButton =
    'flex h-9 w-9 items-center justify-center rounded-lg text-xl text-neutral-400 active:opacity-60 disabled:opacity-30'

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="mb-1 flex items-center justify-between gap-1">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500">{title}</h2>
        <div className="-mr-1 flex items-center">
          <button onClick={() => onWeekChange(shiftWeek(weekStart, -1))} aria-label="previous week" className={iconButton}>
            <MdChevronLeft aria-hidden />
          </button>
          <button
            onClick={() => onWeekChange(shiftWeek(weekStart, 1))}
            disabled={weekStart >= furthest}
            aria-label="next week"
            className={iconButton}
          >
            <MdChevronRight aria-hidden />
          </button>
          {schedulable.length > 0 && (
            <button onClick={() => setScheduling(true)} aria-label="schedule" className={iconButton}>
              <MdEditCalendar aria-hidden />
            </button>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'show less' : 'show the whole week'}
            aria-expanded={expanded}
            className={iconButton}
          >
            {expanded ? <MdExpandLess aria-hidden /> : <MdExpandMore aria-hidden />}
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          <ul className="flex flex-col">
            {days.map((day) => (
              <li key={day.date}>
                <DayRow
                  day={day}
                  colours={colours}
                  selected={day.date === selected}
                  onSelect={() => onSelect(day.date)}
                  onOpen={(item) => open(day, item)}
                />
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              onClick={() => updateSettings({ ...settings, weekCalendarView: kept ? 'simple' : 'full' })}
              aria-pressed={kept}
              className={`min-h-[36px] rounded-lg px-2 text-xs font-medium ${kept ? 'text-accent' : 'text-neutral-500'}`}
            >
              keep open
            </button>
          </div>
        </>
      ) : (
        <>
          <SimpleStrip days={days} pillars={pillars} colours={colours} selected={selected} onSelect={onSelect} />
          {picked && (
            <div className="mt-2 flex min-h-[36px] flex-wrap items-center gap-1.5">
              <Sessions day={picked} colours={colours} onOpen={(item) => open(picked, item)} chip />
            </div>
          )}
        </>
      )}

      {detail && (
        <CalendarItemSheet
          day={detail.day}
          item={detail.item}
          colour={colours[detail.item.pillar]}
          onAction={onAction}
          onClose={() => setDetail(null)}
        />
      )}
      {scheduling && (
        <ScheduleSheet
          weekStart={weekStart}
          weekLabel={title}
          today={today}
          days={days}
          pillars={schedulable}
          colours={colours}
          onClose={() => setScheduling(false)}
        />
      )}
    </div>
  )
}

function itemText(i: CalendarItem): string {
  return i.amount ? `${i.label} ${i.amount}` : i.label
}

/**
 * A day's sessions, each a button onto its details. `chip` gives them the
 * filled, thumb-sized form the small calendar shows for the one day picked;
 * a row of the open week sets them as plain text.
 */
function Sessions({
  day,
  colours,
  onOpen,
  chip,
}: {
  day: CalendarDay
  colours: Record<Pillar, string>
  onOpen: (item: CalendarItem) => void
  chip?: boolean
}) {
  const sessions = day.items.filter((i) => i.pillar !== 'diet')
  if (sessions.length === 0) return <span className={`text-sm text-neutral-600 ${chip ? 'px-1' : ''}`}>rest</span>
  return (
    <>
      {sessions.map((i, n) => (
        <button
          key={n}
          onClick={(e) => {
            e.stopPropagation()
            onOpen(i)
          }}
          className={`flex items-center gap-1.5 text-left text-sm active:opacity-70 ${
            chip ? 'min-h-[36px] rounded-lg bg-surface-2 px-2.5' : 'min-h-[32px]'
          } ${i.status === 'done' ? 'text-neutral-100' : 'text-neutral-400'}`}
        >
          <Mark colour={colours[i.pillar]} status={i.status} />
          {itemText(i)}
        </button>
      ))}
    </>
  )
}

function DayRow({
  day,
  colours,
  selected,
  onSelect,
  onOpen,
}: {
  day: CalendarDay
  colours: Record<Pillar, string>
  selected: boolean
  onSelect: () => void
  onOpen: (item: CalendarItem) => void
}) {
  const diet = day.items.find((i) => i.pillar === 'diet')
  const isToday = day.when === 'today'
  return (
    // The row picks the day; a session inside it opens that session instead.
    <div
      onClick={onSelect}
      className={`flex min-h-[40px] w-full items-center gap-2 rounded-lg px-2 ${isToday ? 'bg-surface-2' : ''} ${
        selected ? 'ring-1 ring-accent' : ''
      } ${day.when === 'past' && !selected ? 'opacity-60' : ''}`}
    >
      <button
        aria-pressed={selected}
        className={`flex min-h-[40px] w-12 shrink-0 items-center gap-1 text-xs ${
          isToday ? 'text-accent' : 'text-neutral-500'
        }`}
      >
        <span className="font-semibold">{DOW[day.weekday]}</span>
        <span className="tabular-nums">{parseISODate(day.date).getDate()}</span>
      </button>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
        <Sessions day={day} colours={colours} onOpen={onOpen} />
      </span>
      {diet && <Mark colour={colours.diet} status={diet.status} size={6} />}
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
        const label = [DOW[day.weekday], ...day.items.map((i) => `${i.label} ${i.status}`)].join(', ')
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
