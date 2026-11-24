import { useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight, MdExpandLess, MdExpandMore } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { parseISODate, weekStartISO } from '../../lib/dates'
import type { Pillar } from '../../lib/profile'
import {
  WEEKDAY_SHORT as DOW,
  hasSchedule,
  pillarMarks,
  schedulablePillars,
  shiftWeek,
  stretchesDone,
  weekCalendar,
  type CalendarAction,
  type CalendarDay,
  type CalendarItem,
  type PinnablePillar,
  type PlannedCardio,
} from '../../lib/weekCalendar'
import { CalendarItemSheet } from './CalendarItemSheet'
import { PillarMark } from './PillarMark'
import { ScheduleEditor } from './ScheduleEditor'
import { useCalendarInput } from './useCalendarInput'

type Props = {
  /** The Monday shown. */
  weekStart: string
  onWeekChange: (monday: string) => void
  /** The day picked — the one the calorie card below logs to. */
  selected: string
  onSelect: (date: string) => void
  plannedCardio: PlannedCardio[]
  onAction: (action: CalendarAction) => void
  /**
   * The page is being edited and this card is open (see
   * components/EditableStack): the week's header over the days each kind of
   * session falls on, in place of the week itself.
   */
  editing?: boolean
}

/** A session on the calendar: every item but the day's calorie target. */
type Session = CalendarItem & { pillar: PinnablePillar }

const isSession = (i: CalendarItem): i is Session => i.pillar !== 'diet'

/**
 * Whether a session earns a chip under the small calendar's strip. A lift and
 * a stretch don't: the dumbbell and the seated figure in the day's column are
 * the whole of what the small view says about them, and which day or routine
 * it was belongs to the open week. Cardio's kind and amount are not in its mark.
 */
const saysMoreThanItsMark = (i: Session) => i.pillar === 'cardio'

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
 * Left alone it is a record of what was done; days ahead appear only once
 * some are chosen by holding the calendar (ScheduleEditor), or a cardio plan
 * sets them.
 *
 * It opens small — one strip of marks, a shape to each pillar (PillarMark),
 * and under it only what a mark can't say of the day picked, a cardio
 * session's kind and amount — because most looks at it are "what's today".
 * The chevron
 * opens the whole week at a row per day, and `keep open` there makes that the
 * way it opens from then on. Either way a session is a button that shows what
 * it holds (CalendarItemSheet) rather than one that starts it, and which days
 * the sessions fall on is set by holding the card (ScheduleEditor).
 *
 * The calorie figures stay off it: the calorie card below logs to the day
 * picked here and says them once. A day's target shows only as its mark.
 */
export function WeekCalendar({ weekStart, onWeekChange, selected, onSelect, plannedCardio, onAction, editing }: Props) {
  const { settings, updateSettings } = useData()
  const kept = settings.weekCalendarView === 'full'
  const [expanded, setExpanded] = useState(kept)
  const [detail, setDetail] = useState<{ day: CalendarDay; item: Session } | null>(null)

  const input = useCalendarInput()
  const { today, pillars } = input
  const days = useMemo(() => weekCalendar({ ...input, weekStart, plannedCardio }), [input, weekStart, plannedCardio])

  const furthest = shiftWeek(today, 1)
  const title = weekTitle(weekStart, today)
  // The card above is already headed "this week". This one is named for what it
  // is, and says which week only once it has been paged off the current one.
  const heading = weekStart === weekStartISO(today) ? 'calendar' : title
  const schedulable = schedulablePillars(pillars, plannedCardio)
  const open = (day: CalendarDay, item: Session) => setDetail({ day, item })
  const picked = days.find((d) => d.date === selected)
  // "rest" is a word for a day off from a plan. With no days chosen and no
  // cardio plan there is no plan to be off from, and an empty day is just empty.
  const planned = plannedCardio.length > 0 || hasSchedule(settings.calendarPins, settings.calendarWeeks, weekStart)
  // Under the strip a lift or a stretch says nothing its mark in the strip
  // hasn't: the line is for a cardio session, which has a kind and an amount,
  // and for "rest" on a planned day.
  const under = picked?.items.filter(isSession) ?? []
  const underLine = under.length === 0 ? planned : under.some(saysMoreThanItsMark)

  const iconButton =
    'flex h-9 w-9 items-center justify-center rounded-lg text-xl text-neutral-400 active:opacity-60 disabled:opacity-30'

  return (
    <div className={editing ? '' : 'rounded-2xl bg-surface p-3'}>
      <div className="mb-1 flex items-center justify-between gap-1">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500">{heading}</h2>
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
          {!editing && (
            <button
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? 'show less' : 'show the whole week'}
              aria-expanded={expanded}
              className={iconButton}
            >
              {expanded ? <MdExpandLess aria-hidden /> : <MdExpandMore aria-hidden />}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <ScheduleEditor weekStart={weekStart} weekLabel={title} today={today} days={days} pillars={schedulable} />
      ) : expanded ? (
        <>
          <ul className="flex flex-col">
            {days.map((day) => (
              <li key={day.date}>
                <DayRow
                  day={day}
                  selected={day.date === selected}
                  onSelect={() => onSelect(day.date)}
                  onOpen={(item) => open(day, item)}
                  rest={planned}
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
          <SimpleStrip days={days} pillars={pillars} selected={selected} onSelect={onSelect} />
          {picked && underLine && (
            <div className="mt-2 flex min-h-[36px] flex-wrap items-center gap-1.5">
              <Sessions day={picked} onOpen={(item) => open(picked, item)} rest={planned} chip />
            </div>
          )}
        </>
      )}

      {detail && (
        <CalendarItemSheet
          day={detail.day}
          item={detail.item}
          onAction={onAction}
          onClose={() => setDetail(null)}
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
 * filled, thumb-sized form the small calendar shows for the one day picked,
 * and leaves a lift and a stretch to their marks in the strip above; a row of
 * the open week sets them all as plain text.
 */
function Sessions({
  day,
  onOpen,
  rest,
  chip,
}: {
  day: CalendarDay
  onOpen: (item: Session) => void
  /** Whether an empty day says so. */
  rest: boolean
  chip?: boolean
}) {
  const all = day.items.filter(isSession)
  if (all.length === 0 && !rest) return null
  if (all.length === 0) return <span className={`text-sm text-neutral-600 ${chip ? 'px-1' : ''}`}>rest</span>
  return (
    <>
      {(chip ? all.filter(saysMoreThanItsMark) : all).map((i, n) => (
        <button
          key={n}
          onClick={(e) => {
            e.stopPropagation()
            onOpen(i)
          }}
          className={`flex items-center gap-1.5 text-left text-sm active:opacity-70 ${
            chip ? 'min-h-[36px] rounded-lg bg-surface-2 px-2.5' : 'min-h-[32px]'
          } ${
            i.status === 'done' ? 'text-neutral-100' : 'text-neutral-400'
          }`}
        >
          <PillarMark pillar={i.pillar} status={i.status} size={chip ? 16 : 14} />
          {itemText(i)}
        </button>
      ))}
    </>
  )
}

function DayRow({
  day,
  selected,
  onSelect,
  onOpen,
  rest,
}: {
  day: CalendarDay
  selected: boolean
  onSelect: () => void
  onOpen: (item: Session) => void
  rest: boolean
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
        <Sessions day={day} onOpen={onOpen} rest={rest} />
      </span>
      {diet && <PillarMark pillar="diet" status={diet.status} size={14} />}
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
  selected,
  onSelect,
}: {
  days: CalendarDay[]
  pillars: Pillar[]
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
                <PillarMark
                  key={p}
                  pillar={p}
                  status={marks[p]}
                  size={13}
                  count={p === 'flexibility' ? stretchesDone(day) : undefined}
                />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
