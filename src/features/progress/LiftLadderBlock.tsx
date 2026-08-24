import { useMemo } from 'react'
import { isReached, type GoalSpec } from '../../lib/goals'
import type { LockedProjections } from '../../lib/goalLock'
import { LINE_PRIMARY } from '../../lib/chart'
import type { DaySets } from '../../lib/goalSets'
import { LIFT_LADDERS } from '../../lib/liftLadder'
import { LadderChart, type LadderReading } from './LadderChart'

/**
 * One lift's ladder — the two squat targets, or the four pull-up rungs — as a
 * single block: the whole logged series on one chart, with the rungs being aimed
 * at reading off it underneath.
 *
 * The same shape the flexibility ladders and the bodyweight pair are already
 * drawn in (see FlexLadderBlock), and for the same reason: every rung here is
 * measured on one series, so a row per rung re-plotted that series apiece and
 * made one road with milestones along it look like several separate efforts.
 */
export function LiftLadderBlock({
  lift,
  rungs,
  sets,
  locked,
  ring,
  renderRow,
}: {
  /** The lift the ladder is climbed on — a key of liftLadder.LIFT_LADDERS. */
  lift: string
  /** The ladder's rungs, ascending. */
  rungs: GoalSpec[]
  /**
   * The sets behind the readings, for the chart's tooltip — the session as it was
   * performed rather than the number the line plots (see goalSets).
   */
  sets?: Record<string, DaySets[]>
  locked: LockedProjections
  /** The box drawn around the whole block — see goalRing in the goals panel. */
  ring: string
  renderRow: (g: GoalSpec) => React.ReactNode
}) {
  const { title, seriesName, headline, goalLabel, empty } = LIFT_LADDERS[lift]

  // Every rung reads the same series, so the first one carries it for the block.
  const points = rungs[0]?.points
  const unit = rungs[0]?.unit ?? ''

  const readings = useMemo<LadderReading[]>(
    () => (points ?? []).map((p) => ({ date: p.date, value: p.value })),
    [points],
  )

  const series = useMemo(() => [{ key: 'value', name: seriesName, color: LINE_PRIMARY }], [seriesName])

  // Which rungs the chart draws a line for: the one being worked on, plus any
  // rung already committed to. All four pull-up rungs would frame the axis on 20
  // reps and squash a ladder still in single digits flat along the bottom — and
  // the rungs past the next one aren't being measured against yet anyway.
  const goalLines = useMemo(() => {
    const open = rungs.filter((g) => !isReached(g))
    return open
      .filter((g, i) => i === 0 || locked[g.id])
      .map((g) => {
        // A lock froze the target it committed to, and the squat targets move
        // with bodyweight — so the line comes off the lock rather than the live
        // goal, or the chart and the row below it would disagree.
        const lock = locked[g.id]
        const target = lock ? lock.target : g.target
        return { label: goalLabel(target), target, lock }
      })
  }, [rungs, locked, goalLabel])

  const latest = points?.length ? headline(points[points.length - 1].value) : null

  return (
    <div className={`flex flex-col gap-3 ${ring ? `rounded-2xl p-2 ${ring}` : ''}`}>
      {/* Inside the box, at the rung titles' weight — see the body weight block. */}
      <h4 className="px-1 font-semibold">
        {title}
        {latest ? ` · ${latest}` : ''}
      </h4>
      <LadderChart readings={readings} series={series} goals={goalLines} unit={unit} sets={sets} empty={empty} />
      {/* Only the rungs still being climbed. A cleared one has left for the
          reached band at the top of the panel, where it sits by the date it was
          cleared rather than buried under the rungs still open. */}
      {rungs.filter((g) => !isReached(g)).map((g) => renderRow(g))}
    </div>
  )
}
