import { useState } from 'react'
import { useData } from '../../store/DataContext'

export function WeightLogSheet({ onClose }: { onClose: () => void }) {
  const { logBodyWeight } = useData()
  const [value, setValue] = useState('')
  const n = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(n) && n > 0

  const save = () => {
    if (!valid) return
    void logBodyWeight(n)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 text-lg font-bold">log body weight</h2>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="min-h-[52px] w-0 flex-1 rounded-xl bg-surface-2 px-4 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-neutral-500">lbs</span>
        </div>
        <button
          onClick={save}
          disabled={!valid}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black disabled:opacity-30"
        >
          save
        </button>
      </div>
    </div>
  )
}
