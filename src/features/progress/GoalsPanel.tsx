import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useData } from '../../store/DataContext'
import { isPaceCapped, project, type Projection } from '../../lib/predictions'
import { filterRange, type Point } from '../../lib/progress'
import { calorieHitsByWeek } from '../../lib/calories'
import { bodyWeightPoints, buildGoals, GOAL_IDS, isReached, type GoalSpec } from '../../lib/goals'
import type { SixPackStatus } from '../../services/storage'
import {
  adoptDecay,
  commitRange,
  lockProjection,
  lockProjectionByDate,
  paceAgainstLock,
  projectedSeries,
  withinHorizon,
  type LockedProjection,
  type LockedProjections,
} from '../../lib/goalLock'
import {
  fmtDateLabel,
  LINE_GOAL,
  LINE_GOAL_LABEL,
  LINE_PRIMARY,
  LINE_SECONDARY,
  niceScale,
  timeXAxis,
  withTime,
} from '../../lib/chart'
import { parseISODate } from '../../lib/dates'
import { AxisBreak } from '../../components/AxisBreak'
import { ChartTag } from '../../components/ChartTag'
import { BodyWeightChart } from './BodyWeightChart'
import { CommitChart } from './CommitChart'
import { MdBolt, MdCelebration, MdLockOutline, MdRefresh } from 'react-icons/md'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
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
 *
 * Both ETAs are dots on the target line rather than text above the chart: the
 * locked one where the committed curve lands, and the one the current pace implies
 * where that pace would land instead — so the gap between the two dates is a
 * distance you can see.
 */
function LockChart({
  lock,
  actual,
  revisedEta,
  behind,
}: {
  lock: LockedProjection
  actual: { date: string; value: number }[]
  /** ETA implied by the pace actually being held, when it differs from the lock's. */
  revisedEta?: string | null
  behind?: boolean
}) {
  const rows = useMemo(
    () => withTime(mergeActualProjected(actual, projectedSeries(lock))),
    [lock, actual],
  )

  const yScale = useMemo(
    () => niceScale(rows.flatMap((r) => [r.actual, r.projected]).filter((v): v is number => v != null)),
    [rows],
  )

  const etaMs = parseISODate(lock.etaDate).getTime()
  const revisedMs = revisedEta && revisedEta !== lock.etaDate ? parseISODate(revisedEta).getTime() : null
  // A revised ETA past the locked one falls outside the data's own span, so the
  // axis has to be widened by hand or the dot would be clipped off the edge. The
  // extra padding is for the label under the last dot, which is centred on an x
  // that would otherwise be the right edge itself.
  const xDomain = useMemo(() => {
    const ts = rows.map((r) => r.t)
    const min = Math.min(...ts)
    const max = Math.max(...ts, revisedMs ?? -Infinity)
    return [min, max + (max - min) * 0.07] as [number, number]
  }, [rows, revisedMs])

  // The curve runs from the corner the data started in to the target line, so
  // every tag goes in a corner the curve has already left: a rising goal frees
  // the top-left and bottom-right, a falling one the opposite pair. So a rising
  // goal's target sits high with its tag under the line, its lock rule carries
  // its tag along the bottom, and the ETA dates hang below the target line.
  const rising = lock.target > lock.startValue
  const tagSide = rising ? 'below' : 'above'
  // The second date gets its own row instead of sharing one, so two ETAs a few
  // days apart don't print on top of each other.
  const revisedNudge = rising ? 12 : -12

  return (
    <div className="mt-3 rounded-xl bg-surface-2 p-1">
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} domain={xDomain} tick={axisTick} />
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
            stroke={LINE_GOAL}
            strokeDasharray="3 3"
            label={<ChartTag text="locked" color={LINE_GOAL_LABEL} bg="#262626" side={tagSide} />}
          />
          {/* The target the line is climbing toward, so the goal reads off the
              chart without doing the mental math from the projected curve's end. */}
          <ReferenceLine
            y={lock.target}
            stroke={LINE_GOAL}
            strokeDasharray="5 4"
            label={<ChartTag text={`goal ${lock.target}`} color={LINE_GOAL_LABEL} bg="#262626" side={tagSide} />}
          />
          {/* The commitment: where the locked curve meets the goal. */}
          <ReferenceDot
            x={etaMs}
            y={lock.target}
            r={4}
            fill={LINE_GOAL}
            stroke="#0a0a0a"
            label={
              <ChartTag text={fmtDate(lock.etaDate)} color={LINE_GOAL_LABEL} bg="#262626" align="center" side={tagSide} />
            }
          />
          {/* Where the pace being held now would land instead — dark green when
              that's later than the commitment, bright when it beats it. */}
          {revisedMs != null && (
            <ReferenceDot
              x={revisedMs}
              y={lock.target}
              r={4}
              fill={behind ? LINE_SECONDARY : LINE_PRIMARY}
              stroke="#0a0a0a"
              label={
                <ChartTag
                  text={fmtDate(revisedEta!)}
                  color={behind ? LINE_SECONDARY : LINE_PRIMARY}
                  bg="#262626"
                  align="center"
                  side={tagSide}
                  nudge={revisedNudge}
                />
              }
            />
          )}
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
            stroke={LINE_GOAL}
            strokeDasharray="5 4"
            label={<ChartTag text={targetLabel} color={LINE_GOAL_LABEL} bg="#262626" size={10} />}
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
 * The pace a projection is drawing its ETA from. Marked "max" when that's the
 * goal's cap rather than the measured pace (see predictions.capSlope), so a
 * fortnight of water weight reading +3 lbs/wk doesn't look like the app lost the
 * plot when it projects a pound.
 */
function paceLabel(proj: Projection, unit: string): string {
  const sign = proj.slopePerWeek > 0 ? '+' : ''
  return `${sign}${proj.slopePerWeek} ${unit}/wk${isPaceCapped(proj) ? ' max' : ''}`
}

/**
 * The lit-up state a goal reaches once its projected ETA lands within
 * {@link LOCK_HORIZON_MONTHS}: the projection isn't frozen on its own anymore, so
 * the row offers the commitment instead.
 *
 * The projected date is where the handle starts, and the chart is how it gets
 * moved — drag the finish line along the target and the curve you'd be signing
 * up for redraws against the machine's own, which stays where it is. The date
 * field is the same value spelled out, for setting it exactly.
 */
function LockInPrompt({
  goal,
  proj,
  onLock,
}: {
  goal: GoalSpec
  proj: Projection
  onLock: (etaDate: string) => void
}) {
  const [date, setDate] = useState(proj.etaDate ?? '')
  const range = useMemo(() => commitRange(proj.etaDate!), [proj.etaDate])
  const valid = date >= range.soonest && date <= range.latest

  return (
    <div className="mt-2 rounded-xl bg-accent-2/10 p-3">
      <p className="text-sm font-medium text-accent-2">
        <MdBolt className="inline align-text-bottom mr-1" aria-hidden />
        in reach · projected {fmtDate(proj.etaDate)} ({paceLabel(proj, goal.unit)})
      </p>
      <CommitChart goalId={goal.id} proj={proj} points={goal.points} date={date} onChange={setDate} />
      <div className="mt-3 flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 text-sm text-neutral-400">
          hit it by
          <input
            type="date"
            value={date}
            min={range.soonest}
            max={range.latest}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[36px] flex-1 rounded-lg bg-surface-2 px-2 text-sm text-neutral-200 [color-scheme:dark]"
          />
        </label>
        <button
          onClick={() => valid && onLock(date)}
          disabled={!valid}
          className="min-h-[36px] shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-black active:opacity-70 disabled:opacity-40"
        >
          <MdLockOutline className="inline align-text-bottom mr-1" aria-hidden />
          commit
        </button>
      </div>
    </div>
  )
}

/**
 * One goal. Until its ETA comes within {@link LOCK_HORIZON_MONTHS} it shows the
 * live projection; once inside that horizon the row lights up and offers a
 * lock-in ({@link LockInPrompt}). Once locked, the row shows how the real numbers
 * track against the committed line, with a chart of actual vs projected and a
 * button to re-lock from today's data.
 */
function GoalRow({
  goal,
  proj,
  lock,
  onRecalculate,
  onLock,
  showData,
  chartedAbove = false,
  children,
}: {
  goal: GoalSpec
  proj: Projection
  lock?: LockedProjection
  onRecalculate: () => void
  /** Commit the goal to a target date once it's within reach. */
  onLock: (etaDate: string) => void
  /** Plot the goal's own series (with its target line) while it's unlocked. */
  showData?: boolean
  /**
   * This goal's line is already drawn on a shared chart above the row (the
   * bodyweight pair). No chart inside the row, and the dates that would have
   * been dots on it are written out here instead, where the row names which
   * goal they belong to.
   */
  chartedAbove?: boolean
  children?: React.ReactNode
}) {
  const has = Number.isFinite(proj.current)
  const reached = isReached(goal)
  // Within reach but not yet committed: the row lights up and offers a lock-in,
  // rather than freezing the projection on its own.
  const lockable = !lock && !reached && withinHorizon(proj)
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

  // A committed goal wears a light green box, so the set of things being tracked
  // against a promise reads as a group. The one being asked to commit wears the
  // same box in the darker accent — drawn a step heavier, since the darker green
  // gives up some of the contrast the lighter one has against the surface.
  const ring = lockable
    ? 'ring-2 ring-accent'
    : lock && !reached
      ? 'ring-1 ring-accent-2/60'
      : ''

  return (
    <div className={`rounded-2xl bg-surface p-4 ${ring}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-semibold">{goal.title}</h4>
        {/* A goal charted above already shows how far along it is, so the row
            spends its corner on the thing the chart no longer says: the date it
            lands on — committed if it's locked, projected if it isn't. */}
        {chartedAbove ? (
          !reached && (
            <span className="shrink-0 text-sm text-neutral-400 tabular-nums">
              {lock && <MdLockOutline className="mr-1 inline align-text-bottom" aria-hidden />}
              {fmtDate(lock ? lock.etaDate : proj.etaDate)}
            </span>
          )
        ) : (
          <span className="text-sm text-neutral-400 tabular-nums">
            {has ? `${proj.current}` : '—'} → {shownTarget} {goal.unit}
          </span>
        )}
      </div>

      {reached ? (
        <p className="mt-1 text-sm text-accent-2">
          <MdCelebration className="inline align-text-bottom mr-1" aria-hidden />
          goal reached!
        </p>
      ) : lock ? (
        <>
          {/* The row with its own chart puts both ETAs on it; a row charted above
              carries them as text, since the shared chart can't say which of two
              goals a date belongs to. */}
          <div className="mt-1 flex items-baseline gap-2">
            {pace && (
              <p
                className={`text-sm font-medium ${
                  pace.status === 'behind' ? 'text-accent-deep' : 'text-accent-2'
                }`}
              >
                {pace.status === 'on'
                  ? 'right on the line'
                  : pace.status === 'ahead'
                    ? `${Math.abs(pace.aheadBy)} ${goal.unit} ahead of the line`
                    : `${Math.abs(pace.aheadBy)} ${goal.unit} behind the line`}
              </p>
            )}
            {chartedAbove && pace?.revisedEta && pace.revisedEta !== lock.etaDate && (
              <p className="text-sm text-neutral-500 tabular-nums">
                on pace for {fmtDate(pace.revisedEta)}
              </p>
            )}
            <button
              onClick={onRecalculate}
              aria-label="recalculate time left"
              className="ml-auto shrink-0 rounded-lg bg-surface-2 p-1.5 text-base text-neutral-400 active:opacity-70"
            >
              <MdRefresh aria-hidden />
            </button>
          </div>
          {!chartedAbove && (
            <LockChart
              lock={lock}
              actual={goal.points}
              revisedEta={pace?.revisedEta ?? null}
              behind={pace?.status === 'behind'}
            />
          )}
        </>
      ) : lockable ? (
        <LockInPrompt goal={goal} proj={proj} onLock={onLock} />
      ) : proj.onTrack ? (
        <p className="mt-1 text-sm text-accent-2">
          on track · eta {fmtDate(proj.etaDate)} ({paceLabel(proj, goal.unit)})
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

      {/* Only when no projection chart is already drawn: a locked goal has its
          LockChart and a lockable one its CommitChart, both of which run the
          projection on as an extension of the same history this would re-plot —
          so a separate raw-history chart below them is a redundant second graph.
          The bare data chart is for the states with no projection to show. */}
      {showData && !reached && !lock && !lockable && goal.points.length > 0 && (
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

/**
 * The family a goal belongs to, so related committed goals cluster together in
 * the panel rather than being split apart by an unrelated goal that happens to
 * land between their dates. The two squat targets share a family, each
 * flexibility ladder is its own, and the bodyweight pair (already one block) is
 * another — everything else stands alone.
 */
function goalFamily(g: GoalSpec): string {
  if (g.id === GOAL_IDS.weight180 || g.id === GOAL_IDS.weight190) return 'bodyweight'
  if (g.exerciseKey) return `lift:${g.exerciseKey}`
  return `flex:${g.id.split('_')[0]}`
}

const SIX_PACK_OPTIONS: { value: SixPackStatus; label: string }[] = [
  { value: 'none', label: 'not yet' },
  { value: 'close', label: 'close' },
  { value: 'have', label: 'got it' },
]

/**
 * The six-pack goal, answered rather than projected. A body-fat estimate off a
 * tape measure can't see abs, and the mirror can — so this one is called by eye,
 * and calling it "got it" is what draws the ab lines on the strength map.
 */
function SixPackRow({
  title,
  status,
  onChange,
}: {
  title: string
  status: SixPackStatus
  onChange: (s: SixPackStatus) => void
}) {
  return (
    <div className="rounded-2xl bg-surface p-4">
      <h4 className="font-semibold">{title}</h4>
      <div role="radiogroup" aria-label={title} className="mt-3 flex gap-1 rounded-xl bg-surface-2 p-1">
        {SIX_PACK_OPTIONS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={status === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
              status === o.value ? 'bg-accent text-black' : 'text-neutral-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function GoalsPanel({ months }: { months: number | null }) {
  const { workouts, bodyWeights, measurements, flexEntries, settings, calorieEntries, updateSettings } = useData()
  const heightIn = settings.heightIn ?? 0

  const goals = useMemo(
    () => buildGoals({ workouts, bodyWeights, measurements, heightIn, flexEntries }),
    [workouts, bodyWeights, measurements, heightIn, flexEntries],
  )

  const projections = useMemo(
    () =>
      new Map(
        goals.map((g) => [
          g.id,
          project(g.points, g.target, undefined, { decayPerWeek: g.decayPerWeek, capPerWeek: g.capPerWeek }),
        ]),
      ),
    [goals],
  )

  const locked = useMemo(() => settings.lockedGoals ?? {}, [settings.lockedGoals])

  // Keep existing locks drawn against the goal's current curve shape. Locking
  // itself is a deliberate act now (see lockIn) — a goal within reach lights up
  // and waits to be committed rather than snapshotting itself. This effect only
  // bends locks the user already made: a lock frozen before strength projections
  // tapered carries no decay and would draw dead straight, so it adopts the
  // goal's decay without touching the ETA it committed to. Done as an effect
  // because it writes settings, and only when something changed so it can't loop.
  useEffect(() => {
    const next: LockedProjections = { ...locked }
    let changed = false
    for (const g of goals) {
      const existing = next[g.id]
      if (!existing) continue
      const bent = adoptDecay(existing, g.decayPerWeek)
      if (bent !== existing) {
        next[g.id] = bent
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

  // Commit a goal that's within reach to a target date — the one it projects, or
  // one the user nudged sooner or later. This is the deliberate lock the lit-up
  // row offers in place of the old automatic snapshot.
  const lockIn = (goal: GoalSpec, etaDate: string) => {
    const proj = projections.get(goal.id)
    if (!proj) return
    const fresh = lockProjectionByDate(goal.id, proj, etaDate)
    if (!fresh) return
    updateSettings({ ...settings, lockedGoals: { ...locked, [goal.id]: fresh } })
  }

  // The weigh-ins the two bodyweight goals are projected from — shown alongside
  // them, since the goals are only as good as the log behind them. The heading
  // reads the whole log, not the visible range, so it agrees with the goal rows
  // even when the range holds no weigh-ins.
  const weightPoints = useMemo(() => bodyWeightPoints(bodyWeights), [bodyWeights])
  const weightSeries = useMemo(() => filterRange(weightPoints, months), [weightPoints, months])
  const latestWeight = weightPoints.length ? weightPoints[weightPoints.length - 1].value : null

  // The eating behind the curve, one number per week: how many days hit the
  // calorie goal. It lights up the Mondays on the weigh-in chart's axis.
  const calorieWeeks = useMemo(() => calorieHitsByWeek(calorieEntries), [calorieEntries])

  // The two bodyweight goals, which share one chart instead of drawing the same
  // weigh-in history over again apiece.
  const weightGoals = useMemo(
    () => goals.filter((g) => g.id === GOAL_IDS.weight180 || g.id === GOAL_IDS.weight190),
    [goals],
  )

  // What the shared chart draws per goal: the target line always, and the
  // committed curve once the goal is locked and still open. A lock froze the
  // target it committed to, so the line comes off the lock rather than the live
  // goal — or the chart and the row below would disagree.
  const weightGoalLines = useMemo(
    () =>
      weightGoals.map((g) => {
        const lock = isReached(g) ? undefined : locked[g.id]
        return {
          label: g.title.replace('bodyweight → ', 'goal '),
          target: lock ? lock.target : g.target,
          lock,
        }
      }),
    [weightGoals, locked],
  )

  /* Lift and flexibility goals plot their own series; body-composition ones are
     already charted by the block above them. */
  const goalRow = (g: GoalSpec, chartedAbove = false) => (
    <GoalRow
      key={g.id}
      goal={g}
      proj={projections.get(g.id)!}
      lock={locked[g.id]}
      onRecalculate={() => recalculate(g)}
      onLock={(etaDate) => lockIn(g, etaDate)}
      showData={g.exerciseKey != null || g.milestone}
      chartedAbove={chartedAbove}
    />
  )

  // One chart carrying the weigh-ins, both targets and both commitments, with the
  // two goals reading off it underneath — each a row that turns itself over to
  // "goal reached!" the moment a weigh-in gets there.
  const bodyWeightBlock = (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold tracking-wider text-neutral-500">
        body weight{latestWeight != null ? ` · ${latestWeight} lbs` : ''}
      </h4>
      <BodyWeightChart
        points={weightSeries}
        calorieWeeks={calorieWeeks}
        goals={weightGoalLines}
        empty="log my weight to project these goals"
      />
      {weightGoals.map((g) => goalRow(g, true))}
    </div>
  )

  // The date a goal has committed to, or null if it isn't a locked, still-open
  // commitment — reached goals and unlocked ones don't count as commitments.
  const committedEta = (g: GoalSpec): string | null => {
    const lock = locked[g.id]
    return lock && !isReached(g) ? lock.etaDate : null
  }

  // Where an uncommitted goal is currently headed, which is how far away it
  // reads as. A goal already reached, or one with no pace to project from,
  // isn't headed anywhere.
  const projectedEta = (g: GoalSpec): string | null =>
    isReached(g) ? null : (projections.get(g.id)?.etaDate ?? null)

  const soonest = (dates: (string | null)[]): string | null => {
    const set = dates.filter((d): d is string => d != null).sort()
    return set.length ? set[0] : null
  }

  // Each thing the panel draws as its own block, in the default (buildGoals)
  // order. The two bodyweight goals collapse into one shared-chart block, so it
  // moves as a unit and carries whichever of its two dates comes first.
  const units = useMemo(() => {
    const out: {
      eta: string | null
      projEta: string | null
      /** The family this block clusters with when committed (see goalFamily). */
      family: string
      last?: boolean
      node: React.ReactNode
    }[] = []
    for (const g of goals) {
      if (g.id === GOAL_IDS.weight190) continue
      if (g.id === GOAL_IDS.weight180) {
        out.push({
          eta: soonest(weightGoals.map(committedEta)),
          projEta: soonest(weightGoals.map(projectedEta)),
          family: goalFamily(g),
          node: <Fragment key={g.id}>{bodyWeightBlock}</Fragment>,
        })
        continue
      }
      if (g.id === GOAL_IDS.sixPack) {
        // Answered by eye rather than projected, so it has no date to sort by —
        // it sits at the bottom of the panel regardless.
        out.push({
          eta: null,
          projEta: null,
          family: goalFamily(g),
          last: true,
          node: (
            <SixPackRow
              key={g.id}
              title={g.title}
              status={settings.sixPackStatus ?? 'none'}
              onChange={(s) => updateSettings({ ...settings, sixPackStatus: s })}
            />
          ),
        })
        continue
      }
      out.push({ eta: committedEta(g), projEta: projectedEta(g), family: goalFamily(g), node: goalRow(g) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, locked, projections, settings])

  // Three bands: committed goals first, then the rest by how far off their
  // projection is, then the six-pack. Within the committed band, related goals
  // (the two squat targets, a flexibility ladder) cluster into families rather
  // than interleaving by date — each family is placed by its soonest commitment,
  // and its members sit in date order under it. Goals with no date to project
  // sit at the back of their band in the default order — a stable sort holds
  // them in place.
  const ordered = useMemo(() => {
    const band = (u: (typeof units)[number]) => (u.eta ? 0 : u.last ? 2 : 1)
    const rows = units.map((u, i) => ({ u, i }))

    // The soonest commitment in each committed family, and where the family
    // first appears — so families sort by their nearest date, and ties between
    // families fall back to the panel's default order.
    const familySoonest = new Map<string, string>()
    const familyFirst = new Map<string, number>()
    for (const { u, i } of rows) {
      if (band(u) !== 0) continue
      const cur = familySoonest.get(u.family)
      if (cur == null || u.eta! < cur) familySoonest.set(u.family, u.eta!)
      if (!familyFirst.has(u.family)) familyFirst.set(u.family, i)
    }

    return rows
      .sort((a, b) => {
        const ba = band(a.u)
        const bb = band(b.u)
        if (ba !== bb) return ba - bb
        if (ba === 0) {
          // Committed: order families by their soonest commitment, then keep a
          // family's members together in date order.
          if (a.u.family !== b.u.family) {
            const sa = familySoonest.get(a.u.family)!
            const sb = familySoonest.get(b.u.family)!
            if (sa !== sb) return sa < sb ? -1 : 1
            return familyFirst.get(a.u.family)! - familyFirst.get(b.u.family)!
          }
          if (a.u.eta !== b.u.eta) return a.u.eta! < b.u.eta! ? -1 : 1
          return a.i - b.i
        }
        // Uncommitted / six-pack: by how far off the projection is.
        const ad = a.u.projEta
        const bd = b.u.projEta
        if (ad && bd && ad !== bd) return ad < bd ? -1 : 1
        if (ad !== null && bd === null) return -1
        if (ad === null && bd !== null) return 1
        return a.i - b.i
      })
      .map(({ u }) => u.node)
  }, [units])

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold tracking-wider text-neutral-500">goals</h3>
      {ordered}
    </div>
  )
}
