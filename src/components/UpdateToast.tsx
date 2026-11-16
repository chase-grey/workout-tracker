import { useEffect } from 'react'
import { dismissUpdateToast, useAppUpdate } from '../lib/version'

const SHOW_MS = 3000

/**
 * The answer to "check for updates", floated just above the tab bar and gone on
 * its own. It doesn't take taps, so it never blocks the screen beneath it.
 *
 * Also the word that a control's starter label has gone (see lib/useControlLabel),
 * which can retire from inside a session's checklist sheet — so it sits above
 * every sheet, safe to because a tap goes straight through it to the set screen.
 */
export function UpdateToast() {
  const { toast } = useAppUpdate()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => dismissUpdateToast(toast.id), SHOW_MS)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-80 flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
    >
      {toast && (
        <div
          key={toast.id}
          className="update-toast rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 shadow-lg"
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
