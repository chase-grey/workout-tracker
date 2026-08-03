import { MdBolt, MdEmojiEvents, MdFlag, MdTimer, MdTrendingDown, MdTrendingUp } from 'react-icons/md'
import type { WorkoutFinishSummary } from '../store/DataContext'
import { Confetti } from './Confetti'

const GREENS = ['#16a34a', '#22c55e', '#4ade80', '#86efac']
const GOLDS = ['#fbbf24', '#f59e0b', '#fde68a']

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
 * Full-screen recap shown the moment a workout is finished, before dropping back
 * to the Today menu. It leads with any PRs set this session (gold, with
 * confetti), then the time spent split into active vs resting, then the new
 * baselines the session set. Stays until dismissed — a recap to read, not a
 * flash to enjoy. Deliberately omits total volume.
 */
export function WorkoutFinishOverlay({
  summary,
  onClose,
}: {
  summary: WorkoutFinishSummary
  onClose: () => void
}) {
  const { prs, baselines, totalSec, activeSec, restSec, goalPace, notes } = summary
  const hasPRs = prs.length > 0

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-black/95 px-6 py-8">
      {hasPRs && <Confetti count={72} colors={[...GOLDS, ...GREENS, '#ffffff']} />}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <MdEmojiEvents className={`text-5xl ${hasPRs ? 'text-amber-400' : 'text-accent-2'}`} aria-hidden />
          <h1 className="mt-3 text-3xl font-black leading-tight">workout complete</h1>
        </div>

        {hasPRs && (
          <div className="mt-6 rounded-2xl border border-amber-400/50 bg-surface p-4">
            <div className="flex items-center gap-2 text-amber-400">
              <MdEmojiEvents className="text-xl" aria-hidden />
              <span className="text-sm font-bold tracking-wider">
                {prs.length > 1 ? 'new prs' : 'new pr'}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {prs.map((p) => (
                <li key={p.exercise} className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-neutral-100">{p.exercise}</span>
                  <span className="tabular-nums font-black text-amber-300">{p.est1RM} lbs</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-surface p-4">
          <div className="flex items-center gap-2 text-accent-2">
            <MdTimer className="text-xl" aria-hidden />
            <span className="text-sm font-bold tracking-wider">time · {fmtMin(totalSec)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center rounded-2xl bg-surface-2 px-2 py-3 text-center">
              <span className="text-xl font-black text-accent-2">{fmtMin(activeSec)}</span>
              <span className="mt-0.5 text-[11px] leading-tight text-neutral-400">active</span>
            </div>
            <div className="flex flex-col items-center rounded-2xl bg-surface-2 px-2 py-3 text-center">
              <span className="text-xl font-black text-amber-400">{fmtMin(restSec)}</span>
              <span className="mt-0.5 text-[11px] leading-tight text-neutral-400">resting</span>
            </div>
          </div>
        </div>

        {baselines.length > 0 && (
          <div className="mt-5 rounded-2xl border border-accent/40 bg-surface p-4">
            <div className="flex items-center gap-2 text-accent">
              <MdBolt className="text-xl" aria-hidden />
              <span className="text-sm font-bold tracking-wider">
                {baselines.length > 1 ? 'new baselines' : 'new baseline'}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {baselines.map((name) => (
                <li key={name} className="text-sm text-neutral-200">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {goalPace.length > 0 && (
          <div className="mt-5 rounded-2xl bg-surface p-4">
            <div className="flex items-center gap-2 text-neutral-300">
              <MdFlag className="text-xl" aria-hidden />
              <span className="text-sm font-bold tracking-wider">goal pace</span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {goalPace.map((n) => (
                <li key={n.goalId} className="flex items-start gap-2 text-sm">
                  {n.direction === 'slower' ? (
                    <MdTrendingDown className="mt-0.5 shrink-0 text-amber-400" aria-hidden />
                  ) : (
                    <MdTrendingUp className="mt-0.5 shrink-0 text-accent-2" aria-hidden />
                  )}
                  <span className="text-neutral-200">{n.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {notes.length > 0 && (
          <div className="mt-5 rounded-2xl border border-accent-2/40 bg-surface p-4">
            <ul className="flex flex-col gap-1.5">
              {notes.map((n) => (
                <li key={n} className="text-sm font-medium text-accent-2">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={onClose}
          className="mt-8 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black active:bg-accent-2"
        >
          nice
        </button>
      </div>
    </div>
  )
}
