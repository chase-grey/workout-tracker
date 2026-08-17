import { MdFastForward } from 'react-icons/md'
import type { FastMode } from '../lib/fastMode'

/**
 * The three fast-forward triangles of turbo. No Material icon goes past two, so
 * the third is drawn here — same 24×24 box and same solid triangles, packed to
 * read as "more of what the two-triangle icon does".
 */
function TurboIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M1 6l7 6-7 6z" />
      <path d="M8.5 6l7 6-7 6z" />
      <path d="M16 6l7 6-7 6z" />
    </svg>
  )
}

const LABEL: Record<FastMode, string> = {
  off: 'auto-advance off',
  on: 'auto-advance on',
  turbo: 'auto-advance turbo',
}

/**
 * Hands-free toggle for a guided session, pressed to step through its modes: off,
 * rests rolling themselves into the next set, then turbo — the sets logging
 * themselves too (see lib/fastMode).
 *
 * Lives beside the overflow menu both in the session header and on the rest
 * screen, so it can be stepped from wherever the session happens to be.
 */
export function FastForwardToggle({ mode, onPress }: { mode: FastMode; onPress: () => void }) {
  const on = mode !== 'off'
  return (
    <button
      onClick={onPress}
      aria-label={LABEL[mode]}
      className={`flex min-h-[44px] w-11 items-center justify-center rounded-xl active:bg-surface-2 ${
        on ? 'bg-accent/25 text-accent-bright' : 'text-neutral-400'
      }`}
    >
      {mode === 'turbo' ? (
        <TurboIcon className="h-6 w-6" />
      ) : (
        <MdFastForward className="text-2xl" aria-hidden />
      )}
    </button>
  )
}
