import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { DEFAULT_FLEX_ROUTINE, type FlexBlock, type FlexExercise } from '../../config/flexPlan'

const clone = (r: FlexBlock[]): FlexBlock[] => JSON.parse(JSON.stringify(r))

function newExercise(): FlexExercise {
  const id = Math.random().toString(36).slice(2, 8)
  return { key: `fx_${id}`, name: 'new stretch', sets: '3', maxSets: 3, reps: 8, tempo: '', restSec: 90 }
}

function Field({
  label,
  value,
  onChange,
  numeric,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  numeric?: boolean
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[10px] tracking-wide text-neutral-500">{label}</span>
      <input
        type={numeric ? 'number' : 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full rounded-lg bg-surface-2 px-2 text-center focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  )
}

export function FlexRoutineEditor({ onClose }: { onClose: () => void }) {
  const { flexPlan, updateFlexPlan } = useData()
  const [draft, setDraft] = useState<FlexBlock[]>(() => clone(flexPlan))

  const patchBlock = (bi: number, patch: Partial<FlexBlock>) =>
    setDraft((d) => {
      const next = clone(d)
      next[bi] = { ...next[bi], ...patch }
      return next
    })
  const patchExercise = (bi: number, ei: number, patch: Partial<FlexExercise>) =>
    setDraft((d) => {
      const next = clone(d)
      next[bi].exercises[ei] = { ...next[bi].exercises[ei], ...patch }
      return next
    })
  const removeExercise = (bi: number, ei: number) =>
    setDraft((d) => {
      const next = clone(d)
      next[bi].exercises.splice(ei, 1)
      return next
    })
  const addExercise = (bi: number) =>
    setDraft((d) => {
      const next = clone(d)
      next[bi].exercises.push(newExercise())
      return next
    })
  const removeBlock = (bi: number) =>
    setDraft((d) => clone(d).filter((_, i) => i !== bi))
  const addBlock = () =>
    setDraft((d) => [...clone(d), { label: 'new block', exercises: [] }])

  const save = () => {
    updateFlexPlan(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-bold">edit stretch routine</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm('reset to the default routine?')) setDraft(clone(DEFAULT_FLEX_ROUTINE))
            }}
            className="min-h-[44px] px-2 text-sm text-neutral-400"
          >
            reset
          </button>
          <button onClick={onClose} className="min-h-[44px] px-2 text-sm text-neutral-400">
            cancel
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-4">
          {draft.map((block, bi) => (
            <div key={bi} className="rounded-2xl bg-surface p-3">
              <input
                value={block.label}
                onChange={(e) => patchBlock(bi, { label: e.target.value })}
                placeholder="block name"
                className="mb-2 min-h-[44px] w-full rounded-lg bg-surface-2 px-3 font-semibold focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                value={block.note ?? ''}
                onChange={(e) => patchBlock(bi, { note: e.target.value })}
                placeholder="note (e.g. alternate back-to-back)"
                className="mb-3 min-h-[44px] w-full rounded-lg bg-surface-2 px-3 text-sm text-neutral-300 focus:outline-none focus:ring-2 focus:ring-accent"
              />

              <div className="flex flex-col gap-3">
                {block.exercises.map((ex, ei) => (
                  <div key={ex.key} className="rounded-xl bg-surface-2 p-2">
                    <input
                      value={ex.name}
                      onChange={(e) => patchExercise(bi, ei, { name: e.target.value })}
                      placeholder="stretch name"
                      className="mb-2 min-h-[44px] w-full rounded-lg bg-bg px-3 font-medium focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <div className="flex gap-2">
                      <Field label="sets" value={ex.sets} onChange={(v) => patchExercise(bi, ei, { sets: v })} />
                      <Field label="boxes" value={ex.maxSets} numeric onChange={(v) => patchExercise(bi, ei, { maxSets: Number(v) || 1 })} />
                      <Field label="reps" value={ex.reps} numeric onChange={(v) => patchExercise(bi, ei, { reps: Number(v) || 0 })} />
                      <Field label="rest s" value={ex.restSec} numeric onChange={(v) => patchExercise(bi, ei, { restSec: Number(v) || 0 })} />
                    </div>
                    <input
                      value={ex.tempo}
                      onChange={(e) => patchExercise(bi, ei, { tempo: e.target.value })}
                      placeholder="tempo (e.g. 2s down · 3s hold · 1s up)"
                      className="mt-2 min-h-[44px] w-full rounded-lg bg-bg px-3 text-sm text-neutral-300 focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <button
                      onClick={() => removeExercise(bi, ei)}
                      className="mt-1 min-h-[40px] text-sm text-red-400 active:text-red-300"
                    >
                      remove stretch
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={() => addExercise(bi)}
                  className="min-h-[40px] text-sm text-neutral-400 active:text-neutral-200"
                >
                  + add stretch
                </button>
                <button
                  onClick={() => removeBlock(bi)}
                  className="min-h-[40px] text-sm text-red-400 active:text-red-300"
                >
                  remove block
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addBlock}
          className="mt-3 min-h-[48px] w-full rounded-xl border border-dashed border-border text-sm text-neutral-400 active:bg-surface"
        >
          + add block
        </button>
      </div>

      <div className="border-t border-border p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        <button onClick={save} className="min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black">
          save routine
        </button>
      </div>
    </div>
  )
}
