import { useId, useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_SURFACE, CHART_SURFACE_2, fmtDateLabel, niceScale, spacedTicks, timeXAxis, withTime } from '../../lib/chart'
import type { WholeBody, WholeBodyPoint } from '../../lib/wholeBody'
import { useTheme } from '../../lib/themeStore'
import { useChartReadout } from '../../lib/useChartReadout'
import { tissueColors, type TissueColors } from '../../lib/tissue'
import { TissuePatterns } from './tissuePatterns'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }

/** The dashed give-or-take either side of the seam, and the surface-coloured halo that keeps it legible on either fill. */
const BOUND_DASH = '3 3'
const BOUND_WIDTH = 1.25
const HALO_WIDTH = 3.5

/** A week on the chart: the body's three parts, and where the muscle starts above the floor. */
type Row = WholeBodyPoint & { t: number; seam: number }

function WholeBodyTooltip({
  active,
  payload,
  colors,
}: {
  active?: boolean
  payload?: { payload: Row }[]
  colors: TissueColors
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div style={tooltipStyle} className="px-3 py-2 text-xs">
      <div className="text-neutral-400">week of {fmtDateLabel(row.t)}</div>
      <div style={{ color: colors.muscle.edge }}>
        muscle {row.muscle} ± {row.muscleError} lbs · {row.musclePct}%
      </div>
      <div style={{ color: colors.fat.edge }}>
        fat {row.fat} lbs · {row.fatPct}%
      </div>
      <div style={{ color: colors.frame.edge }}>
        rest {row.rest} lbs · {row.restPct}%
      </div>
      <div className="text-neutral-400">
        {row.weight}
        {row.weightError > 0 && ` ± ${row.weightError}`} lbs · {row.bodyFat}% fat · {row.weighIns}{' '}
        {row.weighIns === 1 ? 'weigh-in' : 'weigh-ins'}
      </div>
    </div>
  )
}

/**
 * The whole body, stood on the floor: the frame — bone, organs, blood, skin,
 * everything that is neither tissue — at the bottom, the muscle on it, the fat
 * over that, and the top of the stack the body weight. Where the muscle vs fat
 * chart stretches its axis over the few pounds that moved, this one starts at
 * zero, so the bands' thickness is the body's proportions and a week's gain is
 * a hair's width: it answers what you are made of, not what went on.
 *
 * Only one seam is in doubt enough to draw. The fat is read off the scale, and
 * the top is the weight trend, both sure to under a pound at this scale; the
 * line between the frame and the muscle is a population equation's guess,
 * six pounds either way, and the dashes that far either side of it say so
 * (see lib/wholeBody). As the weeks go on the split's own doubt joins it,
 * though the equation's dwarfs that.
 */
export function WholeBodyChart({ body, empty }: { body: WholeBody | null; empty?: string }) {
  const readout = useChartReadout()
  const palette = useTheme()
  const colors = useMemo(() => tissueColors(palette), [palette])
  const id = useId()
  const ids = useMemo(() => ({ muscle: `${id}-muscle`, fat: `${id}-fat`, frame: `${id}-frame` }), [id])

  const points = useMemo(() => body?.points ?? [], [body])
  const rows: Row[] = useMemo(() => withTime(points.map((p) => ({ ...p, seam: p.rest }))), [points])
  const yScale = useMemo(
    () => niceScale([0, ...rows.map((r) => r.weight + r.weightError)], 5),
    [rows],
  )
  // One label per week while they fit, then every other, every third… — see spacedTicks.
  const ticks = useMemo(() => spacedTicks(rows.map((r) => r.t)), [rows])
  const last = rows[rows.length - 1]

  if (!last) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
        {empty ?? 'no data in this range'}
      </div>
    )
  }

  // The seam's give-or-take: a dashed line either side, in the frame's edge
  // colour, each on a surface-coloured halo since one of the pair falls on the
  // muscle and the other on the hatch.
  const bounds = [-1, 1].flatMap((side) => {
    const common = {
      dataKey: (r: Row) => r.seam + side * r.muscleError,
      strokeDasharray: BOUND_DASH,
      dot: false,
      activeDot: false,
      isAnimationActive: false,
      legendType: 'none' as const,
      tooltipType: 'none' as const,
    }
    return [
      <Line key={`seam-${side}-halo`} name="seam halo" stroke={CHART_SURFACE} strokeWidth={HALO_WIDTH} strokeOpacity={0.8} {...common} />,
      <Line key={`seam-${side}`} name="seam" stroke={colors.frame.edge} strokeWidth={BOUND_WIDTH} {...common} />,
    ]
  })

  const band = (dataKey: keyof Row, name: string, fillId: string, edge: string) => (
    <Area
      type="monotone"
      dataKey={dataKey}
      name={name}
      stackId="body"
      stroke={edge}
      strokeWidth={1.5}
      fill={`url(#${fillId})`}
      fillOpacity={1}
      dot={false}
      activeDot={{ r: 3, fill: edge, stroke: CHART_SURFACE }}
      isAnimationActive={false}
    />
  )

  return (
    <div className="rounded-2xl bg-surface p-2" {...readout.card}>
      <div className="flex items-center justify-between px-3 pt-1 text-xs">
        <span className="flex gap-3">
          <span style={{ color: colors.muscle.edge }}>muscle {last.musclePct}%</span>
          <span style={{ color: colors.fat.edge }}>fat {last.fatPct}%</span>
          <span style={{ color: colors.frame.edge }}>rest {last.restPct}%</span>
        </span>
        <span className="font-semibold text-neutral-400">{last.weight} lbs</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} {...readout.chart}>
          <TissuePatterns ids={ids} colors={colors} />
          <CartesianGrid stroke={CHART_SURFACE_2} vertical={false} />
          <XAxis {...timeXAxis} ticks={ticks} interval={0} tick={axisTick} />
          <YAxis tick={axisTick} width={40} domain={yScale.domain} ticks={yScale.ticks} />
          <Tooltip {...readout.tooltip} content={<WholeBodyTooltip colors={colors} />} />
          {band('rest', 'rest', ids.frame, colors.frame.edge)}
          {band('muscle', 'muscle', ids.muscle, colors.muscle.edge)}
          {band('fat', 'fat', ids.fat, colors.fat.edge)}
          {bounds}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
