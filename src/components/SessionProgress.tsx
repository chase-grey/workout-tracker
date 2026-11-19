import { useEffect, useState } from 'react'
import { useControlLabel } from '../lib/useControlLabel'
import { ControlWord } from './ControlWord'

/**
 * How far through a session you are: a bar that fills as sets are completed,
 * with an optional caption row (sets left, time left). Pinned to the top of both
 * the working screen and the rest screen, so the same "how much is still ahead of
 * me" line is there whether you're mid-set or mid-rest. The caption counts down
 * what's left rather than up from what's done — the bar already carries progress,
 * and what's left is the thing you want at a glance.
 *
 * `expected` puts a mark on the bar where the session's projection says the fill
 * should have reached by now (see lib/sessionPace.expectedProgress): a fill short
 * of the mark is behind it, a fill past it ahead. It's read against the clock, so
 * the bar ticks on its own while it has one.
 */
export function SessionProgress({
  done,
  total,
  unit,
  timeLeftLabel,
  onTimeClick,
  expected,
  className = '',
}: {
  done: number
  total: number
  /** Set to caption how many are left (e.g. "sets"); omit for a bar with no labels. */
  unit?: string
  timeLeftLabel?: string | null
  onTimeClick?: () => void
  /** The fraction of the bar the projection says should be filled at `now` (epoch ms). */
  expected?: (now: number) => number | null
  className?: string
}) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
  const left = Math.max(0, total - done)
  const captioned = !!unit || !!timeLeftLabel
  const label = useControlLabel('list')
  const paced = expected != null
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!paced) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [paced])
  const mark = expected?.(Math.max(now, Date.now())) ?? null
  return (
    <div className={className}>
      <div className="relative">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          {/* Deep green, a step below the CTA's dark green: the bar is a glanceable
              reference, not something to pull the eye mid-set. */}
          <div className="h-full rounded-full bg-accent-deep transition-all" style={{ width: `${fraction * 100}%` }} />
        </div>
        {/* Where the projection has you by now: a hairline standing a little proud
            of the bar, so it reads over the fill and over the empty track alike.
            The accent's own lighter step, so it follows the theme. */}
        {mark != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-accent-bright transition-[left] duration-500"
            style={{ left: `${Math.max(0, Math.min(1, mark)) * 100}%` }}
          />
        )}
      </div>
      {captioned && (
        <div className="mt-2 flex items-center justify-between gap-3 text-base font-medium text-neutral-400">
          {unit && (
            <span className="tabular-nums">
              {left} {unit} left
            </span>
          )}
          {timeLeftLabel && (onTimeClick ? (
            <button
              onClick={(event) => { event.stopPropagation(); label.used(); onTimeClick() }}
              aria-label={`${timeLeftLabel.replace(/^~/, '')}. View checklist`}
              aria-haspopup="dialog"
              className="ml-auto flex min-h-[44px] items-center rounded-xl bg-surface-2 px-4 font-semibold tabular-nums text-neutral-200 active:text-accent-2"
            >
              {timeLeftLabel.replace(/^~/, '')}
              <ControlWord show={label.show} word={`· ${label.word}`} layout="inline" />
            </button>
          ) : <span className="ml-auto tabular-nums">{timeLeftLabel.replace(/^~/, '')}</span>)}
        </div>
      )}
    </div>
  )
}
