import { useMemo } from 'react'
import { flexStats, splitSeries, tailorsSeries, type FlexEntry } from '../../lib/flex'
import { isReached, type GoalSpec } from '../../lib/goals'
import type { LockedProjections } from '../../lib/goalLock'
import { filterRange } from '../../lib/progress'
import { LINE_COLD, LINE_COLD_2, LINE_PRIMARY, LINE_SECONDARY } from '../../lib/chart'
import { AngleChart, type AngleReading, type AngleSeries } from './AngleChart'

/** Which ladder a block is drawing. */
export type Ladder = 'split' | 'tailors'

const LADDERS: Record<
  Ladder,
  { title: string; series: AngleSeries[]; empty: string }
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
}

/** The latest readings, spelled out beside the ladder's name. */
function headline(ladder: Ladder, entries: FlexEntry[]): string {
  const s = flexStats(entries)
  const parts =
    ladder === 'split'
      ? [
          [s.warmSplit.latest, 'warm'],
          [s.coldSplit.latest, 'cold'],
        ]
      : [
          [s.tailorsLeft.latest, 'left'],
          [s.tailorsRight.latest, 'right'],
        ]
  return (parts as [number | null, string][])
    .filter(([v]) => v != null)
    .map(([v, label]) => `${v}° ${label}`)
    .join(' · ')
}

/**
 * One flexibility ladder — the side split or tailor's pose — as a single block:
 * every measurement taken on one chart, with the angles being aimed at reading
 * off it underneath.
 *
 * The ladder used to be one row per rung, each re-plotting the same stretch log
 * under a target line of its own, and a second copy of that log further down the
 * tab as a section in its own right. This is both of those at once: the cold and
 * warm history that section carried, with the goals it was really about attached
 * to it.
 */
export function FlexLadderBlock({
  ladder,
  entries,
  months,
  rungs,
  locked,
  ring,
  renderRow,
}: {
  ladder: Ladder
  entries: FlexEntry[]
  /** The range pill, so the chart shows the same window as the rest of the tab. */
  months: number | null
  /** The ladder's rungs, ascending. */
  rungs: GoalSpec[]
  locked: LockedProjections
  /** The box drawn around the whole block — see goalRing in the goals panel. */
  ring: string
  renderRow: (g: GoalSpec) => React.ReactNode
}) {
  const { title, series, empty } = LADDERS[ladder]

  // Cold and warm readings per date. The rungs are measured on the warm series
  // (for tailor's pose, the average of its left and right), which is the line
  // that runs at the goals; the cold readings ride along as the day's floor.
  const readings = useMemo<AngleReading[]>(() => {
    const rows: AngleReading[] = ladder === 'split' ? splitSeries(entries) : tailorsSeries(entries)
    return filterRange(rows, months)
  }, [ladder, entries, months])

  // Which rungs the chart draws a line for: the one being worked on, plus any
  // rung already committed to. All of them would frame the axis on 180° and
  // squash a 110° history flat along the bottom of the plot — and the rungs
  // beyond the next one aren't being measured against yet anyway. Every rung
  // still gets its row underneath.
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
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold tracking-wider text-neutral-500">
        {title}
        {latest ? ` · ${latest}` : ''}
      </h4>
      <div className={`flex flex-col gap-3 ${ring ? `rounded-2xl p-2 ${ring}` : ''}`}>
        <AngleChart readings={readings} series={series} goals={goalLines} empty={empty} />
        {rungs.map((g) => renderRow(g))}
      </div>
    </div>
  )
}
