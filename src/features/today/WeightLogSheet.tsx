import { useState } from 'react'
import { useData } from '../../store/DataContext'

export function WeightLogSheet({ onClose }: { onClose: () => void }) {
  const { logBodyWeight, logMeasurement } = useData()
  const [value, setValue] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const bf = Number(bodyFat)
  const bfValid = bodyFat.trim() === '' || (Number.isFinite(bf) && bf > 0 && bf < 100)
  const n = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(n) && n > 0 && bfValid

  const save = () => {
    if (!valid) return
    void logBodyWeight(n)
    if (bodyFat.trim() !== '') void logMeasurement({ bodyFatPct: bf })
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
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-xs text-neutral-400">
            weight (lbs)
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="min-w-0 text-xs text-neutral-400">
            body fat % (optional)
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              max="99.9"
              step="any"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              aria-invalid={!bfValid}
              className="mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        </div>
        {!bfValid && <p className="mt-2 text-sm text-red-400">enter a body fat percentage between 0 and 100.</p>}
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
