import { useState } from 'react'
import { MdClose } from 'react-icons/md'
import { MAX_QUICK_ADDS, formatAdd, withAmount, withoutAmount } from '../lib/quickAdds'
import { usePressAction } from '../lib/usePressAction'

const ADD =
  'min-h-[44px] w-12 shrink-0 rounded-xl bg-surface-2 text-lg font-semibold active:opacity-80 aria-disabled:text-neutral-600'

/**
 * One row of quick-add buttons, as amounts to keep or drop: each amount is a
 * chip whose × takes it off, and the field under them adds one — with + for a
 * button that adds it, − for one that takes it back. See lib/quickAdds.
 */
export function AmountEditor({
  label,
  unit = '',
  values,
  onChange,
}: {
  label: string
  unit?: string
  values: number[]
  onChange: (values: number[]) => void
}) {
  const [text, setText] = useState('')
  const amount = Math.round(Number(text))
  const full = values.length >= MAX_QUICK_ADDS
  const usable = (sign: 1 | -1) => text.trim() !== '' && amount > 0 && !full && !values.includes(sign * amount)
  const add = (sign: 1 | -1) => {
    if (!usable(sign)) return
    onChange(withAmount(values, sign * amount))
    setText('')
  }
  // Pressed straight out of the field: the keyboard closing moves the button
  // out from under a plain click (see lib/usePressAction).
  const plus = usePressAction(() => add(1))
  const minus = usePressAction(() => add(-1))

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className="text-xs tracking-wider text-neutral-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <button
            key={v}
            onClick={() => onChange(withoutAmount(values, v))}
            disabled={values.length <= 1}
            aria-label={`remove ${formatAdd(v, unit)}`}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-sm font-semibold tabular-nums active:opacity-80"
          >
            {formatAdd(v, unit)}
            {values.length > 1 && <MdClose aria-hidden className="text-neutral-500" />}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`new ${label} amount`}
          placeholder="amount"
          disabled={full}
          className="min-h-[44px] min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-40"
        />
        <button type="button" {...plus} aria-disabled={!usable(1)} aria-label={`add a plus ${label} button`} className={ADD}>
          +
        </button>
        <button type="button" {...minus} aria-disabled={!usable(-1)} aria-label={`add a minus ${label} button`} className={ADD}>
          −
        </button>
      </div>
    </div>
  )
}
