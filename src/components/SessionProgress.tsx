/**
 * How far through a session you are: a bar that fills as sets are completed,
 * with an optional caption row (sets done, time left). Used in the session
 * header and again on the rest screen, where it stands in for a bare time-left
 * line so resting shows position in the workout, not just a number.
 */
export function SessionProgress({
  done,
  total,
  unit,
  timeLeftLabel,
  className = '',
}: {
  done: number
  total: number
  /** Set to caption the fill (e.g. "sets"); omit for a bar with no labels. */
  unit?: string
  timeLeftLabel?: string | null
  className?: string
}) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
  const captioned = !!unit || !!timeLeftLabel
  return (
    <div className={className}>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${fraction * 100}%` }} />
      </div>
      {captioned && (
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-xs font-medium text-neutral-400">
          {unit && (
            <span className="tabular-nums">
              {done}/{total} {unit}
            </span>
          )}
          {timeLeftLabel && <span className="ml-auto">{timeLeftLabel}</span>}
        </div>
      )}
    </div>
  )
}
