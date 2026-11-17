import { useEffect, useState } from 'react'
import { MdClose, MdDragIndicator, MdKeyboardArrowDown } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import {
  dayOrder,
  repRangeLabel,
  type DayPlan,
  type Plan,
  type PlannedExercise,
} from '../../config/plan'
import { applyPlanEdits, type PlanEdit } from '../../lib/planTools'
import { circuitRounds, circuitTitle, dayEntries, membersLine, moveEntry, roundsLabel } from '../../lib/circuitEntry'
import { useDragSort, type Sortable } from '../../lib/useDragSort'
import type { DayType } from '../../types'

const FIELD =
  'min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const ICON_BUTTON =
  'flex h-[44px] w-10 shrink-0 items-center justify-center text-neutral-400 active:text-neutral-100'
const REMOVE_BUTTON =
  'flex h-[44px] w-10 shrink-0 items-center justify-center pr-1 text-neutral-400 active:text-red-400'
/** What a row picked up off the list looks like while it's being carried. */
const LIFTED = 'shadow-lg shadow-black/50'

/**
 * A labelled text input that reports every keystroke.
 *
 * The typed text is held locally so the box can be emptied on the way to a new
 * name even though a blank one is never committed — a plain controlled input on
 * the plan would refuse the backspace and leave the old name sitting there.
 */
function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])

  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(e.target.value)
        }}
        onBlur={() => setText(value)}
        className={FIELD}
      />
    </label>
  )
}

/**
 * A labelled number input.
 *
 * The typed text is held locally so a half-finished number — an empty box on the
 * way to a new value, the "." in "2.5" before its 5 — can sit on screen without
 * the plan taking it, and without being rewritten under the cursor by what the
 * plan currently holds. Only a valid number is reported up; leaving the field puts
 * the plan's own value back.
 *
 * A text box rather than input[type=number]: the browser blanks a number input
 * whose value isn't yet a complete number, which is exactly the "2." the decimal
 * fields have to pass through. inputMode still brings up the numeric keypad.
 */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number) => void
}) {
  const shown = value == null ? '' : String(value)
  const [text, setText] = useState(shown)
  // Adopt the plan's value unless what's typed already means it ("2." for 2).
  useEffect(() => {
    setText((t) => (t.trim() !== '' && Number(t) === value ? t : shown))
  }, [shown, value])

  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() && Number.isFinite(n) && n >= 0) onChange(n)
        }}
        onBlur={() => setText(shown)}
        className={FIELD}
      />
    </label>
  )
}

/**
 * The grip a row is dragged by.
 *
 * A handle rather than the whole row: the row's own surface is the button that
 * opens it, and a list whose every row is draggable from anywhere is a list you
 * can't scroll past.
 */
function DragHandle({ sort, id, label }: { sort: Sortable; id: string; label: string }) {
  return (
    <button {...sort.handle(id)} aria-label={`reorder ${label}`} className={ICON_BUTTON}>
      <MdDragIndicator aria-hidden />
    </button>
  )
}

type ExerciseFields = Extract<PlanEdit, { op: 'setExercise' }>['fields']

/**
 * One exercise: its summary line, the grip that moves it, and its open fields.
 *
 * A station inside an open circuit is the same row without the grip or the ✕:
 * the circuit moves and goes as one (see CircuitRow).
 */
function ExerciseRow({
  exercise,
  sort,
  open,
  onToggle,
  onEdit,
  onRemove,
}: {
  exercise: PlannedExercise
  sort?: Sortable
  open: boolean
  onToggle: () => void
  onEdit: (fields: ExerciseFields) => void
  onRemove?: () => void
}) {
  return (
    <div
      {...sort?.row(exercise.key)}
      className={`rounded-xl ${sort ? 'bg-surface-2' : 'bg-surface'} ${sort?.draggingId === exercise.key ? LIFTED : ''}`}
    >
      <div className="flex items-center">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-3 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-sm">{exercise.name}</span>
          <span className="shrink-0 text-xs text-neutral-500">
            {exercise.sets}×{repRangeLabel(exercise)}
          </span>
        </button>
        {sort && <DragHandle sort={sort} id={exercise.key} label={exercise.name} />}
        {/* One tap, no confirmation: nothing is on the plan until save, and
            discard puts back everything this session removed. */}
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label={`remove ${exercise.name}`}
            className={REMOVE_BUTTON}
          >
            <MdClose aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <TextField label="name" value={exercise.name} onChange={(name) => onEdit({ name })} />
          <TextField label="group" value={exercise.group} onChange={(group) => onEdit({ group })} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="sets" value={exercise.sets} onChange={(sets) => onEdit({ sets })} />
            <NumberField
              label="rest (s)"
              value={exercise.restSec}
              onChange={(restSec) => onEdit({ restSec })}
            />
            <NumberField
              label="min reps"
              value={exercise.repMin}
              onChange={(repMin) => onEdit({ repMin })}
            />
            <NumberField
              label="max reps"
              value={exercise.repMax}
              onChange={(repMax) => onEdit({ repMax })}
            />
            <NumberField
              label="weight step (lbs)"
              value={exercise.increment}
              onChange={(increment) => onEdit({ increment })}
            />
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={exercise.bodyweight === true}
              onChange={(e) => onEdit({ bodyweight: e.target.checked })}
              className="h-5 w-5 accent-accent"
            />
            bodyweight
          </label>
        </div>
      )}
    </div>
  )
}

/**
 * A whole circuit as one row: its name, how many rounds it runs and what's in
 * it, one grip that moves it and one ✕ that drops it (see lib/circuitEntry).
 *
 * Open, it sets the rounds for every station at once — a round is a set at each
 * of them — and lists the stations, each of which opens to its own fields the
 * way an exercise row does. The stations don't move or go on their own here: a
 * circuit with a station dragged out of it is two circuits.
 */
function CircuitRow({
  id,
  stations,
  sort,
  open,
  onToggle,
  onEditStation,
  onRemove,
}: {
  id: string
  stations: PlannedExercise[]
  sort: Sortable
  open: boolean
  onToggle: () => void
  onEditStation: (key: string, fields: ExerciseFields) => void
  onRemove: () => void
}) {
  const [openStation, setOpenStation] = useState<string | null>(null)
  const title = circuitTitle(stations)
  const rounds = circuitRounds(stations.map((e) => e.sets))
  return (
    <div {...sort.row(id)} className={`rounded-xl bg-surface-2 ${sort.draggingId === id ? LIFTED : ''}`}>
      <div className="flex items-center">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center px-3 py-1 text-left"
        >
          <span className="flex w-full items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
            <span className="shrink-0 text-xs text-neutral-500">{roundsLabel(rounds)}</span>
          </span>
          <span className="w-full truncate text-xs text-neutral-500">{membersLine(stations)}</span>
        </button>
        <DragHandle sort={sort} id={id} label={title} />
        <button onClick={onRemove} aria-label={`remove ${title}`} className={REMOVE_BUTTON}>
          <MdClose aria-hidden />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <NumberField
            label="rounds"
            value={rounds}
            onChange={(sets) => {
              for (const e of stations) onEditStation(e.key, { sets })
            }}
          />
          {stations.map((exercise) => (
            <ExerciseRow
              key={exercise.key}
              exercise={exercise}
              open={openStation === exercise.key}
              onToggle={() => setOpenStation(openStation === exercise.key ? null : exercise.key)}
              onEdit={(fields) => onEditStation(exercise.key, fields)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One day: its summary line, the grip that moves it up and down the week, and —
 * once open — its name and the exercises it's made of.
 *
 * A component of its own rather than a function called during the editor's render,
 * because each day's exercises are their own sortable list and so need their own
 * {@link useDragSort}.
 */
function DayRow({
  day,
  dayPlan,
  sort,
  open,
  onToggle,
  openExercise,
  onOpenExercise,
  onEdit,
  onAdd,
}: {
  day: DayType
  dayPlan: DayPlan
  sort: Sortable
  open: boolean
  onToggle: () => void
  /** The expanded exercise, as `day:key`, shared across every day. */
  openExercise: string | null
  onOpenExercise: (id: string | null) => void
  onEdit: (...edits: PlanEdit[]) => void
  onAdd: () => void
}) {
  const exercises = dayPlan.exercises
  // A circuit is one row, so the drag reorders rows and the day is written back
  // in the order they land in.
  const entries = dayEntries(exercises)
  const exerciseSort = useDragSort(
    entries.map((e) => e.id),
    (from, to) => onEdit({ op: 'reorderDay', day, keys: moveEntry(exercises, from, to).map((e) => e.key) }),
  )

  return (
    <div
      {...sort.row(day)}
      className={`rounded-xl bg-surface ${sort.draggingId === day ? LIFTED : ''}`}
    >
      <div className="flex items-center">
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-3 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{dayPlan.label}</span>
          <span className="shrink-0 text-xs text-neutral-500">{entries.length} exercises</span>
          <MdKeyboardArrowDown className={`text-lg ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <div className="pr-1">
          <DragHandle sort={sort} id={day} label={dayPlan.label} />
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <TextField
            label="day name"
            value={dayPlan.label}
            // A blank box is a name being retyped, not a day called nothing.
            onChange={(label) => label.trim() && onEdit({ op: 'setDayLabel', day, label })}
          />
          {entries.map((entry) => {
            if (entry.kind === 'circuit') {
              const id = `${day}:${entry.id}`
              return (
                <CircuitRow
                  key={entry.id}
                  id={entry.id}
                  stations={entry.stations}
                  sort={exerciseSort}
                  open={openExercise === id}
                  onToggle={() => onOpenExercise(openExercise === id ? null : id)}
                  onEditStation={(key, fields) => onEdit({ op: 'setExercise', day, key, fields })}
                  onRemove={() => {
                    if (openExercise === id) onOpenExercise(null)
                    onEdit(...entry.stations.map((e): PlanEdit => ({ op: 'removeExercise', day, key: e.key })))
                  }}
                />
              )
            }
            const exercise = entry.exercise
            const id = `${day}:${exercise.key}`
            return (
              <ExerciseRow
                key={exercise.key}
                exercise={exercise}
                sort={exerciseSort}
                open={openExercise === id}
                onToggle={() => onOpenExercise(openExercise === id ? null : id)}
                onEdit={(fields) => onEdit({ op: 'setExercise', day, key: exercise.key, fields })}
                onRemove={() => {
                  if (openExercise === id) onOpenExercise(null)
                  onEdit({ op: 'removeExercise', day, key: exercise.key })
                }}
              />
            )
          })}
          <button
            onClick={onAdd}
            className="min-h-[44px] rounded-xl bg-surface-2 text-sm font-medium active:bg-neutral-700"
          >
            add exercise
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The manual workout-plan editor: rename a day, change an exercise's numbers, add
 * a movement or drop one with its ✕, drag one up or down the day it's performed in,
 * and drag the days themselves into the order the Today tab offers them — the same
 * changes the coach can propose, without going through the coach.
 *
 * Exercise changes are applied with {@link applyPlanEdits}, the validated ops the
 * coach uses, so the two paths can't drift on key collisions or bad numbers.
 *
 * Edits accumulate in a draft and are written in one tap. A plan write syncs to
 * the sheet and raises a toast, which is not something to do per keystroke; and
 * until you save, nothing you've half-typed is on the plan the Today tab reads.
 * With no draft open the editor renders the live plan, so a coach edit approved in
 * the meantime just appears.
 */
export function PlanEditor({
  focusDay,
  onDirty,
  onSaved,
}: {
  /** The day to open straight away, for an editor reached from one day's button. */
  focusDay?: DayType
  /** Told whenever a draft opens or closes, so a host can say what leaving costs. */
  onDirty?: (dirty: boolean) => void
  /** Called once a draft has been written to the plan. */
  onSaved?: () => void
} = {}) {
  const { plan, updatePlan } = useData()
  const [draft, setDraft] = useState<Plan | null>(null)
  const [openDay, setOpenDay] = useState<DayType | null>(focusDay ?? null)
  useEffect(() => onDirty?.(draft != null), [draft, onDirty])
  /** The expanded exercise, as `day:key` — one at a time, across all days. */
  const [openExercise, setOpenExercise] = useState<string | null>(null)

  const current = draft ?? plan

  const edit = (...edits: PlanEdit[]) => setDraft(applyPlanEdits(current, edits).plan)

  const addExercise = (day: DayType) => {
    const before = new Set(current[day].exercises.map((e) => e.key))
    const next = applyPlanEdits(current, [
      {
        op: 'addExercise',
        day,
        exercise: { name: 'new exercise', sets: 3, repMin: 8, repMax: 12, restSec: 90, group: 'custom' },
      },
    ]).plan
    setDraft(next)
    // Open it straight away — a row called "new exercise" is not the point of
    // having tapped add.
    const added = next[day].exercises.find((e) => !before.has(e.key))
    if (added) setOpenExercise(`${day}:${added.key}`)
  }

  const days = dayOrder(current)

  /** Move a whole day through the week, which is the order the Today tab lists. */
  const daySort = useDragSort(days, (from, to) => {
    const next = [...days]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    edit({ op: 'reorderDays', days: next })
  })

  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">workout plan</label>
      {days.map((day) => (
        <DayRow
          key={day}
          day={day}
          dayPlan={current[day]}
          sort={daySort}
          open={openDay === day}
          onToggle={() => setOpenDay(openDay === day ? null : day)}
          openExercise={openExercise}
          onOpenExercise={setOpenExercise}
          onEdit={edit}
          onAdd={() => addExercise(day)}
        />
      ))}
      {draft && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              updatePlan(draft)
              setDraft(null)
              onSaved?.()
            }}
            className="min-h-[44px] flex-1 rounded-xl bg-accent font-semibold text-on-accent active:bg-accent-deep"
          >
            save plan
          </button>
          <button
            onClick={() => {
              setDraft(null)
              setOpenExercise(null)
            }}
            className="min-h-[44px] flex-1 rounded-xl bg-surface font-medium active:bg-surface-2"
          >
            discard
          </button>
        </div>
      )}
    </section>
  )
}
