import { useState } from 'react'
import {
  addCardioKind,
  asksDistance,
  cardioKinds,
  cardioLine,
  kindChips,
  normalizeKind,
  removeCardioKind,
  type CardioEntry,
  type CardioKind,
} from '../../lib/cardio'
import { parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import { useBackGuard } from '../../lib/useBackGuard'
import { usePressAction } from '../../lib/usePressAction'
import { useLongPress } from '../../lib/useLongPress'
import type { CardioPin } from '../../lib/homeTiles'
import type { PlannedCardio } from '../../lib/cardioPlan'
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

/**
 * One cardio session, logged after the fact — or, with `onPin`, saved as a
 * one-tap tile for Today instead. The two share a form because a pin is just a
 * log with the date left for the tap to fill in.
 *
 * The kind and the date are all a logged session needs: minutes and distance
 * count when given and are left off the entry when not. A pin still takes its
 * minutes, since the tap that logs it asks nothing. A kind measured in time
 * alone (soccer, tennis) never shows a distance field.
 *
 * The quick picks are the person's own (Settings.cardioKinds): holding them
 * turns each into a removal and opens a field for a new one.
 *
 * With a cardio plan, today's planned session (see lib/cardioPlan) heads the
 * sheet and fills the form, so logging it as planned is the one tap on save;
 * done differently, the numbers are there to change first.
 */
export function CardioLogSheet({
  onSave,
  onPin,
  entries,
  onDelete,
  onClose,
  planned,
  onGoal,
  goalName,
}: {
  onSave?: (entry: Omit<CardioEntry, 'id'>) => void
  onPin?: (pin: Omit<CardioPin, 'id'>) => void
  /** This week's entries are listed under the form, each removable. */
  entries?: CardioEntry[]
  onDelete?: (id: string) => void
  onClose: () => void
  /** Today's session from the cardio plan, not yet done. */
  planned?: PlannedCardio | null
  /** Opens the cardio goal, from the button at the head of the sheet. */
  onGoal?: () => void
  /** What that button says: the plan's goal, or nothing for "set a goal". */
  goalName?: string
}) {
  const pinning = !!onPin
  const today = toISODate(new Date())
  const plan = pinning ? null : planned ?? null
  const { settings, updateSettings } = useData()
  const kinds = cardioKinds(settings.cardioKinds)
  const opening = pinning ? 'soccer' : 'run'
  const [kind, setKind] = useState<CardioKind>(plan ? plan.kind : kinds.includes(opening) ? opening : kinds[0] ?? '')
  const [editing, setEditing] = useState(false)
  const holdKinds = useLongPress(() => setEditing(true), editing)
  const [newKind, setNewKind] = useState('')
  const [minutes, setMinutes] = useState(plan?.minutes != null ? String(plan.minutes) : '')
  const [distance, setDistance] = useState(plan?.distanceMi != null ? String(plan.distanceMi) : '')
  const [date, setDate] = useState(today)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useBackGuard(true, onClose)

  const saveKinds = (next: CardioKind[]) => void updateSettings({ ...settings, cardioKinds: next })

  const removeKind = (k: CardioKind) => {
    const next = removeCardioKind(kinds, k)
    // A chip shown only because it's the kind in hand isn't a pick to save.
    if (next.length !== kinds.length) saveKinds(next)
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

  const showDistance = asksDistance(kind)
  const min = optional(minutes)
  const dist: { value?: number; valid: boolean } = showDistance ? optional(distance) : { valid: true }
  const dateValid = pinning || (date !== '' && date <= today)
  const valid = kind !== '' && min.valid && (!pinning || min.value !== undefined) && dist.valid && dateValid

  const save = () => {
    if (!valid) return
    const distanceMi = dist.value !== undefined ? { distanceMi: dist.value } : {}
    if (onPin) {
      if (min.value === undefined) return
      onPin({ kind, minutes: min.value, ...distanceMi })
    } else {
      onSave?.({ date, kind, ...(min.value !== undefined ? { minutes: min.value } : {}), ...distanceMi })
    }
    onClose()
  }
  const savePress = usePressAction(save)

  const thisWeek = weekStartISO(today)
  const week = (entries ?? [])
    .filter((e) => weekStartISO(e.date) === thisWeek)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{pinning ? 'pin cardio' : 'log cardio'}</h2>
          {onGoal && (
            <button
              onClick={onGoal}
              className="min-h-[44px] min-w-0 truncate rounded-xl px-2 text-sm font-medium text-accent active:opacity-80"
            >
              {goalName ?? 'set a goal'}
            </button>
          )}
        </div>
        {plan && <p className="-mt-2 mb-3 text-sm text-accent-2">today: {plan.label}</p>}
        <div className="mb-4 flex flex-wrap gap-2" {...holdKinds}>
          {kindChips(kinds, kind).map((k) =>
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
                className={`${chipClass} ${kind === k ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-300'}`}
              >
                {k}
              </button>
            ),
          )}
          {editing && (
            <button
              onClick={() => {
                setEditing(false)
                setNewKind('')
              }}
              className={`${chipClass} bg-accent text-on-accent`}
            >
              done
            </button>
          )}
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
        <div className={`grid gap-3 ${showDistance ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
          {showDistance && (
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
          )}
        </div>
        {!pinning && (
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
        )}
        <button
          {...savePress}
          disabled={!valid}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-on-accent disabled:opacity-30"
        >
          {pinning ? 'pin' : 'save'}
        </button>

        {week.length > 0 && onDelete && (
          <ul className="mt-5 flex flex-col">
            <li className="mb-1 text-xs tracking-wider text-neutral-500">this week</li>
            {week.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-neutral-300">
                  {cardioLine(e)}
                  <span className="text-neutral-500">
                    {' '}
                    · {parseISODate(e.date).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()}
                  </span>
                </span>
                <button
                  onClick={() => {
                    if (confirmId !== e.id) {
                      setConfirmId(e.id)
                      return
                    }
                    setConfirmId(null)
                    onDelete(e.id)
                  }}
                  onBlur={() => setConfirmId(null)}
                  className={`min-h-[44px] shrink-0 rounded-xl px-3 text-sm active:opacity-80 ${
                    confirmId === e.id ? 'text-accent' : 'text-neutral-500'
                  }`}
                >
                  {confirmId === e.id ? 'tap again to remove' : 'remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
