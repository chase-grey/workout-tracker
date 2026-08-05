import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../../store/DataContext'
import { project, type Projection } from '../../lib/predictions'
import { combinedRepsSeries, filterRange, type Point } from '../../lib/progress'
import { weeklyCalorieSurplusSeries } from '../../lib/calories'
import { absExerciseKeys } from '../../config/plan'
import { bodyWeightPoints, buildGoals, GOAL_IDS, isReached, type GoalSpec } from '../../lib/goals'
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
import { MetricChart } from './MetricChart'
import { WeightLogSheet } from '../today/WeightLogSheet'
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
 * Actual vs. projected for a locked goal: the whole logged history against the
 * line the lock committed to. The history before the lock isn't something the
 * projection was measured against, but it's the run-up that earned the pace — a
 * chart starting at the lock date shows one or two points and reads as a straight
 * segment. A marker on the lock date separates the two halves.
 */
function LockChart({ lock, actual }: { lock: LockedProjection; actual: { date: string; value: number }[] }) {
  const rows = useMemo(
    () => withTime(mergeActualProjected(actual, projectedSeries(lock))),
    [lock, actual],
  )

  const yScale = useMemo(
    () => niceScale(rows.flatMap((r) => [r.actual, r.projected]).filter((v): v is number => v != null)),
    [rows],
  )

  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-1">
      <ResponsiveContainer width="100%" height={140}>
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
          {/* Where the projection was frozen: history to the left, the commitment
              it's being measured against to the right. */}
          <ReferenceLine
            x={parseISODate(lock.lockedAt).getTime()}
            stroke="#facc15"
            strokeDasharray="3 3"
            label={{ value: 'locked', fill: '#facc15', fontSize: 9, position: 'insideTopRight' }}
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
 * A goal's raw series against its target line, shown when the goal isn't close
 * enough to lock a projection yet — so the history is still visible instead of
 * only a "keep at it" line. No projected line, because there isn't a reliable
 * one to draw.
 */
function DataChart({ points, target, targetLabel }: { points: Point[]; target: number; targetLabel: string }) {
  const rows = useMemo(() => withTime(points), [points])
  const yScale = useMemo(() => niceScale([...points.map((p) => p.value), target]), [points, target])

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
          <ReferenceLine
            y={target}
            stroke="#facc15"
            strokeDasharray="5 4"
            label={{ value: targetLabel, fill: '#facc15', fontSize: 10, position: 'insideTopLeft' }}
          />
          <Line
            type="monotone"
            dataKey="value"
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
  showData,
  children,
}: {
  goal: GoalSpec
  proj: Projection
  lock?: LockedProjection
  onRecalculate: () => void
  /** Plot the goal's own series (with its target line) while it's unlocked. */
  showData?: boolean
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

      {showData && !reached && !lock && goal.points.length > 0 && (
        <DataChart
          points={goal.points}
          target={shownTarget}
          targetLabel={`goal ${shownTarget}`}
        />
      )}

      {children}
    </div>
  )
}

export function GoalsPanel({ months }: { months: number | null }) {
  const { workouts, bodyWeights, measurements, settings, plan, calorieEntries, updateSettings } = useData()
  const heightIn = settings.heightIn ?? 0
  const [showWeight, setShowWeight] = useState(false)

  const goals = useMemo(
    () => buildGoals({ workouts, bodyWeights, measurements, heightIn }),
    [workouts, bodyWeights, measurements, heightIn],
  )

  const projections = useMemo(
    () => new Map(goals.map((g) => [g.id, project(g.points, g.target, undefined, undefined, g.decayPerWeek)])),
    [goals],
  )

  const locked = useMemo(() => settings.lockedGoals ?? {}, [settings.lockedGoals])

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

  // The weigh-ins the two bodyweight goals are projected from — shown alongside
  // them, since the goals are only as good as the log behind them. The heading
  // reads the whole log, not the visible range, so it agrees with the goal rows
  // even when the range holds no weigh-ins.
  const weightPoints = useMemo(() => bodyWeightPoints(bodyWeights), [bodyWeights])
  const weightSeries = useMemo(() => filterRange(weightPoints, months), [weightPoints, months])
  const latestWeight = weightPoints.length ? weightPoints[weightPoints.length - 1].value : null

  // Weekly rather than daily, complete days only, unlogged days assumed —
  // see weeklyCalorieSurplusSeries.
  const calorieSurplus = useMemo(
    () => filterRange(weeklyCalorieSurplusSeries(calorieEntries), months),
    [calorieEntries, months],
  )

  // Targets for the bodyweight goals whose projection has been locked in. The
  // locked target, not the live one, so the chart line and the row agree.
  const weightGoalLines = useMemo(
    () =>
      goals
        .filter((g) => (g.id === GOAL_IDS.weight180 || g.id === GOAL_IDS.weight190) && locked[g.id] != null)
        .map((g) => ({
          value: locked[g.id]!.target,
          label: g.title.replace('bodyweight → ', 'goal '),
        })),
    [goals, locked],
  )

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
            : 'ab work: none logged — do my core exercises or a stretch + core session to build ab muscle.'}
        </p>
        {heightIn === 0 && (
          <p className="mt-1 text-xs text-neutral-600">
            set my height in settings so tape measurements also feed this.
          </p>
        )}
      </>
    ),
  }

  const bodyWeightBlock = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold tracking-wider text-neutral-500">
          body weight{latestWeight != null ? ` · ${latestWeight} lbs` : ''}
        </h4>
        <button
          onClick={() => setShowWeight(true)}
          className="min-h-[36px] rounded-lg bg-surface px-3 text-sm font-medium active:bg-surface-2"
        >
          log weight
        </button>
      </div>
      <MetricChart
        data={weightSeries}
        unit="lbs"
        label="weight"
        calories={calorieSurplus}
        goalLines={weightGoalLines}
        empty="log my weight to project these goals"
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-wider text-neutral-500">goals</h3>
      {goals.map((g) => {
        const proj = projections.get(g.id)!
        return (
          <Fragment key={g.id}>
            {/* The weigh-in history sits ahead of the goals it feeds. */}
            {g.id === GOAL_IDS.weight180 && bodyWeightBlock}
            <GoalRow
              goal={g}
              proj={proj}
              lock={locked[g.id]}
              onRecalculate={() => recalculate(g)}
              showData={g.id === GOAL_IDS.benchBodyweight}
            >
              {extras[g.id]}
            </GoalRow>
          </Fragment>
        )
      })}
      {showWeight && <WeightLogSheet onClose={() => setShowWeight(false)} />}
    </div>
  )
}
