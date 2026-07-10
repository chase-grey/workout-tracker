import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { CALORIE_PRESETS } from '../../config/calories'
import { CALORIE_GOAL, totalForDate } from '../../lib/calories'
import { toISODate } from '../../lib/dates'

export function CalorieLogger() {
  const { calorieEntries, logCalories } = useData()
  const [custom, setCustom] = useState('')
  const [flash, setFlash] = useState<string | null>(null)

  const today = toISODate(new Date())
  const total = totalForDate(calorieEntries, today)
  const pct = Math.min(total / CALORIE_GOAL, 1) * 100
  const over = total >= CALORIE_GOAL

  const flashMsg = (m: string) => {
    setFlash(m)
    setTimeout(() => setFlash(null), 1400)
  }
  const add = (cal: number, label: string) => {
    void logCalories(cal, label)
    flashMsg(`+${cal} cal`)
  }
  const addCustom = () => {
    const n = Number(custom)
    if (!Number.isFinite(n) || n <= 0) return
    add(Math.round(n), 'Custom')
    setCustom('')
  }

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wider text-neutral-500">Calories today</p>
        <p className="text-sm tabular-nums text-neutral-400">
          <span className={`text-lg font-bold ${over ? 'text-accent-2' : 'text-neutral-100'}`}>{total}</span>{' '}
          / {CALORIE_GOAL}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CALORIE_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => add(p.calories, p.label)}
            className="min-h-[44px] flex-1 rounded-xl bg-surface-2 px-2 text-sm font-medium active:opacity-80"
          >
            {p.label}
            <span className="block text-xs text-neutral-500">{p.calories} cal</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          placeholder="custom cal"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="min-h-[44px] w-0 flex-1 rounded-xl bg-surface-2 px-3 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={addCustom}
          disabled={!custom.trim()}
          className="min-h-[44px] rounded-xl bg-accent px-4 font-semibold text-black disabled:opacity-30"
        >
          Add
        </button>
      </div>

      {flash && <p className="mt-2 text-center text-sm text-accent-2">{flash}</p>}
    </div>
  )
}
