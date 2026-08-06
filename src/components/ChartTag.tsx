import { usePlotArea } from 'recharts'
import { PAD_X, PAD_Y, tagBox, textWidth, type TagAlign, type TagSide } from '../lib/chartTag'

type ViewBox = { x?: number; y?: number; width?: number; height?: number }

/**
 * A label for chart furniture — target lines, lock marks, ETA dots — that stays
 * inside the plot and stays readable.
 *
 * Recharts' own `position` strings anchor a label to its mark and then let it
 * run off the plot when the mark sits on an edge: a target line drawn at the top
 * of the domain loses a label placed above it, and a vertical rule near the left
 * edge pushes its label onto the Y axis and the axis-break zigzag. This places
 * the tag itself — preferred side first, flipped to the other side when that one
 * won't fit, pulled inside the plot rectangle as a last resort (see
 * {@link tagBox}) — and paints the card colour behind the text so gridlines and
 * series don't show through the glyphs.
 *
 * Pass it as a mark's `label`; recharts clones it with that mark's `viewBox` —
 * the line's end-to-end rect, or the dot's bounding box.
 */
export function ChartTag({
  text,
  color,
  bg,
  size = 9,
  weight,
  align = 'start',
  side = 'below',
  nudge = 0,
  viewBox,
}: {
  text: string
  color: string
  /** The chart card's background, painted under the text. */
  bg: string
  size?: number
  /** Font weight, for a tag that names something the user is driving. */
  weight?: number
  align?: TagAlign
  side?: TagSide
  /** Extra vertical offset, for stacking a second tag clear of the first. */
  nudge?: number
  /** Injected by recharts when this element is a mark's `label`. */
  viewBox?: ViewBox
}) {
  const plot = usePlotArea()
  if (!viewBox) return null

  // Bold glyphs run a touch wider than the estimate's regular-weight assumption.
  const w = textWidth(text, size) * (weight != null && weight >= 600 ? 1.05 : 1) + PAD_X * 2
  const h = size + PAD_Y * 2
  const { left, top } = tagBox({
    vb: { x: viewBox.x ?? 0, y: viewBox.y ?? 0, width: viewBox.width ?? 0, height: viewBox.height ?? 0 },
    plot: plot ?? null,
    w,
    h,
    align,
    side,
    nudge,
  })

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={left} y={top} width={w} height={h} rx={3} fill={bg} opacity={0.85} />
      <text
        x={left + PAD_X}
        y={top + h / 2}
        fill={color}
        fontSize={size}
        fontWeight={weight}
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  )
}
