import { useData } from '../../store/DataContext'
import { weeklySummary } from '../../lib/summary'
import { caloriePR } from '../../lib/calories'
import { MdEmojiEvents } from 'react-icons/md'

/**
 * Compact "this week" summary card for the Today home screen: workout count,
 * new PRs, and body-weight trend. Self-contained — reads from `useData()`.
 */
export function WeeklySummary() {
  const { workouts, bodyWeights, flexEntries, calorieEntries } = useData()
  const summary = weeklySummary(
    workouts,
    bodyWeights,
    new Date(),
    flexEntries.map((f) => f.date),
  )
  const calPR = caloriePR(calorieEntries)

  const isEmpty = summary.workoutCount === 0 && summary.weightTrend === null && !calPR

  return (
    <div className="rounded-2xl bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">This week</h2>

      {isEmpty ? (
        <p className="mt-2 text-sm text-neutral-500">No activity logged yet this week.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-lg font-bold tabular-nums">
            {summary.workoutCount} {summary.workoutCount === 1 ? 'session' : 'sessions'}
          </p>

          {summary.prs.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {summary.prs.map((pr) => (
                <li key={pr.exercise} className="text-accent-2">
                  <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
                  {pr.exercise} — {pr.est1RM} lbs est. 1RM
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500">No PRs yet this week</p>
          )}

          {calPR && (
            <p className="text-sm text-accent-2">
              <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
              Calories — {calPR.calories} cal (best bulk day!)
            </p>
          )}

          {summary.weightTrend !== null && (
            <p className="text-sm text-neutral-500">
              Weight{' '}
              <span className="font-medium tabular-nums text-accent">
                {summary.weightTrend > 0 ? '+' : ''}
                {summary.weightTrend}
              </span>{' '}
              lbs
            </p>
          )}
        </div>
      )}
    </div>
  )
}
