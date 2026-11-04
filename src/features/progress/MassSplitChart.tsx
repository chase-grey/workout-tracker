import { useId, useMemo } from 'react'
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
import { fmtGain, gainRatioLabel, type MassTrend, type MassTrendPoint } from '../../lib/massSplit'
import { fatCells, fiberPath, muscleFibers } from '../../lib/tissue'
import { useTheme } from '../../lib/themeStore'
import type { Palette } from '../../lib/theme'
import { useChartReadout } from '../../lib/useChartReadout'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }

/** A muscle tile: wide enough to hide the repeat, taller than any plot so it never repeats downward. */
const MUSCLE_TILE = { w: 96, h: 320 }
const FAT_TILE = { w: 72, h: 54 }

/** The seam's haze, and the weekly dots: both in a neutral so neither reads as a third tissue. */
const HAZE = '#a3a3a3'
const DOT_RADIUS = 2.5

/**
 * The two tissues in the accent. Muscle is the deep, saturated end of the
 * ladder with lit strands running through it; fat the pale end, cells nearly
 * white with the membrane between them a shade darker. Each has an `edge`, the
 * line along its top — the sheen on a muscle, the skin over fat — which is also
 * the colour its name is printed in.
 */
function tissueColors({ scale, theme }: Palette) {
  const light = theme.mode === 'light'
  return {
    muscle: {
      base: scale[light ? 600 : 700],
      light: scale[light ? 400 : 500],
      dark: scale[light ? 800 : 900],
      seam: light ? scale[900] : '#000000',
      edge: scale[light ? 800 : 300],
    },
    fat: {
      base: scale[300],
      cell: scale[100],
      wall: scale[400],
      edge: scale[light ? 500 : 50],
    },
  }
}
type TissueColors = ReturnType<typeof tissueColors>

type Row = MassTrendPoint & { t: number }

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
      <div style={{ color: colors.muscle.edge }}>muscle {fmtGain(row.muscleGain)}</div>
      <div style={{ color: colors.fat.edge }}>
        fat {fmtGain(row.fatGain)}
        {row.seamError > 0 && <span className="text-neutral-400"> ± {row.seamError}</span>}
      </div>
      {ratio && <div className="font-semibold">{ratio}</div>}
      <div className="text-neutral-400">
        {row.weight} lbs · {row.bodyFat}% fat · {row.weighIns} {row.weighIns === 1 ? 'weigh-in' : 'weigh-ins'}
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
 * The bands are the trend, not the weeks: two straight lines fitted through the
 * weigh-ins and the body-fat readings (see lib/massSplit.massTrend), so the
 * stack is a shape and not a saw-tooth. The weeks' own means stay on as faint
 * dots — one at the top of the stack for the week's weight, one at the seam for
 * its lean — so the evidence the trend was read from is still there to see.
 * Over the seam sits a haze, the band where the seam could really be: nothing
 * at the start, widening with the weeks, narrowing again as readings pile up.
 * While the haze is most of the stack the split is not yet a reading, and the
 * chart says so without a caption.
 *
 * Fat lost while muscle went on hangs below the zero line instead of eating into
 * the muscle band, so a recomp still reads as two honest figures.
 */
export function MassSplitChart({ trend, empty }: { trend: MassTrend | null; empty?: string }) {
  const readout = useChartReadout()
  const palette = useTheme()
  const colors = useMemo(() => tissueColors(palette), [palette])
  const id = useId()
  const muscleId = `${id}-muscle`
  const fatId = `${id}-fat`
  const fibers = useMemo(() => muscleFibers(MUSCLE_TILE.h), [])
  const cells = useMemo(() => fatCells(FAT_TILE.w, FAT_TILE.h), [])

  const points = useMemo(() => trend?.points ?? [], [trend])
  const rows: Row[] = useMemo(() => withTime(points), [points])
  // The axis frames the stack: everything gained piled above zero, anything lost
  // hung below it, the haze and the weekly dots inside it, and zero itself
  // always on the chart.
  const yScale = useMemo(
    () =>
      niceScale([
        0,
        ...rows.map((r) => Math.max(0, r.muscleGain) + Math.max(0, r.fatGain)),
        ...rows.map((r) => Math.min(0, r.muscleGain) + Math.min(0, r.fatGain)),
        ...rows.map((r) => r.muscleGain + r.seamError),
        ...rows.map((r) => r.muscleGain - r.seamError),
        ...rows.map((r) => r.weekTotalGain),
        ...rows.map((r) => r.weekMuscleGain),
      ]),
    [rows],
  )
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

  const toneColor = { light: colors.muscle.light, dark: colors.muscle.dark, seam: colors.muscle.seam }
  const ratio = gainRatioLabel(last.muscleGain, last.fatGain)
  const dotStyle = (fill: string) => ({ r: DOT_RADIUS, fill, fillOpacity: 0.55, stroke: CHART_SURFACE, strokeWidth: 0.75 })

  return (
    <div className="rounded-2xl bg-surface p-2" {...readout.card}>
      <div className="flex items-center justify-between px-3 pt-1 text-xs">
        <span className="flex gap-3">
          <span style={{ color: colors.muscle.edge }}>muscle {fmtGain(last.muscleGain)}</span>
          <span style={{ color: colors.fat.edge }}>
            fat {fmtGain(last.fatGain)}
            {last.seamError > 0 && <span className="text-neutral-500"> ± {last.seamError}</span>}
          </span>
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
          <defs>
            <pattern id={muscleId} patternUnits="userSpaceOnUse" width={MUSCLE_TILE.w} height={MUSCLE_TILE.h}>
              <rect width={MUSCLE_TILE.w} height={MUSCLE_TILE.h} fill={colors.muscle.base} />
              {fibers.map((f, i) => (
                <path
                  key={i}
                  d={fiberPath(f, MUSCLE_TILE.w)}
                  fill="none"
                  stroke={toneColor[f.tone]}
                  strokeWidth={f.width}
                  strokeOpacity={f.opacity}
                  strokeLinecap="round"
                />
              ))}
            </pattern>
            <pattern id={fatId} patternUnits="userSpaceOnUse" width={FAT_TILE.w} height={FAT_TILE.h}>
              <rect width={FAT_TILE.w} height={FAT_TILE.h} fill={colors.fat.base} />
              {cells.map((c, i) => (
                <g key={i} transform={`rotate(${c.tilt.toFixed(1)} ${c.cx.toFixed(2)} ${c.cy.toFixed(2)})`}>
                  {/* A shadow under the cell's lower edge, so each one rounds up off its neighbours. */}
                  <ellipse cx={c.cx + 0.6} cy={c.cy + 1} rx={c.rx} ry={c.ry} fill={colors.fat.wall} fillOpacity={0.5} />
                  <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill={colors.fat.cell} stroke={colors.fat.wall} strokeWidth={0.6} />
                </g>
              ))}
            </pattern>
          </defs>
          <CartesianGrid stroke={CHART_SURFACE_2} vertical={false} />
          <XAxis {...timeXAxis} ticks={ticks} interval={0} tick={axisTick} />
          <YAxis
            tick={axisTick}
            width={40}
            domain={yScale.domain}
            ticks={yScale.ticks}
            tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
          />
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
          {/* Where the seam could really sit: a haze over the muscle band's edge, two standard errors each way. */}
          <Area
            type="monotone"
            dataKey={(r: Row) => [r.muscleGain - r.seamError, r.muscleGain + r.seamError]}
            name="seam"
            stroke="none"
            fill={HAZE}
            fillOpacity={0.28}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          />
          {/* The weeks themselves: each week's mean weight at the top of the stack, its mean lean at the seam. */}
          <Line
            dataKey="weekTotalGain"
            name="week"
            stroke="none"
            dot={dotStyle(colors.fat.edge)}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          />
          <Line
            dataKey="weekMuscleGain"
            name="week lean"
            stroke="none"
            dot={dotStyle(colors.muscle.edge)}
            activeDot={false}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
