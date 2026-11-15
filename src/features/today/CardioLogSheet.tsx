import { useState } from 'react'
import {
  addCardioKind,
  cardioKinds,
  normalizeKind,
  removeCardioKind,
  type CardioEntry,
  type CardioKind,
} from '../../lib/cardio'
import { toISODate } from '../../lib/dates'
import { useBackGuard } from '../../lib/useBackGuard'
import { usePressAction } from '../../lib/usePressAction'
import { useData } from '../../store/DataContext'

const inputClass =
  'mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent'

const chipClass = 'min-h-[44px] rounded-full px-4 font-medium'

/** '' is a field left blank; a value must be a positive number to count. */
function optional(text: string): { value?: number; valid: boolean } {
  if (text.trim() === '') return { valid: true }
  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? { value: n, valid: true } : { valid: false }
}

export function CardioLogSheet({
  onSave,
  onClose,
}: {
  onSave: (entry: Omit<CardioEntry, 'id'>) => void
  onClose: () => void
}) {
  const { settings, updateSettings } = useData()
  const kinds = cardioKinds(settings.cardioKinds)
  const today = toISODate(new Date())
  const [kind, setKind] = useState<CardioKind>(kinds[0] ?? '')
  const [minutes, setMinutes] = useState('')
  const [distance, setDistance] = useState('')
  const [date, setDate] = useState(today)
  const [editing, setEditing] = useState(false)
  const [newKind, setNewKind] = useState('')

  useBackGuard(true, onClose)

  const saveKinds = (next: CardioKind[]) => updateSettings({ ...settings, cardioKinds: next })

  const removeKind = (k: CardioKind) => {
    const next = removeCardioKind(kinds, k)
    saveKinds(next)
    if (kind === k) setKind(next[0] ?? '')
  }

  const addKind = () => {
    const k = normalizeKind(newKind)
    if (k === '') return
    const next = addCardioKind(kinds, k)
    if (next !== kinds) saveKinds(next)
    setKind(k)
    setNewKind('')
  }
  const addPress = usePressAction(addKind)

  const min = optional(minutes)
  const dist = optional(distance)
  const dateValid = date !== '' && date <= today
  const valid = kind !== '' && min.valid && dist.valid && dateValid

  const save = () => {
    if (!valid) return
    onSave({
      date,
      kind,
      ...(min.value !== undefined ? { minutes: min.value } : {}),
      ...(dist.value !== undefined ? { distanceMi: dist.value } : {}),
    })
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
          {kinds.map((k) =>
            editing ? (
              <button
                key={k}
                onClick={() => removeKind(k)}
                aria-label={`remove ${k}`}
                className={`${chipClass} bg-surface-2 text-neutral-300`}
              >
                {k} <span className="text-neutral-500">✕</span>
              </button>
            ) : (
              <button
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`${chipClass} ${
                  kind === k ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-300'
                }`}
              >
                {k}
              </button>
            ),
          )}
          <button
            onClick={() => {
              setEditing((v) => !v)
              setNewKind('')
            }}
            aria-pressed={editing}
            className={`${chipClass} ${editing ? 'bg-accent text-on-accent' : 'text-neutral-500'}`}
          >
            {editing ? 'done' : 'edit'}
          </button>
        </div>
        {editing && (
          <div className="mb-4 flex gap-2">
            <input
              autoFocus
              type="text"
              aria-label="new type"
              placeholder="new type"
              maxLength={24}
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addKind()
              }}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-lg focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              {...addPress}
              disabled={normalizeKind(newKind) === ''}
              className="min-h-[44px] rounded-xl bg-surface-2 px-5 font-medium disabled:opacity-30"
            >
              add
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-xs text-neutral-400">
            minutes
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-invalid={!min.valid}
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
              aria-invalid={!dist.valid}
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
