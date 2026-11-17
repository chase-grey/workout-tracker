import { useState } from 'react'
import { asksDistance, CARDIO_KINDS, cardioSummary, type CardioEntry } from '../../lib/cardio'
import { parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import { useBackGuard } from '../../lib/useBackGuard'
import { usePressAction } from '../../lib/usePressAction'
import type { CardioPin } from '../../lib/homeTiles'
import type { PlannedCardio } from '../../lib/cardioPlan'

const inputClass =
  'mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-center text-2xl tabular-nums focus:outline-none focus:ring-2 focus:ring-accent'

const PRESETS: readonly string[] = CARDIO_KINDS

/**
 * One cardio session, logged after the fact — or, with `onPin`, saved as a
 * one-tap tile for Today instead. The two share a form because a pin is just a
 * log with the date left for the tap to fill in.
 *
 * A kind measured in time alone (soccer, tennis) never shows a distance field.
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
  const planPreset = plan && PRESETS.includes(plan.kind) ? plan.kind : null
  const [preset, setPreset] = useState<string>(pinning ? 'soccer' : plan ? planPreset ?? 'other' : 'run')
  const [name, setName] = useState(plan && !planPreset ? plan.kind : '')
  const [minutes, setMinutes] = useState(plan?.minutes != null ? String(plan.minutes) : '')
  const [distance, setDistance] = useState(plan?.distanceMi != null ? String(plan.distanceMi) : '')
  const [date, setDate] = useState(today)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useBackGuard(true, onClose)

  const kind = preset === 'other' ? name.trim().toLowerCase() || 'other' : preset
  const showDistance = asksDistance(kind)
  const min = Number(minutes)
  const minValid = minutes.trim() !== '' && Number.isFinite(min) && min > 0
  const hasDistance = showDistance && distance.trim() !== ''
  const dist = Number(distance)
  const distValid = !hasDistance || (Number.isFinite(dist) && dist > 0)
  const dateValid = pinning || (date !== '' && date <= today)
  const valid = minValid && distValid && dateValid

  const save = () => {
    if (!valid) return
    const body = { kind, minutes: min, ...(hasDistance ? { distanceMi: dist } : {}) }
    if (onPin) onPin(body)
    else onSave?.({ date, ...body })
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
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((k) => (
            <button
              key={k}
              onClick={() => setPreset(k)}
              aria-pressed={preset === k}
              className={`min-h-[44px] rounded-full px-4 font-medium ${
                preset === k ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-300'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        {preset === 'other' && (
          <label className="mb-3 block text-xs text-neutral-400">
            name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 min-h-[52px] w-full rounded-xl bg-surface-2 px-3 text-lg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
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
                aria-invalid={!distValid}
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
                  {e.kind} · {cardioSummary(e)}
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
