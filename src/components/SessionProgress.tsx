/**
 * How far through a session you are: a bar that fills as sets are completed,
 * with an optional caption row (sets left, time left). Pinned to the top of both
 * the working screen and the rest screen, so the same "how much is still ahead of
 * me" line is there whether you're mid-set or mid-rest. The caption counts down
 * what's left rather than up from what's done — the bar already carries progress,
 * and what's left is the thing you want at a glance.
 */
export function SessionProgress({
  done,
  total,
  unit,
  timeLeftLabel,
  onTimeClick,
  className = '',
}: {
  done: number
  total: number
  /** Set to caption how many are left (e.g. "sets"); omit for a bar with no labels. */
  unit?: string
  timeLeftLabel?: string | null
  onTimeClick?: () => void
  className?: string
}) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
  const left = Math.max(0, total - done)
  const captioned = !!unit || !!timeLeftLabel
  return (
    <div className={className}>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        {/* Deep green, a step below the CTA's dark green: the bar is a glanceable
            reference, not something to pull the eye mid-set. */}
        <div className="h-full rounded-full bg-accent-deep transition-all" style={{ width: `${fraction * 100}%` }} />
      </div>
      {captioned && (
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs font-medium text-neutral-400">
          {unit && (
            <span className="tabular-nums">
              {left} {unit} left
            </span>
          )}
          {timeLeftLabel && (onTimeClick ? (
            <button
              onClick={(event) => { event.stopPropagation(); onTimeClick() }}
              aria-label={`${timeLeftLabel.replace(/^~/, '')}. View session timing`}
              aria-haspopup="dialog"
              className="ml-auto min-h-[44px] px-1 underline decoration-neutral-600 underline-offset-4 active:text-accent-2"
            >
              {timeLeftLabel.replace(/^~/, '')}
            </button>
          ) : <span className="ml-auto">{timeLeftLabel.replace(/^~/, '')}</span>)}
        </div>
      )}
    </div>
  )
}
