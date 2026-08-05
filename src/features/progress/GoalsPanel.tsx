import { useEffect, useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../../store/DataContext'
import { project, type Projection } from '../../lib/predictions'
import { combinedRepsSeries } from '../../lib/progress'
import { absExerciseKeys } from '../../config/plan'
import { buildGoals, GOAL_IDS, isReached, type GoalSpec } from '../../lib/goals'
import {
  lockProjection,
  maybeLock,
  paceAgainstLock,
  projectedSeries,
  type LockedProjection,
  type LockedProjections,
} from '../../lib/goalLock'
import { fmtDateLabel, LINE_PRIMARY, LINE_SECONDARY, niceScale, timeXAxis, withTime } from '../../lib/chart'
import { AxisBreak } from '../../components/AxisBreak'
import {
  personalSixPackTarget,
  type VisibilityObservation,
} from '../../lib/bodyComp'
import { MdCelebration, MdRefresh } from 'react-icons/md'

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

const axisTick = { fill: '#737373', fontSize: 10 }
const tooltipStyle = { background: '#171717', border: '1px solid #333', borderRadius: 12 }

/** Merge the actual series with the locked projection into one row per date. */
function mergeActualProjected(actual: { date: string; value: number }[], projected: { date: string; value: number }[]) {
  const m = new Map<string, { date: string; actual?: number; projected?: number }>()
  for (const p of actual) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), actual: p.value })
  for (const p of projected) m.set(p.date, { ...(m.get(p.date) ?? { date: p.date }), projected: p.value })
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * Actual vs. projected for a locked goal: the real series against the straight
 * line the lock committed to. Only drawn from the lock date onward — the history
 * before the lock isn't something the projection was ever measured against.
 */
function LockChart({ lock, actual }: { lock: LockedProjection; actual: { date: string; value: number }[] }) {
  const rows = useMemo(() => {
    const since = actual.filter((p) => p.date >= lock.lockedAt)
    return withTime(mergeActualProjected(since, projectedSeries(lock)))
  }, [lock, actual])

  const yScale = useMemo(
    () => niceScale(rows.flatMap((r) => [r.actual, r.projected]).filter((v): v is number => v != null)),
    [rows],
  )

  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-1">
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} tick={axisTick} />
          <YAxis
            tick={axisTick}
            width={40}
            domain={yScale.domain}
            ticks={yScale.ticks}
            allowDecimals={false}
            interval={0}
          />
          <AxisBreak broken={yScale.broken} bg="#262626" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: '#a3a3a3' }}
            labelFormatter={(ms) => fmtDateLabel(Number(ms))}
          />
          <Line
            type="monotone"
            dataKey="projected"
            name="projected"
            stroke={LINE_SECONDARY}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="actual"
            stroke={LINE_PRIMARY}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * One goal. Until its ETA comes within {@link LOCK_HORIZON_MONTHS} it shows the
 * live projection; from then on the projection is locked and the row shows how
 * the real numbers are tracking against it, with a chart of actual vs projected
 * and a button to re-lock from today's data.
 */
function GoalRow({
  goal,
  proj,
  lock,
  onRecalculate,
  children,
}: {
  goal: GoalSpec
  proj: Projection
  lock?: LockedProjection
  onRecalculate: () => void
  children?: React.ReactNode
}) {
  const has = Number.isFinite(proj.current)
  const reached = isReached(goal)
  // A lock froze the target it committed to. Bench/squat targets track bodyweight,
  // so the live one can drift away from it — show the number the pace reading is
  // actually measured against, or the two would contradict each other.
  const shownTarget = lock ? lock.target : goal.target
  // The date of the latest reading: the pace is measured against the line on that
  // date, not against today, so a goal sits where the last session left it rather
  // than drifting behind as rest days pass (see paceAgainstLock).
  const lastReadingDate = goal.points.length ? goal.points[goal.points.length - 1].date : null
  const pace =
    lock && has && !reached && lastReadingDate
      ? paceAgainstLock(lock, proj.current, lastReadingDate, proj.slopePerWeek)
      : null
  // Gaining toward the target but, once the pace is allowed to decay, not fast
  // enough to actually reach it — distinct from flat or moving away.
  const gainingButShort =
    has &&
    !proj.onTrack &&
    !proj.basis.thin &&
    proj.slopePerWeek !== 0 &&
    Math.sign(goal.target - proj.current) === Math.sign(proj.slopePerWeek)

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-semibold">{goal.title}</h4>
        <span className="text-sm text-neutral-400 tabular-nums">
          {has ? `${proj.current}` : '—'} → {shownTarget} {goal.unit}
        </span>
      </div>

      {reached ? (
        <p className="mt-1 text-sm text-accent-2">
          <MdCelebration className="inline align-text-bottom mr-1" aria-hidden />
          goal reached!
        </p>
      ) : lock ? (
        <>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-sm text-neutral-300">
              locked eta {fmtDate(lock.etaDate)}
              {pace && pace.revisedEta && pace.revisedEta !== lock.etaDate && (
                <span className="text-neutral-500"> · at this pace {fmtDate(pace.revisedEta)}</span>
              )}
            </p>
            <button
              onClick={onRecalculate}
              aria-label="recalculate time left"
              className="shrink-0 rounded-lg bg-surface-2 p-1.5 text-base text-neutral-400 active:opacity-70"
            >
              <MdRefresh aria-hidden />
            </button>
          </div>
          {pace && (
            <p
              className={`mt-1 text-sm font-medium ${
                pace.status === 'behind' ? 'text-amber-400' : 'text-accent-2'
              }`}
            >
              {pace.status === 'on'
                ? 'right on the line'
                : pace.status === 'ahead'
                  ? `${Math.abs(pace.aheadBy)} ${goal.unit} ahead of the line`
                  : `${Math.abs(pace.aheadBy)} ${goal.unit} behind the line`}
            </p>
          )}
          <LockChart lock={lock} actual={goal.points} />
        </>
      ) : proj.onTrack ? (
        <p className="mt-1 text-sm text-accent-2">
          on track · eta {fmtDate(proj.etaDate)} ({proj.slopePerWeek > 0 ? '+' : ''}
          {proj.slopePerWeek} {goal.unit}/wk)
        </p>
      ) : (
        <p className="mt-1 text-sm text-neutral-500">
          {!has
            ? 'log data to project this.'
            : proj.basis.thin
              ? 'not enough recent data to project.'
              : gainingButShort
                ? 'gaining, but not fast enough to reach this yet.'
                : 'not trending toward this yet — keep at it.'}
        </p>
      )}

      {children}
    </div>
  )
}

export function GoalsPanel() {
  const { workouts, bodyWeights, measurements, settings, plan, updateSettings } = useData()
  const heightIn = settings.heightIn ?? 0

  const goals = useMemo(
    () => buildGoals({ workouts, bodyWeights, measurements, heightIn }),
    [workouts, bodyWeights, measurements, heightIn],
  )

  const projections = useMemo(
    () => new Map(goals.map((g) => [g.id, project(g.points, g.target, undefined, undefined, g.decayPerWeek)])),
    [goals],
  )

  const locked = settings.lockedGoals ?? {}

  // Lock any goal that has just come inside the horizon. Done as an effect rather
  // than during render because it writes settings — and only when something
  // actually changed, so it can't loop.
  useEffect(() => {
    const next: LockedProjections = { ...locked }
    let changed = false
    for (const g of goals) {
      const proj = projections.get(g.id)
      if (!proj) continue
      const lock = maybeLock(next[g.id], g.id, proj)
      if (lock && !next[g.id]) {
        next[g.id] = lock
        changed = true
      }
    }
    if (changed) updateSettings({ ...settings, lockedGoals: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, projections])

  const recalculate = (goal: GoalSpec) => {
    const proj = projections.get(goal.id)
    if (!proj) return
    const fresh = lockProjection(goal.id, proj)
    const next: LockedProjections = { ...locked }
    if (fresh) next[goal.id] = fresh
    else delete next[goal.id]
    updateSettings({ ...settings, lockedGoals: next })
  }

  // Bespoke context lines that hang off particular goals.
  const { leanest } = personalSixPackTarget(measurements, heightIn)
  const absReps = combinedRepsSeries(workouts, absExerciseKeys(plan))

  const extras: Record<string, React.ReactNode> = {
    [GOAL_IDS.sixPack]: (
      <>
        {leanest && (
          <p className="mt-2 text-xs text-neutral-500">
            leanest logged: {leanest.bodyFat}% on {fmtDate(leanest.date)} → {VIS_TEXT[leanest.visibility]}.
            {leanest.visibility !== 'clear' && ' building ab muscle raises the bf% where they show.'}
          </p>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          {absReps.length > 0
            ? `ab work: ${absReps[0].value}${
                absReps.length > 1 ? ` → ${absReps[absReps.length - 1].value}` : ''
              } reps/session.`
            : 'ab work: none logged — do your core exercises or a stretch + core session to build ab muscle.'}
        </p>
        {heightIn === 0 && (
          <p className="mt-1 text-xs text-neutral-600">
            set your height in settings so tape measurements also feed this.
          </p>
        )}
      </>
    ),
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-wider text-neutral-500">goals</h3>
      {goals.map((g) => {
        const proj = projections.get(g.id)!
        return (
          <GoalRow
            key={g.id}
            goal={g}
            proj={proj}
            lock={locked[g.id]}
            onRecalculate={() => recalculate(g)}
          >
            {extras[g.id]}
          </GoalRow>
        )
      })}
    </div>
  )
}
