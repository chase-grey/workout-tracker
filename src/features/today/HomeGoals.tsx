import { MdAcUnit, MdCheckCircle, MdLocalFireDepartment, MdStar } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { classifyWeek } from '../../lib/weeklyStreak'

function MetricBar({
  label,
  value,
  goal,
  suffix,
}: {
  label: string
  value: number
  goal: number
  suffix?: string
}) {
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

export function HomeGoals() {
  const { weekProgress: wp, goals, streaks } = useData()

  const overallToGoal =
    (Math.min(wp.workouts, goals.workouts) / goals.workouts +
      Math.min(wp.flex, goals.flex) / goals.flex +
      Math.min(wp.calDays, goals.calDays) / goals.calDays) /
    3
  const midpointFrac =
    (goals.halfWorkouts / goals.workouts +
      goals.halfFlex / goals.flex +
      goals.halfCalDays / goals.calDays) /
    3

  const { tier, exceeded } = classifyWeek(wp, goals)
  const status =
    tier === 'under'
      ? 'Keep going — reach the midpoint'
      : tier === 'half'
        ? 'Midpoint reached — push for your goal'
        : exceeded
          ? 'Over your goal — freeze earned! ❄️'
          : 'Goal hit for the week! 🎉'

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
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

      {/* milestone bar: start → midpoint → goal → over */}
      <div className="relative h-3 rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
          style={{ width: `${overallToGoal * 100}%` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-neutral-500" style={{ left: `${midpointFrac * 100}%` }} />
        <div className="absolute inset-y-0 right-0 w-0.5 bg-accent-2" />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-neutral-500">
        <span>start</span>
        <span>midpoint</span>
        <span>goal</span>
      </div>

      <p className={`mt-2 text-sm font-medium ${tier === 'full' ? 'text-accent-2' : 'text-neutral-300'}`}>
        {status}
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <MetricBar label="Workouts" value={wp.workouts} goal={goals.workouts} />
        <MetricBar label="Flex sessions" value={wp.flex} goal={goals.flex} />
        <MetricBar label="Calorie days" value={wp.calDays} goal={goals.calDays} suffix=" days" />
      </div>
    </div>
  )
}
