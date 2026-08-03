import { useEffect, useRef, useState } from 'react'
import { MdCheck, MdKeyboardArrowDown, MdMoreHoriz } from 'react-icons/md'

/** How many of the most-trained lifts show before the 3-dots row. */
const TOP_N = 5

export type ExerciseOption = { key: string; name: string }

/**
 * The lift picker for the per-exercise chart. Options arrive ordered by how often
 * the lift is trained (see exercisesByFrequency), and only the top few show up
 * front — the long tail of plan exercises never yet logged and one-off imported
 * keys sits behind the 3 dots.
 */
export function ExercisePicker({
  options,
  value,
  onChange,
}: {
  options: ExerciseOption[]
  value: string
  onChange: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Reopening starts collapsed again, so the top 5 is what the picker always
  // leads with.
  const close = () => {
    setOpen(false)
    setExpanded(false)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selectedIndex = options.findIndex((o) => o.key === value)

  // A lift picked out of the tail keeps the list open past the top 5, so the
  // checked row is never hidden behind the dots that would collapse it.
  const showAll = expanded || selectedIndex >= TOP_N
  const visible = showAll ? options : options.slice(0, TOP_N)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl bg-surface px-3 text-base active:bg-surface-2"
      >
        <span className="truncate">{options[selectedIndex]?.name ?? 'pick a lift'}</span>
        <MdKeyboardArrowDown
          className={`shrink-0 text-xl text-neutral-400 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-12 z-50 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg"
        >
          {visible.map((o) => (
            <button
              key={o.key}
              role="option"
              aria-selected={o.key === value}
              onClick={() => {
                onChange(o.key)
                close()
              }}
              className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm active:bg-surface-2 ${
                o.key === value ? 'font-semibold text-accent-2' : 'text-neutral-200'
              }`}
            >
              <span className="flex-1 truncate">{o.name}</span>
              {o.key === value && <MdCheck className="shrink-0 text-lg" aria-hidden />}
            </button>
          ))}
          {!showAll && options.length > TOP_N && (
            <button
              onClick={() => setExpanded(true)}
              aria-label="show all lifts"
              className="flex min-h-[44px] w-full items-center justify-center border-t border-border text-neutral-400 active:bg-surface-2"
            >
              <MdMoreHoriz className="text-2xl" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
