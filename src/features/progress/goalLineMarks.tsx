/**
 * A goal's target as chart furniture: the flat dashed rule a fixed target has
 * always been, or — for one that moves with bodyweight — the same dashed stroke
 * following the line goalLine draws, read from the rows under `dataKey`.
 *
 * A sloped line has no one height to hang its tag on, so the tag goes on the
 * point its number belongs to: today's target for a live goal, the committed
 * one where its curve lands for a locked goal.
 */

import { Line, ReferenceDot, ReferenceLine } from 'recharts'
import type { Point } from '../../lib/progress'
import { LINE_GOAL, LINE_GOAL_LABEL } from '../../lib/chart'
import { parseISODate } from '../../lib/dates'
import type { TagAlign, TagSide } from '../../lib/chartTag'
import { ChartTag } from '../../components/ChartTag'

export function goalLineMarks({
  line,
  dataKey = 'goal',
  target,
  tagAt,
  label,
  bg,
  side,
  align,
  size,
}: {
  /** The moving target's line (see goalLine), or null for a flat rule at `target`. */
  line: Point[] | null
  dataKey?: string
  target: number
  /** Where the tag sits on a moving line. */
  tagAt?: Point
  label: string
  bg: string
  side?: TagSide
  align?: TagAlign
  size?: number
}) {
  const tag = <ChartTag text={label} color={LINE_GOAL_LABEL} bg={bg} side={side} align={align} size={size} />
  if (!line) {
    return [<ReferenceLine key={`${dataKey}-rule`} y={target} stroke={LINE_GOAL} strokeDasharray="5 4" label={tag} />]
  }
  return [
    <Line
      key={`${dataKey}-line`}
      type="linear"
      dataKey={dataKey}
      name="goal"
      legendType="none"
      stroke={LINE_GOAL}
      strokeWidth={1}
      strokeDasharray="5 4"
      dot={false}
      activeDot={false}
      isAnimationActive={false}
      connectNulls
    />,
    tagAt && (
      <ReferenceDot
        key={`${dataKey}-tag`}
        x={parseISODate(tagAt.date).getTime()}
        y={tagAt.value}
        r={0}
        label={<ChartTag text={label} color={LINE_GOAL_LABEL} bg={bg} side={side} align={align ?? 'end'} size={size} />}
      />
    ),
  ]
}
