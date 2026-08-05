import { usePlotArea } from 'recharts'

/**
 * A little zigzag riding the primary Y axis, just above the X-axis baseline,
 * marking that the scale doesn't start at zero (so it's skipping the values
 * between zero and the first tick).
 *
 * Drop it among a chart's children — recharts renders it inside the SVG, and
 * {@link usePlotArea} gives the plot rectangle so the mark lands exactly on the
 * axis line regardless of margins, legends, or axis width. `bg` should match the
 * chart card's background so the rect masks the straight axis line behind the
 * zigzag. Renders nothing unless `broken`.
 */
export function AxisBreak({ broken, bg }: { broken: boolean; bg: string }) {
  const plot = usePlotArea()
  if (!broken || !plot) return null

  const x = plot.x
  const yBase = plot.y + plot.height
  const d = `M ${x} ${yBase} L ${x} ${yBase - 3} L ${x - 4} ${yBase - 6} L ${x + 4} ${yBase - 10} L ${x} ${yBase - 13}`

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x - 5} y={yBase - 14} width={10} height={14} fill={bg} />
      <path d={d} fill="none" stroke="#737373" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  )
}
