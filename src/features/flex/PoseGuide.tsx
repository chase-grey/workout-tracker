import type { ReactNode } from 'react'
import type { Handles, MeasureMode } from '../../lib/measure'

type Dot = [x: number, y: number]

/**
 * One pose as a stick figure on a 48×48 board, and where its dots go. Drawn
 * facing one way and mirrored to match the photo — see `flipped`.
 */
type Figure = {
  body: ReactNode
  dots: Dot[]
  /** The lines the photo draws between the dots, as index pairs into `dots`. */
  lines: [number, number][]
  /** Whether the photo shows the pose the other way round from the drawing. */
  flipped?: (h: Handles) => boolean
}

const head = (x: number, y: number) => <circle cx={x} cy={y} r={3.5} />

/**
 * Only the pelvic tilt has one. Its dots are placed by hand on two bones no
 * pose model finds, and "back hip bone" doesn't say where that is. Every other
 * pose's dots sit on joints their names already find, and a figure of the pose
 * is no use once the photo of it is taken.
 */
const FIGURES: Partial<Record<MeasureMode, Figure>> = {
  // Standing side-on, facing the right of the drawing. The body is drawn with
  // its thickness, because the two dots sit on its back and its front, not on a
  // joint in the middle of it: the bone at the dimple above each buttock, and
  // the point of the hip at the front, below the waistband.
  pelvic_tilt: {
    body: (
      <>
        {head(25, 6)}
        <path d="M28.5 6.5 L30.5 7.5" />
        <path d="M24 14 L24 27" strokeWidth={10} opacity={0.45} />
        <path d="M24 27 L24 43" strokeWidth={7} opacity={0.45} />
        <path d="M24 43 L31 43" />
      </>
    ),
    dots: [
      [19, 24],
      [29, 26.5],
    ],
    lines: [[0, 1]],
    flipped: (h) => !!h.front && !!h.back && h.front.x < h.back.x,
  },
}

/**
 * Where a pose's dots belong, drawn: a stick figure in the pose with the dots
 * on it, facing the way the photo does. The dots on the photo carry their names;
 * this is the picture of the same thing, for a body part a name alone doesn't
 * find. Nothing for a pose without one.
 */
export function PoseGuide({
  mode,
  handles,
  className = '',
}: {
  mode: MeasureMode
  handles: Handles
  className?: string
}) {
  const fig = FIGURES[mode]
  if (!fig) return null
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={`text-neutral-400 ${className}`}>
      <g transform={fig.flipped?.(handles) ? 'translate(48 0) scale(-1 1)' : undefined}>
        <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {fig.body}
        </g>
        {fig.lines.map(([a, b], i) => (
          <line
            key={i}
            x1={fig.dots[a][0]}
            y1={fig.dots[a][1]}
            x2={fig.dots[b][0]}
            y2={fig.dots[b][1]}
            className="stroke-accent"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}
        {fig.dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.8} className="fill-accent stroke-white" strokeWidth={1} />
        ))}
      </g>
    </svg>
  )
}
