import { MdFastForward } from 'react-icons/md'

/**
 * Hands-free toggle for a guided session: while it's on, the session rolls itself
 * forward — rest ends the moment it's up and the get-into-position counts are
 * skipped — until it's switched back off.
 *
 * Lives beside the overflow menu both in the session header and on the rest
 * screen, so it can be flipped from wherever the session happens to be.
 */
export function FastForwardToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label="auto-advance"
      aria-pressed={on}
      className={`flex min-h-[44px] w-11 items-center justify-center rounded-xl active:bg-surface-2 ${
        on ? 'bg-accent/25 text-accent-bright' : 'text-neutral-400'
      }`}
    >
      <MdFastForward className="text-2xl" aria-hidden />
    </button>
  )
}
