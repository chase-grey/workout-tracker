import { useEffect } from 'react'
import { dismissUpdateToast, useAppUpdate } from '../lib/version'

const SHOW_MS = 3000
/** Long enough to read the line and reach for its button. */
const ACTION_SHOW_MS = 8000

/**
 * The answer to "check for updates", floated just above the tab bar and gone on
 * its own. It doesn't take taps, so it never blocks the screen beneath it —
 * except on its own button, when it carries one (the "undo" after an AI's plan
 * change), and then only on the pill itself.
 *
 * Also the word that a control's starter label has gone (see lib/useControlLabel),
 * which can retire from inside a session's checklist sheet — so it sits above
 * every sheet, safe to because a tap goes straight through it to the set screen.
 */
export function UpdateToast() {
  const { toast } = useAppUpdate()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => dismissUpdateToast(toast.id), toast.action ? ACTION_SHOW_MS : SHOW_MS)
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
          className={`update-toast flex items-center gap-1 rounded-full bg-neutral-100 text-sm font-medium text-neutral-900 shadow-lg ${
            toast.action ? 'pointer-events-auto py-0 pl-4 pr-1' : 'px-4 py-2'
          }`}
        >
          {toast.text}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.run()
                dismissUpdateToast(toast.id)
              }}
              className="min-h-[44px] rounded-full px-3 font-semibold underline underline-offset-2 active:opacity-70"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
