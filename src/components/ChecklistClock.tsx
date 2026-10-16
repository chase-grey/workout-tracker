import { useEffect, useState } from 'react'
import type { WorkoutSplit } from '../lib/estimate'
import { clockText } from '../lib/setClock'

/**
 * The checklist's head: how long you've been working and resting so far, and how
 * much of each the estimate says is still ahead. Ticks on its own, since the sheet
 * holds the session still underneath it.
 */
export function ChecklistClock({ startedAt, readRestSec, left }: {
  startedAt?: string
  /** Rest taken so far, including one still on screen. */
  readRestSec: (now: number) => number
  left: Pick<WorkoutSplit, 'activeSec' | 'restSec'>
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const start = startedAt ? Date.parse(startedAt) : NaN
  const elapsed = Number.isFinite(start) ? Math.max(0, (now - start) / 1000) : null
  const rest = elapsed == null ? null : Math.min(elapsed, Math.max(0, readRestSec(now)))
  const rows = [
    { label: 'working out', soFar: elapsed == null || rest == null ? null : elapsed - rest, left: left.activeSec },
    { label: 'resting', soFar: rest, left: left.restSec },
  ]

  return (
    <table className="mb-3 w-full text-left text-sm">
      <thead className="text-xs text-neutral-500">
        <tr><th className="pb-1 font-normal" /><th className="pb-1 text-right font-normal">so far</th><th className="pb-1 text-right font-normal">left</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th className="py-0.5 font-medium">{row.label}</th>
            <td className="py-0.5 text-right font-semibold tabular-nums">{row.soFar == null ? '—' : clockText(row.soFar)}</td>
            <td className="py-0.5 text-right tabular-nums text-neutral-400">{clockText(row.left)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
