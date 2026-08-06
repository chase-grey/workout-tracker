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
import { bodyWeightPoints, buildGoals, GOAL_IDS, isReached, reachedDate, type GoalSpec } from '../../lib/goals'
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
import { daysBetween, parseISODate } from '../../lib/dates'
import { AxisBreak } from '../../components/AxisBreak'
import { ChartTag } from '../../components/ChartTag'
import { BodyWeightChart } from './BodyWeightChart'
import { CommitChart } from './CommitChart'
import { FlexLadderBlock, type Ladder } from './FlexLadderBlock'
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
 * The box a goal wears: a light green ring once it's committed, so the set of
 * things being tracked against a promise reads as a group; the darker accent,
 * drawn a step heavier, on the one being asked to commit — the darker green
 * gives up some of the contrast the lighter one has against the surface.
 *
 * Shared with the bodyweight block, which draws the box once around its whole
 * group rather than once per row.
 */
function goalRing(lockable: boolean, committed: boolean): string {
  return lockable ? 'ring-2 ring-accent' : committed ? 'ring-1 ring-accent-2/60' : ''
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
  grouped = false,
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
   * bodyweight pair, a flexibility ladder). No chart inside the row, and the
   * dates that would have been dots on it are written out here instead, where
   * the row names which goal they belong to.
   */
  chartedAbove?: boolean
  /**
   * This row sits inside a block that draws one box around the whole group, so
   * it doesn't draw its own — see {@link goalRing}.
   */
  grouped?: boolean
  children?: React.ReactNode
}) {
  const has = Number.isFinite(proj.current)
  const reached = isReached(goal)
  const doneDate = reached ? reachedDate(goal) : null
  // How the finish landed against the date the goal committed to. Only a finish
  // at or before that date gets said out loud — one that ran late is left as
  // just the date, which tells that story on its own for anyone who wants it.
  const earlyBy = lock && doneDate ? daysBetween(doneDate, lock.etaDate) : null
  const scheduleNote =
    earlyBy == null || earlyBy < 0
      ? null
      : earlyBy === 0
        ? 'right on schedule'
        : `${earlyBy} ${earlyBy === 1 ? 'day' : 'days'} early`
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

  const ring = grouped ? '' : goalRing(lockable, !!lock && !reached)

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
          {doneDate && <span className="tabular-nums"> · {fmtDate(doneDate)}</span>}
          {scheduleNote && ` · ${scheduleNote}`}
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
          A row charted above has that history on the shared chart already. The
          bare data chart is for the states with no projection to show. */}
      {showData && !chartedAbove && !reached && !lock && !lockable && goal.points.length > 0 && (
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
     already charted by the block above them, and sit inside the box that block
     draws around itself. */
  const goalRow = (g: GoalSpec, inBlock = false) => (
    <GoalRow
      key={g.id}
      goal={g}
      proj={projections.get(g.id)!}
      lock={locked[g.id]}
      onRecalculate={() => recalculate(g)}
      onLock={(etaDate) => lockIn(g, etaDate)}
      showData={g.exerciseKey != null || g.milestone}
      chartedAbove={inBlock}
      grouped={inBlock}
    />
  )

  // A block wears one box around its whole group — the chart and every row —
  // rather than a box per row with the chart they read off left outside it. It
  // takes the strongest state any of its goals is in: the bright ask if one is
  // within reach, otherwise the committed green.
  const blockRing = (block: GoalSpec[]): string => {
    let lockable = false
    let committed = false
    for (const g of block) {
      if (isReached(g)) continue
      const proj = projections.get(g.id)
      if (locked[g.id]) committed = true
      else if (proj && withinHorizon(proj)) lockable = true
    }
    return goalRing(lockable, committed)
  }

  const weightRing = useMemo(
    () => blockRing(weightGoals),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightGoals, locked, projections],
  )

  // One chart carrying the weigh-ins, both targets and both commitments, with the
  // two goals reading off it underneath — each a row that turns itself over to
  // "goal reached!" the moment a weigh-in gets there.
  const bodyWeightBlock = (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold tracking-wider text-neutral-500">
        body weight{latestWeight != null ? ` · ${latestWeight} lbs` : ''}
      </h4>
      <div className={`flex flex-col gap-3 ${weightRing ? `rounded-2xl p-2 ${weightRing}` : ''}`}>
        <BodyWeightChart
          points={weightSeries}
          calorieWeeks={calorieWeeks}
          goals={weightGoalLines}
          empty="log my weight to project these goals"
        />
        {weightGoals.map((g) => goalRow(g, true))}
      </div>
    </div>
  )

  // The flexibility ladders, each collapsed into one block the way the bodyweight
  // pair is: every rung reading off a single chart of the stretch log, in place of
  // a row per rung that re-plotted that log apiece — and in place of the side
  // split / tailor's pose section that carried a second copy of it further down
  // the tab.
  const ladders = useMemo(
    () =>
      (['split', 'tailors'] as Ladder[]).map((ladder) => {
        const rungs = goals.filter((g) => goalFamily(g) === `flex:${ladder}`)
        return {
          ladder,
          rungs,
          node: (
            <FlexLadderBlock
              key={ladder}
              ladder={ladder}
              entries={flexEntries}
              months={months}
              rungs={rungs}
              locked={locked}
              ring={blockRing(rungs)}
              renderRow={(g) => goalRow(g, true)}
            />
          ),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, flexEntries, months, locked, projections],
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

  // When a finished block finished: the last of its goals to fall, since that's
  // the day the block as a whole was done. A block still carrying an open goal
  // isn't in the reached band, so nothing reads this until every date is in.
  const latest = (dates: (string | null)[]): string | null => {
    const set = dates.filter((d): d is string => d != null).sort()
    return set.length ? set[set.length - 1] : null
  }

  // Each thing the panel draws as its own block, in the default (buildGoals)
  // order. The two bodyweight goals collapse into one shared-chart block, so it
  // moves as a unit and carries whichever of its two dates comes first.
  const units = useMemo(() => {
    const out: {
      /** Already achieved — the band that sits above everything else. */
      done: boolean
      /** The day it was achieved, which is how the reached band orders itself. */
      doneDate: string | null
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
          // The pair shares one block, so it only counts as done once both
          // weigh-in targets are met — otherwise the block would go up top
          // carrying a goal that's still open.
          done: weightGoals.every(isReached),
          doneDate: latest(weightGoals.map(reachedDate)),
          eta: soonest(weightGoals.map(committedEta)),
          projEta: soonest(weightGoals.map(projectedEta)),
          family: goalFamily(g),
          node: <Fragment key={g.id}>{bodyWeightBlock}</Fragment>,
        })
        continue
      }
      if (g.id === GOAL_IDS.sixPack) {
        // Answered by eye rather than projected, so it has no date to sort by —
        // it sits at the bottom of the panel until it's called done, and at the
        // back of the reached band after that.
        out.push({
          done: (settings.sixPackStatus ?? 'none') === 'have',
          doneDate: null,
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
      const ladder = ladders.find((l) => l.rungs.some((r) => r.id === g.id))
      if (ladder) {
        // One block per ladder, standing in for its first rung. Its rungs stay
        // together, cleared ones included: a ladder is a progression, so a rung
        // already hit belongs under the chart that shows it being hit rather than
        // off in the reached band on its own.
        if (ladder.rungs[0].id !== g.id) continue
        out.push({
          done: ladder.rungs.every(isReached),
          doneDate: latest(ladder.rungs.map(reachedDate)),
          eta: soonest(ladder.rungs.map(committedEta)),
          projEta: soonest(ladder.rungs.map(projectedEta)),
          family: goalFamily(g),
          node: ladder.node,
        })
        continue
      }
      out.push({
        done: isReached(g),
        doneDate: reachedDate(g),
        eta: committedEta(g),
        projEta: projectedEta(g),
        family: goalFamily(g),
        node: goalRow(g),
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goals, locked, projections, settings, months, ladders])

  // Four bands: goals already reached first, then committed ones, then the rest
  // by how far off their projection is, then the six-pack. The reached band runs
  // newest first — the thing just cleared is the thing worth seeing, and the
  // early wins settle toward the bottom as more land on top of them. In both
  // dated bands related goals (the two
  // squat targets, a flexibility ladder) cluster into families rather than
  // interleaving by date — each family is placed by its soonest date within that
  // band (its nearest commitment when committed, its nearest projection when
  // not), and its members sit in date order under it. A band uses commitment
  // dates for committed goals and projection dates for the rest, so the two
  // never mix within one family's soonest. Goals with no date to project sit at
  // the back of their band in the default order — a stable sort holds them.
  const ordered = useMemo(() => {
    const band = (u: (typeof units)[number]) => (u.done ? 0 : u.eta ? 1 : u.last ? 3 : 2)
    // The date a block reads as within its band: its commitment once committed,
    // otherwise where its projection is currently headed.
    const dateOf = (u: (typeof units)[number]) => (u.eta ? u.eta : u.projEta)
    const rows = units.map((u, i) => ({ u, i }))

    // Per band, the soonest date in each family and where the family first
    // appears — so families sort by their nearest date and ties fall back to the
    // panel's default order. Keyed by band too, so a family split across bands
    // (one target committed, a harder one still projected) clusters within each.
    const key = (u: (typeof units)[number]) => `${band(u)}:${u.family}`
    const familySoonest = new Map<string, string>()
    const familyFirst = new Map<string, number>()
    for (const { u, i } of rows) {
      const k = key(u)
      const d = dateOf(u)
      if (d != null) {
        const cur = familySoonest.get(k)
        if (cur == null || d < cur) familySoonest.set(k, d)
      }
      if (!familyFirst.has(k)) familyFirst.set(k, i)
    }

    return rows
      .sort((a, b) => {
        const ba = band(a.u)
        const bb = band(b.u)
        if (ba !== bb) return ba - bb
        if (ba === 0) {
          // Reached: straight reverse chronological, no family clustering — a
          // finished goal's date is the only thing left to say about it, so the
          // band reads as the log of what's been done, newest at the top. The
          // six-pack, called by eye with no date behind it, falls to the back.
          const ad = a.u.doneDate
          const bd = b.u.doneDate
          if (ad && bd && ad !== bd) return ad > bd ? -1 : 1
          if (ad && !bd) return -1
          if (!ad && bd) return 1
          return a.i - b.i
        }
        // Within a dated band, order families by their soonest date (dated
        // families ahead of dateless ones), then keep a family's members in date
        // order.
        if (a.u.family !== b.u.family) {
          const sa = familySoonest.get(key(a.u))
          const sb = familySoonest.get(key(b.u))
          if (sa && sb && sa !== sb) return sa < sb ? -1 : 1
          if (sa && !sb) return -1
          if (!sa && sb) return 1
          return familyFirst.get(key(a.u))! - familyFirst.get(key(b.u))!
        }
        const ad = dateOf(a.u)
        const bd = dateOf(b.u)
        if (ad && bd && ad !== bd) return ad < bd ? -1 : 1
        if (ad && !bd) return -1
        if (!ad && bd) return 1
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
