import { useData } from '../../store/DataContext'
import { project, type Projection } from '../../lib/predictions'
import { exerciseSeries, combinedRepsSeries } from '../../lib/progress'
import { absExerciseKeys } from '../../config/plan'
import {
  bodyFatSeries,
  personalSixPackTarget,
  type VisibilityObservation,
} from '../../lib/bodyComp'
import { MdCelebration } from 'react-icons/md'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

const VIS_TEXT: Record<VisibilityObservation['visibility'], string> = {
  none: 'abs not visible',
  faint: 'abs faintly visible',
  clear: 'abs clearly visible',
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
        <p className="mt-1 text-sm text-accent-2">
          <MdCelebration className="inline align-text-bottom mr-1" aria-hidden />
          Goal reached!
        </p>
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
  const { workouts, bodyWeights, measurements, settings, plan } = useData()
  const heightIn = settings.heightIn ?? 0

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

  // Visible six-pack: gated by BOTH body-fat % and ab-muscle thickness. The
  // target is derived empirically from the leanest visibility observation
  // (see personalSixPackTarget) rather than a fixed generic number.
  const bfPoints = bodyFatSeries(measurements, heightIn)
  const { target: bfTarget, leanest } = personalSixPackTarget(measurements, heightIn)
  const bfGoal = project(bfPoints, bfTarget)
  // Ab work = total reps across ALL core exercises (cable crunch, hanging leg
  // raise, deadbug, …), not just the dedicated Core-day move.
  const absReps = combinedRepsSeries(workouts, absExerciseKeys(plan))

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
          <h4 className="font-semibold">6-pack abs</h4>
          <span className="text-sm text-neutral-400 tabular-nums">
            {Number.isFinite(bfGoal.current) ? `${bfGoal.current}` : '—'} → {bfTarget}% BF
          </span>
        </div>

        {bfGoal.onTrack && bfGoal.etaWeeks === 0 ? (
          <p className="mt-1 text-sm text-accent-2">
            <MdCelebration className="inline align-text-bottom mr-1" aria-hidden />
            Leanness target reached — keep building abs!
          </p>
        ) : bfGoal.onTrack ? (
          <p className="mt-1 text-sm text-accent-2">
            On track · ETA {fmtDate(bfGoal.etaDate)} ({bfGoal.slopePerWeek > 0 ? '+' : ''}
            {bfGoal.slopePerWeek} %/wk)
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">
            {Number.isFinite(bfGoal.current)
              ? 'Not trending down yet — log measurements as you lean out.'
              : 'Log a measurement with ab visibility to project this.'}
          </p>
        )}

        {leanest && (
          <p className="mt-2 text-xs text-neutral-500">
            Leanest: {leanest.bodyFat}% ({fmtDate(leanest.date)}), {VIS_TEXT[leanest.visibility]}.
          </p>
        )}

        <p className="mt-1 text-xs text-neutral-500">
          {absReps.length > 0
            ? `Abs: ${absReps[0].value}${
                absReps.length > 1 ? ` → ${absReps[absReps.length - 1].value}` : ''
              } reps/session`
            : 'Abs: none logged'}
        </p>

        {heightIn === 0 && (
          <p className="mt-1 text-xs text-neutral-600">Set height in Settings.</p>
        )}
      </div>
    </div>
  )
}
