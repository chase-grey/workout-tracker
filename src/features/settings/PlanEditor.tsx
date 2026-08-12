import { useEffect, useState } from 'react'
import { MdArrowDownward, MdArrowUpward, MdKeyboardArrowDown } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import {
  dayOrder,
  repRangeLabel,
  type DayPlan,
  type Plan,
  type PlannedExercise,
} from '../../config/plan'
import { applyPlanEdits, type PlanEdit } from '../../lib/planTools'
import type { DayType } from '../../types'

const FIELD =
  'min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const ICON_BUTTON =
  'flex h-[44px] w-10 shrink-0 items-center justify-center text-neutral-400 active:text-neutral-100 disabled:text-neutral-700'

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

/** One exercise: its summary line, the arrows that move it, and its open fields. */
function ExerciseRow({
  exercise,
  index,
  count,
  open,
  onToggle,
  onEdit,
  onMove,
  onRemove,
}: {
  exercise: PlannedExercise
  index: number
  count: number
  open: boolean
  onToggle: () => void
  onEdit: (fields: Extract<PlanEdit, { op: 'setExercise' }>['fields']) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  // Two taps to remove: the row's history stays, but the movement itself is gone
  // from the day, and the button sits next to the ones you tap while editing.
  const [confirmRemove, setConfirmRemove] = useState(false)
  useEffect(() => {
    if (!open) setConfirmRemove(false)
  }, [open])

  return (
    <div className="rounded-xl bg-surface-2">
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
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`move ${exercise.name} up`}
          className={ICON_BUTTON}
        >
          <MdArrowUpward aria-hidden />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label={`move ${exercise.name} down`}
          className={`${ICON_BUTTON} pr-1`}
        >
          <MdArrowDownward aria-hidden />
        </button>
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
          <button
            onClick={() => {
              if (!confirmRemove) return setConfirmRemove(true)
              onRemove()
            }}
            onBlur={() => setConfirmRemove(false)}
            className="min-h-[44px] rounded-xl bg-surface text-sm font-medium text-red-400 active:bg-neutral-800"
          >
            {confirmRemove ? 'tap again to remove' : 'remove exercise'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The manual workout-plan editor: rename a day, change an exercise's numbers, add
 * or remove a movement, move one up or down the day it's performed in, and put the
 * days themselves in the order the Today tab offers them — the same changes the
 * coach can propose, without going through the coach.
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
export function PlanEditor() {
  const { plan, updatePlan } = useData()
  const [draft, setDraft] = useState<Plan | null>(null)
  const [openDay, setOpenDay] = useState<DayType | null>(null)
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

  /** Swap a whole day with its neighbour, which is the order the Today tab lists. */
  const moveDay = (day: DayType, by: number) => {
    const from = days.indexOf(day)
    const to = from + by
    if (to < 0 || to >= days.length) return
    const next = [...days]
    ;[next[from], next[to]] = [next[to], next[from]]
    edit({ op: 'reorderDays', days: next })
  }

  const dayRow = (day: DayType, dayPlan: DayPlan, index: number) => {
    const isOpen = openDay === day
    return (
      <div key={day} className="rounded-xl bg-surface">
        <div className="flex items-center">
          <button
            onClick={() => setOpenDay(isOpen ? null : day)}
            aria-expanded={isOpen}
            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-3 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{dayPlan.label}</span>
            <span className="shrink-0 text-xs text-neutral-500">
              {dayPlan.exercises.length} exercises
            </span>
            <MdKeyboardArrowDown className={`text-lg ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <button
            onClick={() => moveDay(day, -1)}
            disabled={index === 0}
            aria-label={`move ${dayPlan.label} up`}
            className={ICON_BUTTON}
          >
            <MdArrowUpward aria-hidden />
          </button>
          <button
            onClick={() => moveDay(day, 1)}
            disabled={index === days.length - 1}
            aria-label={`move ${dayPlan.label} down`}
            className={`${ICON_BUTTON} pr-1`}
          >
            <MdArrowDownward aria-hidden />
          </button>
        </div>

        {isOpen && (
          <div className="flex flex-col gap-2 px-3 pb-3">
            <TextField
              label="day name"
              value={dayPlan.label}
              // A blank box is a name being retyped, not a day called nothing.
              onChange={(label) => label.trim() && edit({ op: 'setDayLabel', day, label })}
            />
            {dayPlan.exercises.map((exercise, i) => {
              const id = `${day}:${exercise.key}`
              return (
                <ExerciseRow
                  key={exercise.key}
                  exercise={exercise}
                  index={i}
                  count={dayPlan.exercises.length}
                  open={openExercise === id}
                  onToggle={() => setOpenExercise(openExercise === id ? null : id)}
                  onEdit={(fields) => edit({ op: 'setExercise', day, key: exercise.key, fields })}
                  onMove={(by) =>
                    edit({ op: 'moveExercise', day, key: exercise.key, toIndex: i + by })
                  }
                  onRemove={() => {
                    setOpenExercise(null)
                    edit({ op: 'removeExercise', day, key: exercise.key })
                  }}
                />
              )
            })}
            <button
              onClick={() => addExercise(day)}
              className="min-h-[44px] rounded-xl bg-surface-2 text-sm font-medium active:bg-neutral-700"
            >
              add exercise
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">workout plan</label>
      {days.map((day, i) => dayRow(day, current[day], i))}
      {draft && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              updatePlan(draft)
              setDraft(null)
            }}
            className="min-h-[44px] flex-1 rounded-xl bg-accent font-semibold text-black active:bg-accent-deep"
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
