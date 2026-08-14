import { useMemo } from 'react'
import {
  MdAcUnit,
  MdCelebration,
  MdCheckCircle,
  MdEmojiEvents,
  MdLocalFireDepartment,
  MdStar,
} from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { weeklySummary } from '../../lib/summary'
import { caloriePR } from '../../lib/calories'
import { buildGoals, goalsHitInWeek } from '../../lib/goals'
import { weekPace, type MetricPace } from '../../lib/weekPace'

/**
 * One metric's row: the fill is what's done, and the pale line is where the
 * week's schedule expects it by now (see lib/weekPace). The numbers go amber
 * either when that line has been passed by without the units banked, or when
 * every remaining day has to land for the goal to still be met — a distinction
 * the overall bar can't make, since it averages the three together.
 */
function MetricBar({ label, m, suffix }: { label: string; m: MetricPace; suffix?: string }) {
  const over = m.done > m.goal
  const pct = Math.min(m.done / m.goal, 1) * 100
  const behind = m.done < m.required
  const tight = !m.met && m.slack <= 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-neutral-300">{label}</span>
        <span className={`tabular-nums ${behind || tight ? 'text-amber-400' : 'text-neutral-400'}`}>
          {m.done}/{m.goal}
          {suffix ?? ''}{' '}
          {over ? (
            <MdStar className="inline align-text-bottom text-accent-2" aria-hidden />
          ) : m.met ? (
            <MdCheckCircle className="inline align-text-bottom text-accent-2" aria-hidden />
          ) : null}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        {m.required > 0 && (
          <div
            // A metric whose window has closed has its whole goal due, putting the
            // line on the far edge — pull it fully inside so it doesn't clip away.
            className={`absolute inset-y-0 w-0.5 ${m.required >= m.goal ? '-translate-x-full' : '-translate-x-1/2'} ${
              behind ? 'bg-amber-400' : 'bg-white/70'
            }`}
            style={{ left: `${Math.min(m.required / m.goal, 1) * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}

/** Short names for the buffer readout, which names the metric that's tightest. */
const METRIC_SHORT: Record<MetricPace['key'], string> = {
  workouts: 'workouts',
  flex: 'flex',
  calDays: 'cal days',
}

export function ThisWeek() {
  const { weekProgress: wp, goals, streaks, workouts, bodyWeights, flexEntries, calorieEntries, measurements, settings } =
    useData()

  const summary = weeklySummary(workouts, bodyWeights, new Date(), flexEntries.map((f) => f.date))
  const calPR = caloriePR(calorieEntries)
  const hasPRs = summary.prs.length > 0 || calPR != null

  // The long-run goals that landed this week, above the week's PRs: a goal
  // reached is the bigger of the two, and it would otherwise show up nowhere but
  // the Goals panel, on whichever row had quietly turned over.
  const heightIn = settings.heightIn ?? 0
  const goalsHit = useMemo(
    () => goalsHitInWeek(buildGoals({ workouts, bodyWeights, measurements, heightIn, flexEntries })),
    [workouts, bodyWeights, measurements, heightIn, flexEntries],
  )

  const overallToGoal =
    (Math.min(wp.workouts, goals.workouts) / goals.workouts +
      Math.min(wp.flex, goals.flex) / goals.flex +
      Math.min(wp.calDays, goals.calDays) / goals.calDays) /
    3
  const checkpointFrac =
    (goals.halfWorkouts / goals.workouts + goals.halfFlex / goals.flex + goals.halfCalDays / goals.calDays) / 3

  // The pace marker used to track elapsed time, which both demanded fractions of
  // a workout mid-Monday and called a week "ahead" that had no days left to spare.
  // It now follows the schedule in whole units, and the buffer beside the streak
  // says whether the week is still comfortably finishable.
  const pace = weekPace(wp, goals)
  const byKey = new Map(pace.metrics.map((m) => [m.key, m]))
  const buffer = pace.binding
    ? pace.binding.missed
      ? `${METRIC_SHORT[pace.binding.key]} missed`
      : pace.buffer <= 0
        ? `${METRIC_SHORT[pace.binding.key]}: no room`
        : `${pace.buffer} spare day${pace.buffer === 1 ? '' : 's'}`
    : null

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500">this week</h2>
        <div className="flex items-center gap-3 text-sm font-semibold">
          {buffer && (
            <span className={`text-xs ${pace.buffer <= 0 ? 'text-amber-400' : 'text-neutral-500'}`}>
              {buffer}
            </span>
          )}
          <span className="flex items-center gap-1 text-accent">
            <MdLocalFireDepartment aria-hidden /> {streaks.streak}
          </span>
          <span className="flex items-center gap-1 text-neutral-300">
            <MdAcUnit aria-hidden /> {streaks.freezes}
          </span>
        </div>
      </div>

      {/* Milestone bar: fill = progress; white line = where the schedule expects you; markers for checkpoint & goal. */}
      <div className="relative h-3 rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
          style={{ width: `${overallToGoal * 100}%` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-neutral-500" style={{ left: `${checkpointFrac * 100}%` }} />
        <div className="absolute inset-y-0 right-0 w-0.5 bg-accent-2" />
        <div
          className="absolute -top-0.5 h-4 w-0.5 -translate-x-1/2 rounded bg-white"
          style={{ left: `${pace.requiredFraction * 100}%` }}
          title="where the week's schedule expects you"
        />
      </div>
      <div className="relative mt-1 h-3 text-[10px] tracking-wide text-neutral-500">
        <span className="absolute -translate-x-1/2" style={{ left: `${checkpointFrac * 100}%` }}>
          checkpoint
        </span>
        <span className="absolute right-0">goal</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <MetricBar label="workouts" m={byKey.get('workouts')!} />
        <MetricBar label="flex sessions" m={byKey.get('flex')!} />
        <MetricBar label="calorie days" m={byKey.get('calDays')!} suffix=" days" />
      </div>

      {summary.weightTrend !== null && (
        <p className="mt-2 text-sm text-neutral-400">
          weight{' '}
          <span className="font-semibold tabular-nums text-accent">
            {summary.weightTrend > 0 ? '+' : ''}
            {summary.weightTrend}
          </span>{' '}
          lbs this week
        </p>
      )}

      {goalsHit.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {goalsHit.map(({ goal }) => (
            <li key={goal.id} className="font-medium text-accent-bright">
              <MdCelebration className="inline align-text-bottom mr-1" aria-hidden />
              {goal.title} — goal reached!
            </li>
          ))}
        </ul>
      )}

      {hasPRs && (
        <ul className="mt-2 space-y-1 text-sm">
          {summary.prs.map((pr) => (
            <li key={pr.exercise} className="text-accent-2">
              <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
              {pr.exercise} — {pr.est1RM} lbs est. 1rm
            </li>
          ))}
          {calPR && (
            <li className="text-accent-2">
              <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
              calories — {calPR.calories} cal (best bulk day!)
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
