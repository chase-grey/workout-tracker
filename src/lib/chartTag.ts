/**
 * Placement for chart-furniture labels — the geometry behind
 * {@link ../components/ChartTag.ChartTag}, kept apart from it so it can be
 * reasoned about (and tested) without a chart to render into.
 */

/** Breathing room inside the chip, and between the chip and the mark it labels. */
export const PAD_X = 4
export const PAD_Y = 2
const GAP = 4
/**
 * Inset from the plot edges. The left one is wider so a tag pulled back inside
 * clears the axis-break zigzag, which straddles the axis line by a few pixels.
 */
const INSET_LEFT = 8
const INSET = 2

export type Rect = { x: number; y: number; width: number; height: number }

/** Horizontal placement: running right from the mark, ending at it, or centred on it. */
export type TagAlign = 'start' | 'end' | 'center'
/** Preferred vertical side of the mark. A vertical rule reads this as which end to hug. */
export type TagSide = 'above' | 'below'

const NARROW = new Set(['.', ',', ':', '/', '1', 'i', 'l', 'j', 't', 'f', 'r', ' '])

/**
 * Rough rendered width of a short label. SVG text can't be measured until it's
 * in the document, and the chip only has to sit behind the glyphs — so this errs
 * wide rather than costing a measure-and-reflow pass.
 */
export function textWidth(text: string, fontSize: number): number {
  let em = 0
  for (const ch of text) em += NARROW.has(ch) ? 0.34 : 0.58
  return em * fontSize
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * Where a `w × h` tag goes for a mark whose bounding box is `vb`, inside plot
 * rectangle `plot` (null before the chart has measured itself, which just means
 * nothing is pulled back inside yet).
 *
 * A vertical rule's box is the full height of the plot, so both sides overflow
 * and the tag falls through to the clamp — which parks it just inside whichever
 * end `side` pointed at. That's what lets one rule cover lines either way up and
 * dots as well.
 */
export function tagBox({
  vb,
  plot,
  w,
  h,
  align = 'start',
  side = 'below',
  nudge = 0,
}: {
  vb: Rect
  plot: Rect | null
  w: number
  h: number
  align?: TagAlign
  side?: TagSide
  nudge?: number
}): { left: number; top: number } {
  const above = vb.y - GAP - h + nudge
  const below = vb.y + vb.height + GAP + nudge
  const start = vb.x + GAP
  const end = vb.x + vb.width - GAP - w

  const fitsY = (top: number) => plot == null || (top >= plot.y && top + h <= plot.y + plot.height)
  const fitsX = (left: number) => plot == null || (left >= plot.x && left + w <= plot.x + plot.width)

  // Flip to the far side only when the preferred one overflows and the other
  // actually fits — so a tag never trades a clipped edge for a worse corner.
  let top = side === 'above' ? above : below
  if (!fitsY(top) && fitsY(side === 'above' ? below : above)) top = side === 'above' ? below : above

  let left = align === 'center' ? vb.x + vb.width / 2 - w / 2 : align === 'end' ? end : start
  if (align !== 'center' && !fitsX(left) && fitsX(align === 'end' ? start : end)) {
    left = align === 'end' ? start : end
  }

  if (plot == null) return { left, top }
  return {
    left: clamp(left, plot.x + INSET_LEFT, plot.x + plot.width - w - INSET),
    top: clamp(top, plot.y + INSET, plot.y + plot.height - h - INSET),
  }
}
