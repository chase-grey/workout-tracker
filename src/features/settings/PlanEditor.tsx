import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { DEFAULT_PLAN, type PlannedExercise, type Plan } from '../../config/plan'
import type { DayType } from '../../types'

const clone = (p: Plan): Plan => JSON.parse(JSON.stringify(p))

function newExercise(): PlannedExercise {
  const id = Math.random().toString(36).slice(2, 8)
  return { key: `ex_${id}`, name: 'New exercise', sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 5, group: 'Custom' }
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="min-h-[44px] w-full rounded-lg bg-surface-2 px-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  )
}

/** Edits a single day of the plan; Settings opens one editor per day. */
export function PlanEditor({ day, onClose }: { day: DayType; onClose: () => void }) {
  const { plan, updatePlan } = useData()
  const [draft, setDraft] = useState<Plan>(() => clone(plan))

  const exercises = draft[day].exercises

  const patchExercise = (index: number, patch: Partial<PlannedExercise>) => {
    setDraft((d) => {
      const next = clone(d)
      next[day].exercises[index] = { ...next[day].exercises[index], ...patch }
      return next
    })
  }
  const removeExercise = (index: number) =>
    setDraft((d) => {
      const next = clone(d)
      next[day].exercises.splice(index, 1)
      return next
    })
  const addExercise = () =>
    setDraft((d) => {
      const next = clone(d)
      next[day].exercises.push(newExercise())
      return next
    })

  const save = () => {
    updatePlan(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-bold">Edit {draft[day].label}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm(`Reset ${draft[day].label} to the default plan?`))
                setDraft((d) => {
                  const next = clone(d)
                  next[day] = clone(DEFAULT_PLAN)[day]
                  return next
                })
            }}
            className="min-h-[44px] px-2 text-sm text-neutral-400"
          >
            Reset
          </button>
          <button onClick={onClose} className="min-h-[44px] px-2 text-sm text-neutral-400">
            Cancel
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-3 pt-3 pb-24">
        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-neutral-500">Name</span>
          <input
            value={draft[day].label}
            onChange={(e) =>
              setDraft((d) => {
                const next = clone(d)
                next[day].label = e.target.value
                return next
              })
            }
            className="min-h-[44px] rounded-xl bg-surface px-3 text-base focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>

        <div className="flex flex-col gap-3">
          {exercises.map((ex, i) => (
            <div key={ex.key} className="rounded-2xl bg-surface p-3">
              <input
                value={ex.name}
                onChange={(e) => patchExercise(i, { name: e.target.value })}
                placeholder="Exercise name"
                className="mb-2 min-h-[44px] w-full rounded-lg bg-surface-2 px-3 font-medium focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                value={ex.group}
                onChange={(e) => patchExercise(i, { group: e.target.value })}
                placeholder="Group (e.g. Chest)"
                className="mb-2 min-h-[44px] w-full rounded-lg bg-surface-2 px-3 text-sm text-neutral-300 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="flex gap-2">
                <NumberField label="Sets" value={ex.sets} onChange={(n) => patchExercise(i, { sets: n })} />
                <NumberField label="Rep min" value={ex.repMin} onChange={(n) => patchExercise(i, { repMin: n })} />
                <NumberField label="Rep max" value={ex.repMax} onChange={(n) => patchExercise(i, { repMax: n })} />
                <NumberField label="Rest s" value={ex.restSec} onChange={(n) => patchExercise(i, { restSec: n })} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-neutral-400">
                  <input
                    type="checkbox"
                    checked={!!ex.bodyweight}
                    onChange={(e) => patchExercise(i, { bodyweight: e.target.checked })}
                    className="h-5 w-5 accent-[var(--color-accent)]"
                  />
                  Bodyweight
                </label>
                <button
                  onClick={() => removeExercise(i)}
                  className="min-h-[44px] px-3 text-sm text-red-400 active:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addExercise}
          className="mt-3 min-h-[48px] w-full rounded-xl border border-dashed border-border text-sm text-neutral-400 active:bg-surface"
        >
          + Add exercise
        </button>
      </div>

      <div className="border-t border-border p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <button
          onClick={save}
          className="min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black"
        >
          Save plan
        </button>
      </div>
    </div>
  )
}
