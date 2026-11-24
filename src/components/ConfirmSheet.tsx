import { useId } from 'react'

/**
 * A question asked before something that can't be taken back — finishing a
 * session with sets still owed, throwing one away — as a sheet of the app's own
 * rather than the browser's `confirm()`, which arrives titled with the page's
 * address and looks like something else is asking.
 *
 * It sits over everything a session can have up (rest, the pause curtain, the
 * checklist), since the menu that opens it is reachable from all of them. The
 * backdrop stops its own click: the screens underneath treat a tap anywhere as
 * the action, and a tap that backs out of a question is not a set finished.
 */
export function ConfirmSheet({
  question,
  action,
  danger,
  onConfirm,
  onCancel,
}: {
  question: string
  /** The word on the button that goes ahead — the menu item's own label. */
  action: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  return (
    <div
      className="fixed inset-0 z-80 flex items-end bg-black/60"
      onClick={(event) => {
        event.stopPropagation()
        onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full rounded-t-3xl bg-surface p-4"
        onClick={(event) => event.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <h3 id={titleId} className="mb-4 text-lg font-bold">{question}</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] flex-1 rounded-xl bg-surface-2 font-semibold active:opacity-70"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[48px] flex-1 rounded-xl font-semibold active:opacity-70 ${
              danger ? 'bg-red-500 text-white' : 'bg-accent text-on-accent'
            }`}
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  )
}
