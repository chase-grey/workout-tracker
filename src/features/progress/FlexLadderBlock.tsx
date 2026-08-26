import { useMemo } from 'react'
import {
  flexStats,
  legLiftSeries,
  splitSeries,
  tailorsSeries,
  toeTouchSeries,
  type FlexEntry,
} from '../../lib/flex'
import { isReached, type GoalSpec } from '../../lib/goals'
import type { LockedProjections } from '../../lib/goalLock'
import { LINE_COLD, LINE_COLD_2, LINE_PRIMARY, LINE_SECONDARY } from '../../lib/chart'
import { LadderChart, type LadderReading, type LadderSeries } from './LadderChart'

/** Which ladder a block is drawing. */
export type Ladder = 'split' | 'tailors' | 'toeTouch' | 'legLift'

const LADDERS: Record<
  Ladder,
  { title: string; series: LadderSeries[]; empty: string }
> = {
  split: {
    title: 'side split',
    series: [
      { key: 'cold', name: 'cold', color: LINE_COLD, dashed: true },
      { key: 'warm', name: 'warm', color: LINE_PRIMARY },
    ],
    empty: 'log split measurements to see progression',
  },
  tailors: {
    title: "tailor's pose",
    series: [
      { key: 'coldLeft', name: 'cold L', color: LINE_COLD, dashed: true },
      { key: 'coldRight', name: 'cold R', color: LINE_COLD_2, dashed: true },
      { key: 'warmLeft', name: 'warm L', color: LINE_PRIMARY },
      { key: 'warmRight', name: 'warm R', color: LINE_SECONDARY },
    ],
    empty: "log tailor's-pose measurements to see progression",
  },
  // The one reading in the app that improves by getting smaller — the hip
  // angle of a standing fold, 180° upright and 0° flat. Said in the title
  // rather than left to be worked out from a line that runs downhill.
  toeTouch: {
    title: 'toe touch (lower is deeper)',
    series: [
      { key: 'cold', name: 'cold', color: LINE_COLD, dashed: true },
      { key: 'warm', name: 'warm', color: LINE_PRIMARY },
    ],
    empty: 'log toe-touch measurements to see progression',
  },
  legLift: {
    title: 'leg lift',
    series: [
      { key: 'coldLeft', name: 'cold L', color: LINE_COLD, dashed: true },
      { key: 'coldRight', name: 'cold R', color: LINE_COLD_2, dashed: true },
      { key: 'warmLeft', name: 'warm L', color: LINE_PRIMARY },
      { key: 'warmRight', name: 'warm R', color: LINE_SECONDARY },
    ],
    empty: 'log leg-lift measurements to see progression',
  },
}

/** One number to spell out beside the ladder's name, and what to call it. */
type Reading = [value: number | null, label: string]

/** The latest readings, spelled out beside the ladder's name. */
function headline(ladder: Ladder, entries: FlexEntry[]): string {
  const s = flexStats(entries)
  const parts: Record<Ladder, Reading[]> = {
    split: [
      [s.warmSplit.latest, 'warm'],
      [s.coldSplit.latest, 'cold'],
    ],
    tailors: [
      [s.tailorsLeft.latest, 'left'],
      [s.tailorsRight.latest, 'right'],
    ],
    toeTouch: [
      [s.warmToeTouch.latest, 'warm'],
      [s.coldToeTouch.latest, 'cold'],
    ],
    legLift: [
      [s.legLiftLeft.latest, 'left'],
      [s.legLiftRight.latest, 'right'],
    ],
  }
  return parts[ladder]
    .filter(([v]) => v != null)
    .map(([v, label]) => `${v}° ${label}`)
    .join(' · ')
}

/**
 * One flexibility ladder — a side-splits pose or a head-to-toe one — as a single
 * block: every measurement taken on one chart, with the angles being aimed at
 * reading off it underneath.
 *
 * The ladder used to be one row per rung, each re-plotting the same stretch log
 * under a target line of its own, and a second copy of that log further down the
 * tab as a section in its own right. This is both of those at once: the cold and
 * warm history that section carried, with the goals it was really about attached
 * to it.
 *
 * A ladder with no rungs still draws — see `rungs` — which is what carried the
 * head-to-toe pair through the stretch where they were charted but not yet aimed
 * at. Nothing passes an empty ladder now, and the tolerance is kept anyway: it
 * costs a filter over nothing, and it's what a new pose lands on.
 */
export function FlexLadderBlock({
  ladder,
  entries,
  rungs,
  locked,
  ring,
  renderRow,
}: {
  ladder: Ladder
  entries: FlexEntry[]
  /**
   * The ladder's rungs, easiest first — which for the toe touch means descending
   * degrees, since its angle closes as the fold deepens (see
   * flexPredict.TOE_TOUCH_GOALS). Empty is tolerated: the block then draws the
   * history with no target line and no rung row under it.
   */
  rungs: GoalSpec[]
  locked: LockedProjections
  /** The box drawn around the whole block — see goalRing in the goals panel. */
  ring: string
  renderRow: (g: GoalSpec) => React.ReactNode
}) {
  const { title, series, empty } = LADDERS[ladder]

  // Cold and warm readings per date. The rungs are measured on the warm series
  // (for the paired poses, the average of their left and right), which is the
  // line that runs at the goals; the cold readings ride along as the day's floor.
  const readings = useMemo<LadderReading[]>(() => {
    if (ladder === 'split') return splitSeries(entries)
    if (ladder === 'tailors') return tailorsSeries(entries)
    if (ladder === 'toeTouch') return toeTouchSeries(entries)
    return legLiftSeries(entries)
  }, [ladder, entries])

  // Which rungs the chart draws a line for: the one being worked on, plus any
  // rung already committed to. All of them would frame the axis on 180° and
  // squash a 110° history flat along the bottom of the plot — and the rungs
  // beyond the next one aren't being measured against yet anyway. `rungs` arrives
  // easiest-first, so the head of the open ones is the one in play whichever way
  // the ladder runs.
  const goalLines = useMemo(() => {
    const open = rungs.filter((g) => !isReached(g))
    return open
      .filter((g, i) => i === 0 || locked[g.id])
      .map((g) => {
        const lock = locked[g.id]
        return { label: `goal ${lock ? lock.target : g.target}°`, target: lock ? lock.target : g.target, lock }
      })
  }, [rungs, locked])

  const latest = headline(ladder, entries)

  return (
    <div className={`flex flex-col gap-3 ${ring ? `rounded-2xl p-2 ${ring}` : ''}`}>
      {/* Inside the box, at the rung titles' weight — see the body weight block. */}
      <h4 className="px-1 font-semibold">
        {title}
        {latest ? ` · ${latest}` : ''}
      </h4>
      <LadderChart readings={readings} series={series} goals={goalLines} unit="°" empty={empty} />
      {/* Only the rungs still being climbed. A cleared one has left for the
          reached band at the top of the panel, where it sits by the date it was
          cleared rather than buried under the rungs still open. */}
      {rungs.filter((g) => !isReached(g)).map((g) => renderRow(g))}
    </div>
  )
}
