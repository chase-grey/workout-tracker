import { useState } from 'react'
import { CARDIO_KINDS, type CardioEntry, type CardioKind } from '../../lib/cardio'
import { toISODate } from '../../lib/dates'
import { useBackGuard } from '../../lib/useBackGuard'
import { usePressAction } from '../../lib/usePressAction'

const inputClass =
  'mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent'

export function CardioLogSheet({
  onSave,
  onClose,
}: {
  onSave: (entry: Omit<CardioEntry, 'id'>) => void
  onClose: () => void
}) {
  const today = toISODate(new Date())
  const [kind, setKind] = useState<CardioKind>('run')
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  const [date, setDate] = useState(today)

  useBackGuard(true, onClose)

  const min = Number(minutes)
  const minValid = minutes.trim() !== '' && Number.isFinite(min) && min > 0
  const hasDistance = distance.trim() !== ''
  const dist = Number(distance)
  const distValid = !hasDistance || (Number.isFinite(dist) && dist > 0)
  const dateValid = date !== '' && date <= today
  const valid = minValid && distValid && dateValid

  const save = () => {
    if (!valid) return
    onSave({ date, kind, minutes: min, ...(hasDistance ? { distanceMi: dist } : {}) })
    onClose()
  }
  const savePress = usePressAction(save)

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <h2 className="mb-4 text-lg font-bold">log cardio</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {CARDIO_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`min-h-[44px] rounded-full px-4 font-medium ${
                kind === k ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-300'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-xs text-neutral-400">
            minutes
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="min-w-0 text-xs text-neutral-400">
            distance (mi)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              aria-invalid={!distValid}
              className={inputClass}
            />
          </label>
        </div>
        <label className="mt-3 block text-xs text-neutral-400">
          date
          <input
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!dateValid}
            className="mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <button
          {...savePress}
          disabled={!valid}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-on-accent disabled:opacity-30"
        >
          save
        </button>
      </div>
    </div>
  )
}
