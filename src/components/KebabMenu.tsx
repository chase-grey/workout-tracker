import { useState } from 'react'
import { MdMoreVert } from 'react-icons/md'
import { withHidden } from '../lib/hiddenAnimations'
import { useTopAnimation } from '../lib/useShownAnimation'
import { useData } from '../store/DataContext'

export type MenuItem = { label: string; onClick: () => void; danger?: boolean }

/** A 3-dots overflow menu for rarely-used actions (skip, jump, finish, discard). */
export function KebabMenu({ items: own }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const { settings, updateSettings } = useData()
  // Whatever animation is on screen can be marked bad from here, in either
  // session, without either one having to wire it in (see lib/useShownAnimation).
  const shown = useTopAnimation()
  const items: MenuItem[] = shown
    ? [
        {
          label: 'hide this animation',
          onClick: () => {
            updateSettings({
              ...settings,
              hiddenAnimations: withHidden(settings.hiddenAnimations, shown.id),
            })
            shown.replace()
          },
        },
        ...own,
      ]
    : own

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="more options"
        className="flex min-h-[44px] w-11 items-center justify-center rounded-xl text-neutral-400 active:bg-surface-2"
      >
        <MdMoreVert className="text-2xl" aria-hidden />
      </button>
      {open && (
        <>
          {/* Tapping away closes the menu and does nothing else. It has to be a real
              element rather than an outside-click listener: the screens this menu
              sits on treat a tap anywhere as the action — a session's set screen
              advances, its rest screen ends rest — and dismissing a menu is neither
              of those. The tap has to be caught and stopped, not just observed. */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
          />
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
        </>
      )}
    </div>
  )
}
