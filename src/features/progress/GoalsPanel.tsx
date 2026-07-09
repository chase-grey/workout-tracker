import { useData } from '../../store/DataContext'
import { project, type Projection } from '../../lib/predictions'
import { exerciseSeries } from '../../lib/progress'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

function GoalRow({
  title,
  unit,
  proj,
}: {
  title: string
  unit: string
  proj: Projection
}) {
  const has = Number.isFinite(proj.current)
  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h4 className="font-semibold">{title}</h4>
        <span className="text-sm text-neutral-400 tabular-nums">
          {has ? `${proj.current}` : '—'} → {proj.target} {unit}
        </span>
      </div>
      {proj.onTrack && proj.etaWeeks === 0 ? (
        <p className="mt-1 text-sm text-accent-2">🎉 Goal reached!</p>
      ) : proj.onTrack ? (
        <p className="mt-1 text-sm text-accent-2">
          On track · ETA {fmtDate(proj.etaDate)} ({proj.slopePerWeek > 0 ? '+' : ''}
          {proj.slopePerWeek} {unit}/wk)
        </p>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">
          {has ? 'Not trending toward this yet — keep at it.' : 'Log data to project this.'}
        </p>
      )}
    </div>
  )
}

export function GoalsPanel() {
  const { workouts, bodyWeights } = useData()

  // Guard against implausible weigh-ins (e.g. stray test rows) skewing the fit.
  const bwPoints = bodyWeights
    .filter((b) => b.weightLbs >= 50)
    .map((b) => ({ date: b.date, value: b.weightLbs }))
  const currentBw = bwPoints.length ? bwPoints[bwPoints.length - 1].value : 0

  const benchPoints = exerciseSeries(workouts, 'flat_bench', '1rm')

  const goal180 = project(bwPoints, 180)
  const goal190 = project(bwPoints, 190)
  // Bench your bodyweight: target = current bodyweight (moving goal).
  const benchGoal = project(benchPoints, currentBw || 999)

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Goals</h3>
      <GoalRow title="Bodyweight → 180" unit="lbs" proj={goal180} />
      <GoalRow title="Bodyweight → 190" unit="lbs" proj={goal190} />
      <GoalRow
        title={`Bench your bodyweight (${currentBw || '—'} lbs)`}
        unit="lbs"
        proj={benchGoal}
      />
      <div className="rounded-2xl bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h4 className="font-semibold">Visible 6-pack abs</h4>
          <span className="text-sm text-neutral-400">photo milestone</span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Not predictable from lifts (it's driven by body-fat %). Keep body weight in range, train abs,
          and use the progress-photo reminders on the Today tab to judge it.
        </p>
      </div>
    </div>
  )
}
