import type { ReactNode } from 'react'
import type { Handles, MeasureMode } from '../../lib/measure'

type Dot = [x: number, y: number]

/**
 * One pose as a stick figure on a 48×48 board, and where its dots go. The
 * side-on ones are drawn facing one way and mirrored to match the photo — see
 * `flipped`.
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

/** Standing on one leg, the other lifted out to the left of the drawing. */
const LEG_LIFT: Figure = {
  body: (
    <>
      {head(31.5, 7)}
      <path d="M31 11 L30 25 L30 43 M30 25 L9 30 M31 15 L39 22" />
    </>
  ),
  dots: [
    [30, 25],
    [30, 43],
    [9, 30],
  ],
  lines: [
    [0, 1],
    [0, 2],
  ],
  flipped: (h) => !!h.ankleLift && !!h.hip && h.ankleLift.x > h.hip.x,
}

const FIGURES: Record<MeasureMode, Figure> = {
  split: {
    body: (
      <>
        {head(24, 7)}
        <path d="M24 11 L24 27 M24 15 L15 24 M24 15 L33 24 M24 27 L5 41 M24 27 L43 41" />
      </>
    ),
    dots: [
      [24, 27],
      [5, 41],
      [43, 41],
    ],
    lines: [
      [0, 1],
      [0, 2],
    ],
  },

  tailors: {
    body: (
      <>
        {head(24, 7)}
        <path d="M24 11 L24 30 M24 15 L14 27 M24 15 L34 27 M24 30 L8 35 L24 41 M24 30 L40 35 L24 41" />
      </>
    ),
    dots: [
      [24, 41],
      [8, 35],
      [40, 35],
    ],
    lines: [
      [0, 1],
      [0, 2],
    ],
  },

  // Folded forward, facing the left of the drawing.
  toe_touch: {
    body: (
      <>
        {head(12.5, 33.5)}
        <path d="M31 19 L16 29 M31 19 L31 43 L25 43 M16 29 L18 42" />
      </>
    ),
    dots: [
      [16, 29],
      [31, 19],
      [31, 43],
    ],
    lines: [
      [1, 0],
      [1, 2],
    ],
    flipped: (h) => !!h.shoulder && !!h.hip && h.shoulder.x > h.hip.x,
  },

  leg_lift_left: LEG_LIFT,
  leg_lift_right: LEG_LIFT,

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
 * find.
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
