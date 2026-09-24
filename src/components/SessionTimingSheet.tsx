import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkoutSplit } from '../lib/estimate'
import type { TimingRow } from '../lib/remainingTiming'
import { useBackGuard } from '../lib/useBackGuard'

function clock(sec: number) {
  const seconds = Math.max(0, Math.floor(sec))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/** Live view of the same wall-clock/rest accounting used by the finish recap. */
export function SessionTimingSheet({ startedAt, readRestSec, projected, remainingSec, remainingRows, onClose }: {
  startedAt?: string
  readRestSec: (now: number) => number
  projected: WorkoutSplit
  remainingSec: number
  remainingRows: TimingRow[]
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [now, setNow] = useState(Date.now)
  useBackGuard(true, onClose)
  useEffect(() => {
    dialog.current?.showModal()
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const start = startedAt ? Date.parse(startedAt) : NaN
  const elapsed = Number.isFinite(start) ? Math.max(0, (now - start) / 1000) : null
  const rest = elapsed == null ? null : Math.min(elapsed, Math.max(0, readRestSec(now)))
  const rows = [
    { label: 'total elapsed', actual: elapsed, expected: projected.totalSec },
    { label: 'exercise time', actual: elapsed == null || rest == null ? null : elapsed - rest, expected: projected.activeSec },
    { label: 'rest time', actual: rest, expected: projected.restSec },
  ]

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="session-timing-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-surface p-5 text-neutral-100 backdrop:bg-black/60"
      style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-3">
          <h2 id="session-timing-title" className="text-lg font-bold">session timing</h2>
          <button autoFocus onClick={onClose} className="min-h-[44px] rounded-xl bg-surface-2 px-4 text-sm font-semibold">close</button>
        </div>
        <div className="my-4 rounded-2xl bg-surface-2 p-4">
          <div className="text-3xl font-black tabular-nums text-accent-2">{elapsed == null ? '—' : clock(elapsed)}</div>
          <div className="mt-1 text-xs text-neutral-400">elapsed · {clock(remainingSec)} estimated remaining</div>
        </div>
        <h3 className="mb-2 font-bold">Remaining checklist · {clock(remainingSec)}</h3>
        <p className="mb-3 text-xs text-neutral-400">Exercise time includes positioning. Rest follows each set; the final set has no rest. Recorded exercise averages are used where available. Future rests use your recorded rest-to-prescription average, or the prescribed rest until there is history. Photos and open-ended pauses are not included.</p>
        <table className="mb-6 w-full text-left text-sm">
          <thead className="text-xs text-neutral-400"><tr><th className="pb-2">Exercise</th><th className="pb-2 text-right">Active</th><th className="pb-2 text-right">Rest</th><th className="pb-2 text-right">Total</th></tr></thead>
          <tbody>{remainingRows.map((row) => (
            <tr key={row.key} className="border-t border-neutral-200/10">
              <th className="py-3 pr-2 font-medium">{row.label}<span className="mt-1 block text-[10px] font-normal text-neutral-400">{row.source}</span></th>
              <td className="text-right tabular-nums">{clock(row.activeSec)}</td><td className="text-right tabular-nums">{clock(row.restSec)}</td><td className="pl-2 text-right font-semibold tabular-nums">{clock(row.totalSec)}</td>
            </tr>
          ))}</tbody>
        </table>
        {remainingRows.length === 0 && <p className="mb-4 text-sm text-neutral-400">All checklist items are complete.</p>}
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-neutral-400">
            <tr><th className="pb-3 font-normal">time</th><th className="pb-3 text-right font-normal">so far</th><th className="pb-3 text-right font-normal">projected total</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-neutral-200/10">
                <th className="py-3 font-medium">{row.label}</th>
                <td className="py-3 text-right font-semibold tabular-nums">{row.actual == null ? '—' : clock(row.actual)}</td>
                <td className="py-3 text-right tabular-nums text-neutral-400">{clock(row.expected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">Times are minutes:seconds. Projections cover the full session. Exercise time includes setup, pauses, and other time outside the rest timer. The session clock continues while these details are open.</p>
        {elapsed == null && <p className="mt-2 text-xs text-neutral-400">Elapsed time is unavailable for this older saved session.</p>}
      </div>
    </dialog>,
    document.body,
  )
}
