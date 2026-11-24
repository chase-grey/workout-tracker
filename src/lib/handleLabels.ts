import type { Handles } from './measure'

/**
 * Which way a dot's name tag runs from the dot: `start` begins at the dot and
 * runs right, `end` runs left and finishes at it, `center` sits astride it.
 */
export type LabelAnchor = 'start' | 'center' | 'end'

/** How far a tag that runs to one side still reaches back past its dot, in px. */
export const TAG_OVERHANG = 14

/** A tag's width in px, near enough: its letters at the small bold size, plus its padding. */
export const tagWidth = (label: string): number => label.length * 6.6 + 24

/** Dots this close to the middle of the group, as a share of the photo's width, sit astride. */
const CENTRED = 0.04

/**
 * Which way each dot's name tag runs, so that two dots a thumb's width apart —
 * the pelvic tilt's two hip bones — don't wear their names on top of each other.
 *
 * Each tag runs away from the middle of the group: the left dot's to the left,
 * the right dot's to the right. One that would run off the screen that way
 * turns round. `width` is the photo's width on screen in px, and `margin` the
 * clear space either side of it — a tall photo fitted to the screen's height
 * leaves some, and a tag may run out into it.
 */
export function labelAnchors(
  handles: Handles,
  specs: { key: string; label: string }[],
  width: number,
  margin = 0,
): Record<string, LabelAnchor> {
  const placed = specs.filter((s) => handles[s.key])
  const middle = placed.reduce((sum, s) => sum + handles[s.key].x, 0) / (placed.length || 1)
  const out: Record<string, LabelAnchor> = {}
  for (const spec of placed) {
    const p = handles[spec.key]
    const w = tagWidth(spec.label)
    const left = margin + p.x * width
    const right = margin + (1 - p.x) * width
    const fits: Record<LabelAnchor, boolean> = {
      start: right + TAG_OVERHANG >= w && left >= TAG_OVERHANG,
      end: left + TAG_OVERHANG >= w && right >= TAG_OVERHANG,
      center: left >= w / 2 && right >= w / 2,
    }
    const off = p.x - middle
    const roomier: LabelAnchor = right >= left ? 'start' : 'end'
    const order: LabelAnchor[] =
      Math.abs(off) < CENTRED
        ? ['center', roomier]
        : off > 0
          ? ['start', 'end', 'center']
          : ['end', 'start', 'center']
    out[spec.key] = order.find((a) => fits[a]) ?? roomier
  }
  return out
}
