import { useEffect, useRef, useState } from 'react'
import { MdMoreVert } from 'react-icons/md'

export type MenuItem = { label: string; onClick: () => void; danger?: boolean }

/** A 3-dots overflow menu for rarely-used actions (skip, jump, finish, discard). */
export function KebabMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More options"
        className="flex min-h-[44px] w-11 items-center justify-center rounded-xl text-neutral-400 active:bg-surface-2"
      >
        <MdMoreVert className="text-2xl" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false)
                it.onClick()
              }}
              className={`block w-full px-4 py-3 text-left text-sm active:bg-surface-2 ${
                it.danger ? 'text-red-400' : 'text-neutral-200'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
