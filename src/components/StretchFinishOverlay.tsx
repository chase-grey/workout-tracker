import { MdEmojiEvents, MdStars } from 'react-icons/md'
import type { StretchFinishSummary } from '../store/DataContext'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import { Confetti } from './Confetti'
import { SessionTimeCard } from './SessionTimeCard'

const GREENS = ['#16a34a', '#22c55e', '#4ade80', '#86efac']
const GOLDS = ['#fbbf24', '#f59e0b', '#fde68a']

/**
 * Full-screen recap shown the moment a Stretch + Core session is finished, before
 * dropping back to the Today menu.
 *
 * Built to read as the same screen the workout finishes on (see
 * WorkoutFinishOverlay): what the session earned first, in gold and with confetti,
 * then the time spent split into stretching and resting, each half beside what the
 * routine was projected to cost.
 *
 * What differs is only what a stretch has to report. A PR here is a pose gone
 * deeper than it has ever been, in degrees, and the core block's plate PRs sit in
 * the same card as them because both are bests this one session beat. Ahead of
 * both goes a goal crossed off the flexibility ladder, which is the biggest thing
 * a stretch can report and doesn't come round often.
 *
 * Stays until dismissed: a recap to read, not a flash to enjoy.
 */
export function StretchFinishOverlay({
  summary,
  onClose,
}: {
  summary: StretchFinishSummary
  onClose: () => void
}) {
  const { routine, withCore, anglePRs, flexGoals, prs, totalSec, activeSec, restSec, projected } =
    summary
  // One card, whichever kind of best was beaten: a deeper angle and a heavier
  // plate are the same news, and two gold boxes saying "new pr" would only make
  // the reader work out why there are two.
  const records = [
    ...anglePRs.map((p) => ({ key: `angle:${p.pose}`, name: p.pose, value: `${p.deg}°` })),
    ...prs.map((p) => ({ key: `lift:${p.exercise}`, name: p.exercise, value: `${p.est1RM} lbs` })),
  ]
  const hasPRs = records.length > 0
  // A goal crossed leads the screen and earns the gold the same way a PR does —
  // it's the loudest thing a stretch can report (see flexCelebration, which ranks
  // it ahead of a PR in the composed cheer).
  const hasWins = hasPRs || flexGoals.length > 0
  // The card that opens the screen sits a little further off the title than the
  // ones stacked under it, and which card that is depends on what was earned.
  const gap = (first: boolean) => (first ? 'mt-6' : 'mt-5')

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-black/95 px-6 py-8">
      {hasWins && <Confetti count={72} colors={[...GOLDS, ...GREENS, '#ffffff']} />}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex flex-col items-center text-center">
          <MdEmojiEvents
            className={`text-5xl ${hasWins ? 'text-amber-400' : 'text-accent-2'}`}
            aria-hidden
          />
          <h1 className="mt-3 text-3xl font-black leading-tight">
            {withCore ? 'stretch + core complete' : 'stretch complete'}
          </h1>
          <p className="mt-1 text-sm tracking-wider text-neutral-500">
            {FLEX_ROUTINES[routine].label}
          </p>
        </div>

        {flexGoals.length > 0 && (
          <div className={`${gap(true)} rounded-2xl border border-accent/40 bg-surface p-4`}>
            <div className="flex items-center gap-2 text-accent">
              <MdStars className="text-xl" aria-hidden />
              <span className="text-sm font-bold tracking-wider">
                {flexGoals.length > 1 ? 'goals complete' : 'goal complete'}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {flexGoals.map((g) => (
                <li key={g.label} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-neutral-200">{g.label}</span>
                  <span className="tabular-nums text-sm font-bold text-accent">{g.deg}°</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasPRs && (
          <div
            className={`${gap(flexGoals.length === 0)} rounded-2xl border border-amber-400/50 bg-surface p-4`}
          >
            <div className="flex items-center gap-2 text-amber-400">
              <MdEmojiEvents className="text-xl" aria-hidden />
              <span className="text-sm font-bold tracking-wider">
                {records.length > 1 ? 'new prs' : 'new pr'}
              </span>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {records.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-neutral-100">{r.name}</span>
                  <span className="tabular-nums font-black text-amber-300">{r.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <SessionTimeCard
          totalSec={totalSec}
          activeSec={activeSec}
          restSec={restSec}
          projected={projected}
          activeLabel="stretching"
        />

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
