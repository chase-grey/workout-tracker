import { MdPause, MdPlayArrow } from 'react-icons/md'

/**
 * Full-screen "paused" curtain for an in-progress workout or stretch session.
 * Purely a break state — it holds nothing and tracks no time; tap Resume (or
 * anywhere) to dismiss and pick up exactly where you left off. Handy for
 * stepping away mid-session without accidentally tapping through the flow.
 */
export function PauseOverlay({ label = 'paused', onResume }: { label?: string; onResume: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-black/95 px-6"
      onClick={onResume}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface-2 text-accent">
          <MdPause className="text-6xl" aria-hidden />
        </div>
        <p className="text-2xl font-bold">{label}</p>
      </div>

      <button
        onClick={onResume}
        className="flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent px-10 text-lg font-bold text-black active:opacity-80"
      >
        <MdPlayArrow className="text-2xl" aria-hidden /> resume
      </button>

      <p className="text-sm text-neutral-500">tap anywhere to resume</p>
    </div>
  )
}
