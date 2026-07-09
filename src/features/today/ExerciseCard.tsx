import { useState } from 'react'
import type { ExerciseLog, SetLog } from '../../types'
import { repRangeLabel, type PlannedExercise } from '../../config/plan'
import type { Target } from '../../lib/progression'

type Props = {
  planned: PlannedExercise
  target?: Target
  log: ExerciseLog
  onAddSet: () => void
  onUpdateSet: (index: number, patch: Partial<SetLog>) => void
  onRemoveSet: (index: number) => void
  onSetNotes: (notes: string) => void
  onRest: (restSec: number) => void
}

function toWeight(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function targetLabel(target: Target | undefined): string | null {
  if (!target) return null
  if (target.weightLbs == null) return `Target ${target.reps} reps`
  return `Target ${target.weightLbs} × ${target.reps}`
}

export function ExerciseCard({
  planned,
  target,
  log,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onSetNotes,
  onRest,
}: Props) {
  const [showNotes, setShowNotes] = useState(!!log.notes)

  const toggleDone = (index: number, set: SetLog) => {
    const nextDone = !set.done
    onUpdateSet(index, { done: nextDone })
    if (nextDone && set.reps > 0) onRest(planned.restSec)
  }

  const restLabel = planned.restSec >= 60 ? `${planned.restSec / 60} min` : `${planned.restSec}s`
  const hint = targetLabel(target)

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="font-semibold leading-tight">{planned.name}</h3>
        <span className="shrink-0 text-xs text-neutral-500">
          {planned.sets}×{repRangeLabel(planned)} · {restLabel}
        </span>
      </div>
      {hint && <p className="mb-2 text-xs font-medium text-accent">🎯 {hint}</p>}

      <div className="flex flex-col gap-2">
        {log.sets.map((set, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-center text-sm text-neutral-500">{i + 1}</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder={planned.bodyweight ? 'BW' : 'lbs'}
              value={set.weightLbs ?? ''}
              onChange={(e) => onUpdateSet(i, { weightLbs: toWeight(e.target.value) })}
              className="min-h-[44px] w-0 flex-1 rounded-xl bg-surface-2 px-3 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="text-neutral-600">×</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="reps"
              value={set.reps || ''}
              onChange={(e) => onUpdateSet(i, { reps: Number(e.target.value) || 0 })}
              className="min-h-[44px] w-0 flex-1 rounded-xl bg-surface-2 px-3 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={() => toggleDone(i, set)}
              aria-label="mark set done"
              className={`min-h-[44px] w-11 shrink-0 rounded-xl text-lg ${
                set.done ? 'bg-accent-2 text-black' : 'bg-surface-2 text-neutral-500'
              }`}
            >
              ✓
            </button>
            <button
              onClick={() => onRemoveSet(i)}
              aria-label="remove set"
              className="min-h-[44px] w-8 shrink-0 text-neutral-600 active:text-neutral-400"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={onAddSet}
          className="min-h-[44px] flex-1 rounded-xl border border-dashed border-border text-sm text-neutral-400 active:bg-surface-2"
        >
          + Add set
        </button>
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-xl px-3 text-sm text-neutral-500 active:text-neutral-300"
        >
          Notes
        </button>
      </div>

      {showNotes && (
        <textarea
          value={log.notes ?? ''}
          onChange={(e) => onSetNotes(e.target.value)}
          placeholder="Optional notes…"
          rows={2}
          className="mt-2 w-full rounded-xl bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      )}
    </div>
  )
}
