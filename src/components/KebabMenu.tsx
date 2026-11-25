import { useEffect, useRef, useState } from 'react'
import { MdMoreVert } from 'react-icons/md'
import { withHidden } from '../lib/hiddenAnimations'
import { useTopAnimation } from '../lib/useShownAnimation'
import { useData } from '../store/DataContext'
import { useBackGuard } from '../lib/useBackGuard'
import { useControlLabel } from '../lib/useControlLabel'
import { ControlWord } from './ControlWord'

export type MenuItem = { label: string; onClick: () => void; danger?: boolean }

/** A 3-dots overflow menu for rarely-used actions (skip, jump, finish, discard). */
export function KebabMenu({ items: own }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const { settings, updateSettings } = useData()
  // Whatever animation is on screen can be marked bad from here, in either
  // session, without either one having to wire it in (see lib/useShownAnimation).
  const shown = useTopAnimation()
  const label = useControlLabel('more')

  // An open menu is something over the screen, so Android back closes it and
  // does nothing else, as it does for a sheet. Left to the session's own guard
  // the press set the whole session aside with the menu still open inside it,
  // and coming back to the session brought the menu up with it.
  useBackGuard(open, () => setOpen(false))

  // Nor does it outlive the screen it was opened on. A session draws its header
  // three times over (the set, the rest, the count), each with a menu of its
  // own, and stays mounted while it is set aside; a menu left open on a set
  // that then ended itself sat under the rest and was up again when the rest
  // closed. So after every render an open menu checks that its button is still
  // the thing on screen where it stands, and closes if it is hidden or covered.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!open || !el) return
    const r = el.getBoundingClientRect()
    const top = r.width > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
    if (!top || !el.contains(top)) setOpen(false)
  })
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
    <div ref={root} className="relative">
      <button
        onClick={() => {
          if (!open) label.used()
          setOpen((o) => !o)
        }}
        aria-label="more options"
        className="flex min-h-[44px] w-11 flex-col items-center justify-center rounded-xl text-neutral-400 active:bg-surface-2"
      >
        <MdMoreVert className="text-2xl" aria-hidden />
        <ControlWord show={label.show} word={label.word} />
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
          <div className="menu-pop absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
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
