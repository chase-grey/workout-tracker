import { MdPause } from 'react-icons/md'
import { useControlLabel } from '../lib/useControlLabel'

/**
 * The "paused" curtain over an in-progress workout or stretch session. Purely a
 * break state — it holds nothing and tracks no time; a tap anywhere dismisses it
 * and picks up exactly where you left off. Handy for stepping away mid-session
 * without accidentally tapping through the flow.
 *
 * It dims the session rather than hiding it: the screen underneath already says
 * which exercise and set you come back to, and reading that is how you get set
 * up before the tap that starts things again. So the pause mark sits low, clear
 * of the title and the set card, and there is no label and no button — the
 * curtain is the whole target. The one line saying so is a starter label (see
 * lib/controlLabels), worn only by someone new.
 */
export function PauseOverlay({ onResume }: { onResume: () => void }) {
  const hint = useControlLabel('resume')
  return (
    <div
      role="button"
      aria-label="paused, resume"
      className="keep-dark fixed inset-0 z-50 flex flex-col items-center justify-end gap-3 bg-black/35 px-6 pb-[7vh]"
      onClick={(e) => {
        // The session's own tap-anywhere is underneath; this tap is the curtain's.
        e.stopPropagation()
        hint.used()
        onResume()
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-accent shadow-lg">
        <MdPause className="text-4xl" aria-hidden />
      </div>
      {hint.show && <p className="text-sm font-medium text-neutral-200">{hint.word}</p>}
    </div>
  )
}
