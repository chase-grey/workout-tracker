import { useId, useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_SURFACE, CHART_SURFACE_2, CHART_ZERO, fmtDateLabel, niceScale, spacedTicks, timeXAxis, withTime } from '../../lib/chart'
import { bandEdges, fmtGain, gainRatioLabel, type MassTrend, type MassTrendPoint } from '../../lib/massSplit'
import { AxisBreak } from '../../components/AxisBreak'
import { useTheme } from '../../lib/themeStore'
import { useChartReadout } from '../../lib/useChartReadout'
import { tissueColors, type TissueColors } from '../../lib/tissue'
import { TissuePatterns } from './tissuePatterns'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }

/** The dashed give-or-take either side of a band's edge, and the surface-coloured halo that keeps it legible on any fill. */
const BOUND_DASH = '3 3'
const BOUND_WIDTH = 1.25
const HALO_WIDTH = 3.5

/** A week on the chart: the trend point, plus where its two edges sit above the start. */
type Row = MassTrendPoint & { t: number; seam: number; top: number }

/** A signed pound figure with its give-or-take: "+4.2 ± 0.6 lbs". */
function fmtGainError(lbs: number, error: number): string {
  if (error <= 0) return fmtGain(lbs)
  const sign = lbs > 0 ? '+' : lbs < 0 ? '−' : ''
  return `${sign}${Math.abs(lbs)} ± ${error} lbs`
}

function MassTooltip({
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
  const ratio = gainRatioLabel(row.muscleGain, row.fatGain)
  return (
    <div style={tooltipStyle} className="px-3 py-2 text-xs">
      <div className="text-neutral-400">week of {fmtDateLabel(row.t)}</div>
      <div style={{ color: colors.muscle.edge }}>muscle {fmtGainError(row.muscleGain, row.muscleError)}</div>
      <div style={{ color: colors.fat.edge }}>fat {fmtGainError(row.fatGain, row.fatError)}</div>
      {ratio && <div className="font-semibold">{ratio}</div>}
      <div className="text-neutral-400">
        {row.weight}
        {row.weightError > 0 && ` ± ${row.weightError}`} lbs · {row.bodyFat}% fat · {row.weighIns}{' '}
        {row.weighIns === 1 ? 'weigh-in' : 'weigh-ins'}
      </div>
    </div>
  )
}

/**
 * The weight gained since the first body-fat reading, as a slab of muscle with
 * fat layered on top: the two bands' thickness is pounds of each, so the shape
 * of the stack says at a glance how a bulk is going — a thick red-meat floor
 * under a thin rind is the picture you want. Both are drawn as their tissue,
 * fibres and cells, in the theme's accent rather than butcher's colours.
 *
 * The axis is body weight. The stack stands on the weight the trend started
 * at, and its top is the weight trend itself — so the scale reads in pounds
 * on the scale, and the top of the stack ends where the latest weigh-ins are
 * (see lib/massSplit.massTrend, which follows the mornings rather than ruling
 * one line across them). Inside, the bands are still gains: the axis is
 * stretched over the few pounds that moved, with a break at its foot.
 *
 * Each edge can show a dashed line either side, as far off as it could really
 * be: the top as far as the mornings' scatter allows, the seam as far as the
 * readings' allows. Both are nothing at the start, where every band is zero by
 * definition, and fan out as the weeks move away from it. While the seam's
 * dashes span most of the fat band the split is not yet a reading, and the
 * chart says so without a caption. The dashes are off until asked for: a tap
 * on a tissue's figure in the header lays its pair over the stack, and a
 * second tap lifts them, so the stack is normally just the stack.
 *
 * Fat lost while muscle went on hangs below the start line instead of eating
 * into the muscle band, so a recomp still reads as two honest figures.
 */
export function MassSplitChart({ trend, empty }: { trend: MassTrend | null; empty?: string }) {
  const readout = useChartReadout()
  const palette = useTheme()
  const colors = useMemo(() => tissueColors(palette), [palette])
  const id = useId()
  const muscleId = `${id}-muscle`
  const fatId = `${id}-fat`
  // Which edges' give-or-take is laid over the stack: the seam's goes with the
  // muscle figure, the top's with the fat figure, each toggled by its own tap.
  const [bands, setBands] = useState({ muscle: false, fat: false })
  const toggle = (tissue: 'muscle' | 'fat') => setBands((b) => ({ ...b, [tissue]: !b[tissue] }))

  const points = useMemo(() => trend?.points ?? [], [trend])
  const rows: Row[] = useMemo(() => withTime(points.map((p) => ({ ...p, ...bandEdges(p) }))), [points])
  // The bands are drawn as gains from the start, but the axis is printed in body
  // weight: nice round pounds are picked over the weights the stack reaches,
  // any shown dashes included, and each is set back on the gain scale to place it.
  const base = trend?.startWeight ?? 0
  const yScale = useMemo(() => {
    const seamError = (r: Row) => (bands.muscle ? r.fatError : 0)
    const topError = (r: Row) => (bands.fat ? r.weightError : 0)
    const reach = rows.flatMap((r) => [
      0,
      r.seam + seamError(r),
      r.seam - seamError(r),
      r.top + topError(r),
      r.top - topError(r),
      Math.min(0, r.muscleGain) + Math.min(0, r.fatGain),
    ])
    // Six ticks rather than four, so a stack under five pounds gets a step of
    // one: the coarser step framed four pounds of stack in eight of axis.
    const lbs = niceScale(reach.map((g) => base + g), 6)
    return {
      domain: lbs.domain.map((v) => v - base) as [number, number],
      ticks: lbs.ticks.map((v) => v - base),
      broken: lbs.broken,
    }
  }, [rows, base, bands])
  const fmtLbs = (gain: number) => String(Math.round((base + gain) * 10) / 10)
  const hasLoss = rows.some((r) => r.muscleGain < 0 || r.fatGain < 0)
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

  const ratio = gainRatioLabel(last.muscleGain, last.fatGain)

  // An edge's give-or-take: a dashed line either side of it, in the edge's own
  // colour so each pair reads as that edge, give or take. Each sits on a
  // surface-coloured halo dashed the same way, since one of the pair always
  // falls on the other tissue's fill. Drawn only while its figure is pressed.
  const bounds = (name: string, color: string, edge: (r: Row) => number, error: (r: Row) => number) =>
    [-1, 1].flatMap((side) => {
      const at = (r: Row) => edge(r) + side * error(r)
      const common = {
        dataKey: at,
        strokeDasharray: BOUND_DASH,
        dot: false,
        activeDot: false,
        isAnimationActive: false,
        legendType: 'none' as const,
        tooltipType: 'none' as const,
      }
      return [
        <Line key={`${name}-${side}-halo`} name={`${name} halo`} stroke={CHART_SURFACE} strokeWidth={HALO_WIDTH} strokeOpacity={0.8} {...common} />,
        <Line key={`${name}-${side}`} name={name} stroke={color} strokeWidth={BOUND_WIDTH} {...common} />,
      ]
    })

  return (
    <div className="rounded-2xl bg-surface p-2" {...readout.card}>
      <div className="flex items-center justify-between px-3 pt-1 text-xs">
        <span className="flex gap-3">
          {/* Each figure is the switch for its own dashes; a dashed underline
              while they're on echoes the lines it put on the chart. */}
          <button
            type="button"
            aria-pressed={bands.muscle}
            onClick={() => toggle('muscle')}
            className="border-b border-dashed"
            style={{ color: colors.muscle.edge, borderColor: bands.muscle ? 'currentColor' : 'transparent' }}
          >
            muscle {fmtGainError(last.muscleGain, last.muscleError)}
          </button>
          <button
            type="button"
            aria-pressed={bands.fat}
            onClick={() => toggle('fat')}
            className="border-b border-dashed"
            style={{ color: colors.fat.edge, borderColor: bands.fat ? 'currentColor' : 'transparent' }}
          >
            fat {fmtGainError(last.fatGain, last.fatError)}
          </button>
        </span>
        {ratio && <span className="font-semibold text-neutral-400">{ratio}</span>}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={rows}
          stackOffset="sign"
          margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
          {...readout.chart}
        >
          <TissuePatterns ids={{ muscle: muscleId, fat: fatId }} colors={colors} />
          <CartesianGrid stroke={CHART_SURFACE_2} vertical={false} />
          <XAxis {...timeXAxis} ticks={ticks} interval={0} tick={axisTick} />
          <YAxis tick={axisTick} width={40} domain={yScale.domain} ticks={yScale.ticks} tickFormatter={fmtLbs} />
          <AxisBreak broken={yScale.broken} bg={CHART_SURFACE} />
          {hasLoss && <ReferenceLine y={0} stroke={CHART_ZERO} />}
          <Tooltip {...readout.tooltip} content={<MassTooltip colors={colors} />} />
          <Area
            type="monotone"
            dataKey="muscleGain"
            name="muscle"
            stackId="mass"
            stroke={colors.muscle.edge}
            strokeWidth={1.5}
            fill={`url(#${muscleId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 3, fill: colors.muscle.edge, stroke: CHART_SURFACE }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="fatGain"
            name="fat"
            stackId="mass"
            stroke={colors.fat.edge}
            strokeWidth={1.5}
            fill={`url(#${fatId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 3, fill: colors.fat.edge, stroke: CHART_SURFACE }}
            isAnimationActive={false}
          />
          {bands.muscle && bounds('seam', colors.muscle.edge, (r) => r.seam, (r) => r.fatError)}
          {bands.fat && bounds('top', colors.fat.edge, (r) => r.top, (r) => r.weightError)}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
