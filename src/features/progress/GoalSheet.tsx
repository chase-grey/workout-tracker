import { useId } from 'react'
import { createPortal } from 'react-dom'
import { useBackGuard } from '../../lib/useBackGuard'

/**
 * What a tap on a goal asks for. The tap used to go straight to the screen the
 * goal is logged on, so a finger that only meant to look, or to move the goal
 * somewhere else, was standing in a workout (Chase, 2026-11-25). The sheet
 * names that screen as its first answer, offers the date the goal can be
 * committed to or moved from, and says how a page is changed, since the hold
 * that does it is invisible.
 *
 * In a portal so the row underneath doesn't light up as pressed, with its
 * clicks and holds stopped: the row opens on a tap anywhere and the page folds
 * on a hold anywhere.
 */
export function GoalSheet({
  title,
  action,
  onAction,
  dateAction,
  onDate,
  onCancel,
}: {
  title: string
  /** The screen the goal is logged on, as the words on the button that opens it. */
  action: string
  onAction: () => void
  /** `commit to a date` or `change date`; absent on a goal with no date to set. */
  dateAction?: string
  onDate?: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  useBackGuard(true, onCancel)
  const button = 'min-h-[48px] w-full rounded-xl font-semibold active:opacity-70'
  return createPortal(
    <div
      className="fixed inset-0 z-80 flex items-end bg-black/60"
      data-no-hold=""
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <h3 id={titleId} className="mb-4 text-lg font-bold">{title}</h3>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onAction} className={`${button} bg-accent text-on-accent`}>
            {action}
          </button>
          {dateAction && onDate && (
            <button type="button" onClick={onDate} className={`${button} bg-surface-2`}>
              {dateAction}
            </button>
          )}
          <button type="button" onClick={onCancel} className={`${button} bg-surface-2 text-neutral-400`}>
            cancel
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-neutral-500">hold anywhere to edit or rearrange</p>
      </div>
    </div>,
    document.body,
  )
}
