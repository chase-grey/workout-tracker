/**
 * What the phone's screen looked like, as text small enough to post.
 *
 * A visual complaint from the phone ("the figure is off the bottom", "the nav
 * covers the chart") can't be reproduced from a desk: the desk has a different
 * browser, a different viewport, and no phone chrome. This is the phone's own
 * account of the screen: which browser, how big the viewport really is, which
 * animation is up, and where the boxes that matter landed. It rides the
 * save_errors channel as one more report (see services/screenReport), and
 * `npm run save-errors` prints it.
 *
 * The gathering is in the service; what's here is the shape and the trimming,
 * which is the part worth a test.
 */

export type Box = { x: number; y: number; w: number; h: number }

export type ScreenFacts = {
  /** Which screen the report was asked for from: a tab, or a session. */
  screen: string
  userAgent: string
  /** The layout viewport, CSS px. */
  inner: { w: number; h: number }
  /** The visual viewport, which is what the keyboard and a pinch change. */
  visual: { w: number; h: number; top: number; left: number; scale: number } | null
  /** The device's own screen, CSS px, and its pixel ratio. */
  device: { w: number; h: number; dpr: number }
  /** standalone (installed) or browser. */
  display: string
  mode: string
  reducedMotion: boolean
  /** The tab the nav marks current, when the nav is on screen. */
  tab: string | null
  /** `family:variant` of every rotated animation on screen, oldest first. */
  animations: string[]
  /** Where the named parts of the screen landed, in CSS px from the viewport's corner. */
  boxes: { name: string; box: Box }[]
  /** How far the page's scroller has moved, and how far it could. */
  scroll: { top: number; height: number; client: number } | null
  /** The screen's text, one entry per line. */
  text: string[]
}

/** Lines of text kept, and how long each may be. The cell this lands in holds 45,000 characters. */
export const TEXT_LINES_MAX = 80
export const TEXT_LINE_MAX = 120
export const BOXES_MAX = 40

const round = (n: number) => Math.round(n * 10) / 10

/** A box with its numbers cut to a tenth of a pixel. */
export function roundBox(b: Box): Box {
  return { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }
}

/**
 * The screen's text as short lines: blank ones dropped, runs of whitespace
 * closed up, each cut to length, and no more of them than fit.
 */
export function textLines(raw: string): string[] {
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((l) => (l.length > TEXT_LINE_MAX ? `${l.slice(0, TEXT_LINE_MAX - 1)}…` : l))
  if (lines.length <= TEXT_LINES_MAX) return lines
  return [...lines.slice(0, TEXT_LINES_MAX), `… ${lines.length - TEXT_LINES_MAX} more lines`]
}

/** The facts as they are posted: boxes rounded and capped, text trimmed. */
export function trimFacts(facts: ScreenFacts): ScreenFacts {
  return {
    ...facts,
    boxes: facts.boxes.slice(0, BOXES_MAX).map((b) => ({ name: b.name, box: roundBox(b.box) })),
    text: textLines(facts.text.join('\n')),
  }
}

/**
 * Which named boxes run past the bottom or the sides of the viewport: the
 * first thing to look for when something is "cut off".
 */
export function boxesOutside(facts: Pick<ScreenFacts, 'inner' | 'boxes'>): string[] {
  return facts.boxes
    .filter(({ box }) => box.w > 0 && box.h > 0)
    .filter(
      ({ box }) =>
        box.x < -0.5 || box.y < -0.5 || box.x + box.w > facts.inner.w + 0.5 || box.y + box.h > facts.inner.h + 0.5,
    )
    .map((b) => b.name)
}
