import { MdAcUnit, MdCheckCircle, MdEmojiEvents, MdLocalFireDepartment, MdStar } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { weeklySummary } from '../../lib/summary'
import { caloriePR } from '../../lib/calories'
import { weekElapsedFraction } from '../../lib/dates'

function MetricBar({ label, value, goal, suffix }: { label: string; value: number; goal: number; suffix?: string }) {
  const met = value >= goal
  const over = value > goal
  const pct = Math.min(value / goal, 1) * 100
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-neutral-300">{label}</span>
        <span className="tabular-nums text-neutral-400">
          {value}/{goal}
          {suffix ?? ''}{' '}
          {over ? (
            <MdStar className="inline align-text-bottom text-accent-2" aria-hidden />
          ) : met ? (
            <MdCheckCircle className="inline align-text-bottom text-accent-2" aria-hidden />
          ) : null}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ThisWeek() {
  const { weekProgress: wp, goals, streaks, workouts, bodyWeights, flexEntries, calorieEntries } = useData()

  const summary = weeklySummary(workouts, bodyWeights, new Date(), flexEntries.map((f) => f.date))
  const calPR = caloriePR(calorieEntries)
  const hasPRs = summary.prs.length > 0 || calPR != null

  const overallToGoal =
    (Math.min(wp.workouts, goals.workouts) / goals.workouts +
      Math.min(wp.flex, goals.flex) / goals.flex +
      Math.min(wp.calDays, goals.calDays) / goals.calDays) /
    3
  const checkpointFrac =
    (goals.halfWorkouts / goals.workouts + goals.halfFlex / goals.flex + goals.halfCalDays / goals.calDays) / 3
  const pace = weekElapsedFraction()

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">This week</h2>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <span className="flex items-center gap-1 text-accent">
            <MdLocalFireDepartment aria-hidden /> {streaks.streak}
          </span>
          <span className="flex items-center gap-1 text-neutral-300">
            <MdAcUnit aria-hidden /> {streaks.freezes}
          </span>
        </div>
      </div>

      {/* Milestone bar: fill = progress; white line = on-pace for now; markers for checkpoint & goal. */}
      <div className="relative h-3 rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
          style={{ width: `${overallToGoal * 100}%` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-neutral-500" style={{ left: `${checkpointFrac * 100}%` }} />
        <div className="absolute inset-y-0 right-0 w-0.5 bg-accent-2" />
        <div
          className="absolute -top-0.5 h-4 w-0.5 -translate-x-1/2 rounded bg-white"
          style={{ left: `${pace * 100}%` }}
          title="on-pace for now"
        />
      </div>
      <div className="relative mt-1 h-3 text-[10px] uppercase tracking-wide text-neutral-500">
        <span className="absolute -translate-x-1/2" style={{ left: `${checkpointFrac * 100}%` }}>
          checkpoint
        </span>
        <span className="absolute right-0">goal</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <MetricBar label="Workouts" value={wp.workouts} goal={goals.workouts} />
        <MetricBar label="Flex sessions" value={wp.flex} goal={goals.flex} />
        <MetricBar label="Calorie days" value={wp.calDays} goal={goals.calDays} suffix=" days" />
      </div>

      {summary.weightTrend !== null && (
        <p className="mt-2 text-sm text-neutral-400">
          Weight{' '}
          <span className="font-semibold tabular-nums text-accent">
            {summary.weightTrend > 0 ? '+' : ''}
            {summary.weightTrend}
          </span>{' '}
          lbs this week
        </p>
      )}

      {hasPRs && (
        <ul className="mt-2 space-y-1 text-sm">
          {summary.prs.map((pr) => (
            <li key={pr.exercise} className="text-accent-2">
              <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
              {pr.exercise} — {pr.est1RM} lbs est. 1RM
            </li>
          ))}
          {calPR && (
            <li className="text-accent-2">
              <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
              Calories — {calPR.calories} cal (best bulk day!)
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
