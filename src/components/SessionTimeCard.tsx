import { MdTimer } from 'react-icons/md'
import type { WorkoutSplit } from '../lib/estimate'

/** Seconds → "38 min" / "1 hr 5 min" / "<1 min". */
function fmtMin(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 1) return '<1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/**
 * How long a finished session took, split into the work and the waiting, each
 * half set beside what the estimator had projected it would be.
 *
 * Shared by both finish recaps so a workout and a stretch report their clock the
 * same way — same card, same ordering, same projections underneath. The only
 * thing that differs is what the working half is called: you rest between sets
 * either way, but the other half is lifting in one and stretching in the other.
 *
 * The projections are omitted wholesale when there are none: a session finished
 * by something that doesn't price its own steps has nothing to compare against,
 * and a row of "projected —" would read as a projection of nothing. A session
 * with no clock at all — one resumed from a snapshot that predates the app
 * recording when a session began — drops the card rather than reporting zero,
 * which would read as a workout that took no time.
 */
export function SessionTimeCard({
  totalSec,
  activeSec,
  restSec,
  projected,
  activeLabel = 'active',
}: {
  totalSec: number
  activeSec: number
  restSec: number
  projected: WorkoutSplit | null
  activeLabel?: string
}) {
  if (!(totalSec > 0)) return null
  return (
    <div className="mt-5 rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 text-accent-2">
          <MdTimer className="text-xl" aria-hidden />
          <span className="text-sm font-bold tracking-wider">time · {fmtMin(totalSec)}</span>
        </div>
        {projected && (
          <span className="text-[11px] text-neutral-500">projected {fmtMin(projected.totalSec)}</span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center rounded-2xl bg-surface-2 px-2 py-3 text-center">
          <span className="text-xl font-black text-accent-2">{fmtMin(activeSec)}</span>
          <span className="mt-0.5 text-[11px] leading-tight text-neutral-400">{activeLabel}</span>
          {projected && (
            <span className="mt-1 text-[10px] leading-tight text-neutral-500">
              projected {fmtMin(projected.activeSec)}
            </span>
          )}
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-surface-2 px-2 py-3 text-center">
          <span className="text-xl font-black text-amber-400">{fmtMin(restSec)}</span>
          <span className="mt-0.5 text-[11px] leading-tight text-neutral-400">resting</span>
          {projected && (
            <span className="mt-1 text-[10px] leading-tight text-neutral-500">
              projected {fmtMin(projected.restSec)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
