/**
 * A goal's target as chart furniture: a flat dashed rule with its tag. For a
 * target that moves with bodyweight the rule sits at the weight the goal is
 * projected to be met at (see goalLine.targetAtEta), so the projected curve
 * lands on it instead of overshooting a rule drawn at today's weight.
 */

import { ReferenceLine } from 'recharts'
import { LINE_GOAL, LINE_GOAL_LABEL } from '../../lib/chart'
import type { TagSide } from '../../lib/chartTag'
import { ChartTag } from '../../components/ChartTag'

export function goalLineMarks({
  key = 'goal',
  target,
  label,
  bg,
  side,
  size,
}: {
  /** Tells the rules apart when a chart draws more than one. */
  key?: string
  target: number
  label: string
  bg: string
  side?: TagSide
  size?: number
}) {
  return (
    <ReferenceLine
      key={`${key}-rule`}
      y={target}
      stroke={LINE_GOAL}
      strokeDasharray="5 4"
      label={<ChartTag text={label} color={LINE_GOAL_LABEL} bg={bg} side={side} size={size} />}
    />
  )
}
