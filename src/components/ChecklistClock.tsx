import { useEffect, useState } from 'react'
import type { WorkoutSplit } from '../lib/estimate'
import { clockText } from '../lib/setClock'

type Halves = Pick<WorkoutSplit, 'activeSec' | 'restSec'>

/**
 * The checklist's head: how long you've been working and resting so far, how long
 * the estimate says that should have taken by the set you're on (see
 * lib/sessionPace), and how much of each it says is still ahead. So far against
 * projected is behind or ahead, and the total row says it in one pair of numbers.
 * Ticks on its own, since the sheet holds the session still underneath it.
 */
export function ChecklistClock({ startedAt, readRestSec, readPhotoSec, projected, left }: {
  startedAt?: string
  /** Time on photo screens so far, which the session's clock leaves out (see lib/photoTime). */
  readPhotoSec?: (now: number) => number
  /** Rest taken so far, including one still on screen. */
  readRestSec: (now: number) => number
  /** What the estimate says should have passed by this point. */
  projected: Halves
  left: Halves
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const start = startedAt ? Date.parse(startedAt) : NaN
  const elapsed = Number.isFinite(start) ? Math.max(0, (now - start) / 1000 - (readPhotoSec?.(now) ?? 0)) : null
  const rest = elapsed == null ? null : Math.min(elapsed, Math.max(0, readRestSec(now)))
  const rows = [
    { label: 'working out', soFar: elapsed == null || rest == null ? null : elapsed - rest, projected: projected.activeSec, left: left.activeSec },
    { label: 'resting', soFar: rest, projected: projected.restSec, left: left.restSec },
    { label: 'total', soFar: elapsed, projected: projected.activeSec + projected.restSec, left: left.activeSec + left.restSec },
  ]

  return (
    <table className="mb-3 w-full text-left text-sm">
      <thead className="text-xs text-neutral-500">
        <tr>
          <th className="pb-1 font-normal" />
          <th className="pb-1 text-right font-normal">so far</th>
          <th className="pb-1 text-right font-normal">projected</th>
          <th className="pb-1 text-right font-normal">left</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className={row.label === 'total' ? 'border-t border-neutral-200/10' : ''}>
            <th className="py-0.5 font-medium">{row.label}</th>
            <td className="py-0.5 text-right font-semibold tabular-nums">{row.soFar == null ? '—' : clockText(row.soFar)}</td>
            <td className="py-0.5 text-right tabular-nums text-neutral-400">{clockText(row.projected)}</td>
            <td className="py-0.5 text-right tabular-nums text-neutral-400">{clockText(row.left)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
