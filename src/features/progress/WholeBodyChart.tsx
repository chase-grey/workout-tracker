import { useId, useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_SURFACE, CHART_SURFACE_2, fmtDateLabel, niceScale, spacedTicks, timeXAxis, withTime } from '../../lib/chart'
import { fmtLbsError, fmtPctError, type WholeBody, type WholeBodyPoint } from '../../lib/wholeBody'
import { useTheme } from '../../lib/themeStore'
import { useChartReadout } from '../../lib/useChartReadout'
import { tissueColors, type TissueColors } from '../../lib/tissue'
import { TissuePatterns } from './tissuePatterns'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }
/** The header's weight figure, and the dashes it lays on the top of the stack: the same neutral as the axis labels. */
const WEIGHT_COLOR = '#a3a3a3'

/** The dashed give-or-take either side of an edge, and the surface-coloured halo that keeps it legible on any fill. */
const BOUND_DASH = '3 3'
const BOUND_WIDTH = 1.25
const HALO_WIDTH = 3.5

/** A week on the chart: the body's three parts, and its two seams — where the muscle starts above the floor, and where the fat starts above the muscle. */
type Row = WholeBodyPoint & { t: number; seam: number; lean: number }

/** The four figures in the header, each the switch for its own dashes. */
type Figure = 'muscle' | 'fat' | 'rest' | 'weight'

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
        muscle {fmtLbsError(row.muscle, row.muscleError)} · {fmtPctError(row.musclePct, row.musclePctError)}
      </div>
      <div style={{ color: colors.fat.edge }}>
        fat {fmtLbsError(row.fat, row.fatError)} · {fmtPctError(row.fatPct, row.fatPctError)}
      </div>
      <div style={{ color: colors.frame.edge }}>
        rest {fmtLbsError(row.rest, row.restError)} · {fmtPctError(row.restPct, row.restPctError)}
      </div>
      <div className="text-neutral-400">
        {fmtLbsError(row.weight, row.weightError)} · {row.bodyFat}% fat · {row.weighIns}{' '}
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
 * Every figure in the header carries its give-or-take, and each is the switch
 * for a pair of dashed lines that lay that give-or-take on the stack, where
 * it lives (see lib/wholeBody). The rest's is the population equation's guess
 * at where the frame ends, six pounds either way, the same every week, drawn
 * either side of the lower seam. The muscle's is that same doubt with the
 * split's own joined to it as the weeks go on, on the same seam and a little
 * wider: the muscle is whatever the equation left of the fat-free mass, so it
 * owns the equation's error and the trend's. The fat's is the split's alone,
 * drawn either side of the upper seam, and the weight's the mornings' scatter,
 * either side of the top — both under a pound at this scale, so their pairs
 * sit nearly on the line, which is the point: next to the lower seam's wide
 * fan they say which of the three bands is measured and which is guessed. As
 * on the muscle vs fat chart the dashes are off until asked for; a tap on a
 * figure lays its pair over the stack, and a second lifts them.
 */
export function WholeBodyChart({ body, empty }: { body: WholeBody | null; empty?: string }) {
  const readout = useChartReadout()
  const palette = useTheme()
  const colors = useMemo(() => tissueColors(palette), [palette])
  const id = useId()
  const ids = useMemo(() => ({ muscle: `${id}-muscle`, fat: `${id}-fat`, frame: `${id}-frame` }), [id])
  // Which figures' give-or-take is laid over the stack, each toggled by its own tap.
  const [shown, setShown] = useState<Record<Figure, boolean>>({ muscle: false, fat: false, rest: false, weight: false })
  const toggle = (figure: Figure) => setShown((s) => ({ ...s, [figure]: !s[figure] }))

  const points = useMemo(() => body?.points ?? [], [body])
  const rows: Row[] = useMemo(
    () => withTime(points.map((p) => ({ ...p, seam: p.rest, lean: p.rest + p.muscle }))),
    [points],
  )
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

  // A figure's give-or-take: a dashed line either side of the edge it moves,
  // in the figure's own colour so each pair reads as that figure, give or
  // take. Each sits on a surface-coloured halo dashed the same way, since one
  // of the pair always falls on another band's fill. Drawn only while pressed.
  const bounds = (name: string, color: string, edge: (r: Row) => number, error: (r: Row) => number) =>
    [-1, 1].flatMap((side) => {
      const common = {
        dataKey: (r: Row) => edge(r) + side * error(r),
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

  // A header figure: the switch for its own dashes, with a dashed underline
  // while they're on that echoes the lines it put on the chart.
  const figure = (key: Figure, color: string, label: string, className?: string) => (
    <button
      type="button"
      aria-pressed={shown[key]}
      onClick={() => toggle(key)}
      className={`border-b border-dashed ${className ?? ''}`}
      style={{ color, borderColor: shown[key] ? 'currentColor' : 'transparent' }}
    >
      {label}
    </button>
  )

  return (
    <div className="rounded-2xl bg-surface p-2" {...readout.card}>
      <div className="flex items-center justify-between px-3 pt-1 text-xs">
        <span className="flex gap-3">
          {figure('muscle', colors.muscle.edge, `muscle ${fmtPctError(last.musclePct, last.musclePctError)}`)}
          {figure('fat', colors.fat.edge, `fat ${fmtPctError(last.fatPct, last.fatPctError)}`)}
          {figure('rest', colors.frame.edge, `rest ${fmtPctError(last.restPct, last.restPctError)}`)}
        </span>
        {figure('weight', WEIGHT_COLOR, fmtLbsError(last.weight, last.weightError), 'font-semibold')}
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
          {shown.rest && bounds('rest', colors.frame.edge, (r) => r.seam, (r) => r.restError)}
          {shown.muscle && bounds('muscle', colors.muscle.edge, (r) => r.seam, (r) => r.muscleError)}
          {shown.fat && bounds('fat', colors.fat.edge, (r) => r.lean, (r) => r.fatError)}
          {shown.weight && bounds('weight', WEIGHT_COLOR, (r) => r.weight, (r) => r.weightError)}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
