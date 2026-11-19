import { useMemo, useState } from 'react'
import { MdChevronLeft, MdChevronRight, MdEditCalendar, MdExpandLess, MdExpandMore } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { parseISODate, weekStartISO } from '../../lib/dates'
import type { Pillar } from '../../lib/profile'
import {
  PINNABLE,
  WEEKDAY_SHORT as DOW,
  hasSchedule,
  pillarMarks,
  shiftWeek,
  weekCalendar,
  type CalendarAction,
  type CalendarDay,
  type CalendarItem,
  type PinnablePillar,
  type PlannedCardio,
} from '../../lib/weekCalendar'
import { CalendarItemSheet } from './CalendarItemSheet'
import { PillarMark } from './PillarMark'
import { ScheduleSheet } from './ScheduleSheet'
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
}

/** A session on the calendar: every item but the day's calorie target. */
type Session = CalendarItem & { pillar: PinnablePillar }

const isSession = (i: CalendarItem): i is Session => i.pillar !== 'diet'

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
 * some are chosen from the header (ScheduleSheet), or a cardio plan sets them.
 *
 * It opens small — one strip of marks, a shape to each pillar (PillarMark),
 * and under it the sessions of the day picked — because most looks at it are
 * "what's today". The chevron
 * opens the whole week at a row per day, and `keep open` there makes that the
 * way it opens from then on. Either way a session is a button that shows what
 * it holds (CalendarItemSheet) rather than one that starts it, and which days
 * the sessions fall on is set from the header (ScheduleSheet).
 *
 * The calorie figures stay off it: the calorie card below logs to the day
 * picked here and says them once. A day's target shows only as its mark.
 */
export function WeekCalendar({ weekStart, onWeekChange, selected, onSelect, plannedCardio, onAction }: Props) {
  const { settings, updateSettings } = useData()
  const kept = settings.weekCalendarView === 'full'
  const [expanded, setExpanded] = useState(kept)
  const [detail, setDetail] = useState<{ day: CalendarDay; item: Session } | null>(null)
  const [scheduling, setScheduling] = useState(false)

  const input = useCalendarInput()
  const { today, pillars } = input
  const days = useMemo(() => weekCalendar({ ...input, weekStart, plannedCardio }), [input, weekStart, plannedCardio])

  const furthest = shiftWeek(today, 1)
  const title = weekTitle(weekStart, today)
  // A week the cardio plan lays out takes its days from the plan, not from here.
  const schedulable = PINNABLE.filter((p) => pillars.includes(p) && !(p === 'cardio' && plannedCardio.length > 0))
  const open = (day: CalendarDay, item: Session) => setDetail({ day, item })
  const picked = days.find((d) => d.date === selected)
  // "rest" is a word for a day off from a plan. With no days chosen and no
  // cardio plan there is no plan to be off from, and an empty day is just empty.
  const planned = plannedCardio.length > 0 || hasSchedule(settings.calendarPins, settings.calendarWeeks, weekStart)

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
          {picked && (planned || picked.items.some(isSession)) && (
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
      {scheduling && (
        <ScheduleSheet
          weekStart={weekStart}
          weekLabel={title}
          today={today}
          days={days}
          pillars={schedulable}
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
 * filled, thumb-sized form the small calendar shows for the one day picked,
 * where a stretch is its mark with no name beside it; a row of the open week
 * sets them as plain text.
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
  const sessions = day.items.filter(isSession)
  if (sessions.length === 0 && !rest) return null
  if (sessions.length === 0) return <span className={`text-sm text-neutral-600 ${chip ? 'px-1' : ''}`}>rest</span>
  return (
    <>
      {sessions.map((i, n) => {
        // Under the strip a stretch is its mark alone: the routine's name is
        // in the sheet the chip opens, and in the open week's row.
        const markOnly = chip && i.pillar === 'flexibility'
        return (
          <button
            key={n}
            onClick={(e) => {
              e.stopPropagation()
              onOpen(i)
            }}
            aria-label={markOnly ? itemText(i) : undefined}
            className={`flex items-center gap-1.5 text-left text-sm active:opacity-70 ${
              chip ? 'min-h-[36px] rounded-lg bg-surface-2 px-2.5' : 'min-h-[32px]'
            } ${markOnly ? 'min-w-[36px] justify-center' : ''} ${
              i.status === 'done' ? 'text-neutral-100' : 'text-neutral-400'
            }`}
          >
            <PillarMark pillar={i.pillar} status={i.status} size={chip ? 16 : 14} />
            {!markOnly && itemText(i)}
          </button>
        )
      })}
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
                <PillarMark key={p} pillar={p} status={marks[p]} size={13} />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}
