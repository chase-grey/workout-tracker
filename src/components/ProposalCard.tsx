import type { ReactNode } from 'react'
import { MdBuild } from 'react-icons/md'
import { usePressAction } from '../lib/usePressAction'

export type ProposalStatus = 'pending' | 'approved' | 'rejected'

/** A button that still fires when pressed straight out of a text field (see lib/usePressAction). */
export function Press({ onPress, className, children }: { onPress: () => void; className: string; children: ReactNode }) {
  const press = usePressAction(onPress)
  return (
    <button type="button" {...press} className={className}>
      {children}
    </button>
  )
}

/**
 * A change an AI wants to make, held behind a button until the user says yes.
 *
 * Shared by the BYO-key coach's chat thread and the copy-paste companion, so a
 * change reads and is approved the same way whichever AI proposed it. It shows;
 * the caller commits — the card never saves anything itself. Its buttons are
 * press actions because the companion's is pressed straight out of the paste box.
 */
export function ProposalCard({
  title,
  changes,
  notes = [],
  status,
  approveLabel = 'approve',
  rejectLabel = 'reject',
  onApprove,
  onReject,
  className = '',
}: {
  title: ReactNode
  /** One line per change. */
  changes: string[]
  /** Smaller lines under the changes: what was adjusted on the way in. */
  notes?: string[]
  status: ProposalStatus
  approveLabel?: string
  rejectLabel?: string
  onApprove: () => void
  onReject: () => void
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-border bg-surface px-3 py-2 ${className}`}>
      <div className="flex items-center gap-1 text-xs text-accent-2">
        <MdBuild className="shrink-0" aria-hidden />
        {title}
      </div>
      <ul className="mt-1 list-disc pl-5 text-sm text-neutral-100">
        {changes.map((c, j) => (
          <li key={j}>{c}</li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="mt-1 pl-5 text-xs text-neutral-500">
          {notes.map((n, j) => (
            <li key={j}>{n}</li>
          ))}
        </ul>
      )}
      {status === 'pending' ? (
        <div className="mt-2 flex gap-2">
          <Press
            onPress={onApprove}
            className="min-h-[44px] flex-1 rounded-xl bg-accent px-3 font-semibold text-on-accent active:opacity-80"
          >
            {approveLabel}
          </Press>
          <Press
            onPress={onReject}
            className="min-h-[44px] flex-1 rounded-xl bg-bg px-3 font-medium text-neutral-300 active:opacity-80"
          >
            {rejectLabel}
          </Press>
        </div>
      ) : (
        <div className="mt-2 text-xs text-neutral-500">
          {status === 'approved' ? 'approved — saved' : 'rejected — nothing changed'}
        </div>
      )}
    </div>
  )
}
