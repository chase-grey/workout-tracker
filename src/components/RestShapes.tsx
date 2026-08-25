import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import {
  BEAD_COUNT,
  BEAD_R,
  createCoalescence,
  createFission,
  createGathering,
  createShedding,
  fieldAt,
  type BeadField,
  type BeadPlan,
} from '../lib/beads'
import { type ExtraVariant } from '../lib/restShapes'
import { createSnow, flakeLook, isSettled, stepSnow, type Snow } from '../lib/snow'
import { createSpiral, pointAt, shareAt, spiralPath } from '../lib/spiral'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'

/**
 * More time-telling shapes for rest — see components/RestTimer, which owns the
 * rotation and the countdown, for the contract these all keep to: `fraction` is
 * how much rest is still left (1 at the start, 0 when it's up), and each shape
 * maps it straight onto its dominant dimension so the shape *is* the timer. Any
 * looping motion is texture and never drives that dimension.
 *
 * The shapes already in RestTimer all read the same two ways — a level falling
 * down a vessel, or a length along a path. These are the mechanics that were
 * missing, which is why each of them looks unlike the others at a glance and not
 * just up close:
 *
 *  - *filling*, not draining: rest as a recharge that completes, so what you see
 *    at zero is a full cell rather than an empty one — `recharge`, `tap`, `plates`.
 *  - a *closing gap* between two things travelling toward each other, which lands
 *    as an event when they meet — `fuse`, `icicle`.
 *  - an *angle* — `scale`.
 *  - a *width* — `ice`, which is the only shape here that reads horizontally.
 *  - a *radius* — `moon`, `spiral`, `globe`.
 *  - a *count* — the glass beads, which are the only shapes here that need nothing
 *    measured against anything: `beads` joins seven of them down to one, `split`
 *    breaks one into seven, `shed` empties a mass of them off the pane altogether,
 *    and `gather` collects seven out of the dark into one.
 *
 * A shape that fills is exactly as honest as one that drains: `1 - fraction` is
 * the same reading upside down, and it still lands on the tick.
 */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Smooths the countdown's 250ms steps into one continuous move. Every level here
 * carries this for the same reason RestTimer's boxed shapes do — without it the
 * shape ticks four times a second instead of moving.
 */
const DRAIN = '260ms linear'

/** `height`, `width` and the rest all take the same easing; this saves repeating it. */
const drainOf = (property: string): CSSProperties => ({
  transition: `${property} ${DRAIN}`,
})

const pct = (n: number) => `${n}%`

/* ------------------------------------------------------------------ recharge */

/**
 * The 'recharge' shape: a cell that fills as the rest runs down, reaching full
 * exactly as rest ends.
 *
 * The only shape here that reads as *finished* rather than *empty* at zero, which
 * is the whole reason it exists — a rest between sets is a recharge, and a shape
 * that tops out says so where a shape that drains away says the opposite.
 *
 * The sweeping band is inside the fill rather than over the whole cell on purpose.
 * Across the empty part it would read as charge that isn't there, and the level
 * would stop being the reading.
 */
function RechargeCell({ fraction }: { fraction: number }) {
  const charged = 1 - clamp01(fraction)
  const full = charged > 0.995
  return (
    <div className="absolute inset-y-[9%] left-1/2 w-[44%] -translate-x-1/2" aria-hidden>
      {/* The terminal, so the shape reads as a cell and not as a bar. */}
      <div className="absolute left-1/2 top-0 h-[3.5%] w-[26%] -translate-x-1/2 rounded-t-full bg-accent-bright/60" />
      <div className="absolute inset-x-0 bottom-0 top-[3.5%] overflow-hidden rounded-[7%] ring-2 ring-accent-bright/50">
        <div className="absolute inset-0 bg-accent-bright/10" />
        <div
          className="absolute inset-x-0 bottom-0 overflow-hidden bg-accent-bright/75"
          style={{ height: pct(charged * 100), ...drainOf('height') }}
        >
          {/* The charge line is the reading; everything below it is texture. */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-accent-bright" />
          <div
            className="rest-charge-sweep absolute inset-x-0 bottom-0 h-[26%]"
            style={{
              backgroundImage:
                'linear-gradient(to top, transparent, var(--color-accent-bright), transparent)',
            }}
          />
        </div>
        {/* Drawn over the fill, so it reads against the charged part and the empty
            part alike, and goes solid once the cell is full. */}
        <svg
          className={`absolute left-1/2 top-1/2 h-[30%] w-[42%] -translate-x-1/2 -translate-y-1/2 text-accent-bright ${
            full ? 'rest-charge-done' : 'rest-glow'
          }`}
          viewBox="0 0 24 34"
          fill={full ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
        >
          <path d="M14 1 L3 19 h7 l-2 14 13-20 h-7 z" />
        </svg>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------------- tap */

/**
 * How long one drip takes from spout to surface, in ms, and where in that cycle it
 * lands. The ripple runs on the same period at that offset, so the two stay in
 * step for the whole rest instead of drifting apart.
 */
const DRIP_MS = 1900
const DRIP_LANDS = 0.52

/** Where the glass sits in the box, in percentages — shared by the water and the falling drips. */
const GLASS = { top: 34, bottom: 6, spout: 21 } as const

/**
 * The 'tap' shape: a tap dripping into a glass, the glass filling as the rest runs
 * down. The inverse of RestTimer's `tide` — same vessel, the other direction.
 *
 * The drips are texture, but texture with a cause: each one lands on the surface
 * and rings it. What they can't do is put water in the glass — the level comes
 * from the countdown, and a drip that appeared to raise it would be claiming to
 * tell the time. So they fall on a fixed cadence whatever the level, and the
 * ripple is pinned to the surface line by riding a layer exactly as tall as the
 * water, the way the tide's bubbles are.
 */
function DrippingTap({ fraction }: { fraction: number }) {
  const filled = 1 - clamp01(fraction)
  // Air between the spout and the water: the drop's whole journey, which shortens
  // as the glass fills.
  const glassHeight = 100 - GLASS.top - GLASS.bottom
  const surface = GLASS.top + (1 - filled) * glassHeight
  const fallHeight = Math.max(0, surface - GLASS.spout)

  return (
    <div className="absolute inset-0 text-accent-bright" aria-hidden>
      {/* The tap: a riser, an arm out over the glass, and a spout turned down. */}
      <div className="absolute left-[16%] top-[2%] h-[13%] w-[7%] rounded-t-sm bg-accent-bright/45" />
      <div className="absolute left-[16%] top-[11%] h-[6%] w-[36%] rounded-sm bg-accent-bright/45" />
      <div className="absolute left-[46%] top-[15%] h-[6%] w-[8%] rounded-b-md bg-accent-bright/55" />
      {/* The handle, so it reads as a tap rather than as pipework. */}
      <div className="absolute left-[13%] top-[0%] h-[3%] w-[13%] rounded-full bg-accent-bright/55" />

      {/* Drips. The column spans the air gap, so translating it its own height
          carries the drop from the spout exactly onto the surface however full the
          glass is — the same trick the tide's risers use. */}
      <div
        className="absolute inset-x-0"
        style={{
          top: pct(GLASS.spout),
          height: pct(fallHeight),
          ...drainOf('height'),
        }}
      >
        {[0, 0.5].map((phase) => (
          <div
            key={phase}
            className="rest-drip-fall absolute inset-y-0"
            style={{ animationDelay: `${phase * DRIP_MS}ms` }}
          >
            <div className="absolute left-[49.5%] top-0 aspect-square w-[3.5%] -translate-x-1/2 rounded-full bg-accent-bright" />
          </div>
        ))}
      </div>

      {/* The glass: open at the top, so it reads as a tumbler and not a tube. */}
      <div
        className="absolute left-1/2 w-[42%] -translate-x-1/2 overflow-hidden rounded-b-[18%] border-x-2 border-b-2 border-accent-bright/50"
        style={{ top: pct(GLASS.top), bottom: pct(GLASS.bottom) }}
      >
        <div className="absolute inset-0 bg-accent-bright/8" />
        <div
          className="absolute inset-x-0 bottom-0 bg-accent-bright/60"
          style={{ height: pct(filled * 100), ...drainOf('height') }}
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-accent-bright" />
          {/* Rings spreading from where each drop lands, delayed by the fall so
              they answer a drip rather than firing on their own. */}
          {[0, 0.5].map((phase) => (
            <div
              key={phase}
              className="rest-drip-ring absolute left-1/2 top-0 h-[7%] w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-accent-bright"
              style={{ animationDelay: `${(phase + DRIP_LANDS) * DRIP_MS}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- plates */

/**
 * Plate heights from the collar outward, as percentages of the box — a real bar
 * loads heaviest inside, and the descending stack is most of what makes this read
 * as a barbell rather than as a row of bars.
 */
const PLATE_HEIGHTS = [80, 64, 50, 38, 27] as const

/** Plate width, and the gap between two of them. */
const PLATE_W = 6.5
const PLATE_GAP = 1.2

/** How far from the middle the innermost plate sits. */
const COLLAR = 7

/**
 * The 'plates' shape: a bar being loaded, a plate at a time, ready exactly when the
 * rest is up.
 *
 * Counting, like RestTimer's `pips` — and the incoming plate grows into place for
 * the same reason a pip drains rather than switching off, so the count moves
 * continuously instead of hopping. What the theme buys over a column of segments
 * is that this is the one shape that says what the rest is *for*.
 */
function LoadingBar({ fraction }: { fraction: number }) {
  const loaded = (1 - clamp01(fraction)) * PLATE_HEIGHTS.length
  return (
    <div className="absolute inset-0" aria-hidden>
      {/* The shaft, with a collar either side of the grip. */}
      <div className="absolute inset-x-[3%] top-1/2 h-[3.5%] -translate-y-1/2 rounded-full bg-accent-bright/30" />
      {([-1, 1] as const).map((side) => (
        <div
          key={side}
          className="absolute top-1/2 h-[6%] w-[1.6%] -translate-y-1/2 rounded-sm bg-accent-bright/50"
          style={{ left: pct(50 + side * (COLLAR - 1.6)) }}
        />
      ))}
      {([-1, 1] as const).map((side) =>
        PLATE_HEIGHTS.map((height, i) => {
          // The leading plate is the one arriving: it grows in rather than
          // appearing, so the boundary slides outward along the bar.
          const arrived = clamp01(loaded - i)
          const centre = COLLAR + PLATE_W / 2 + i * (PLATE_W + PLATE_GAP)
          return (
            <div
              key={`${side}-${i}`}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: pct(50 + side * centre),
                width: pct(PLATE_W),
                height: pct(height),
              }}
            >
              {/* An empty slot, so the bar shows how much is still to come. */}
              <div className="absolute inset-0 rounded-[22%] bg-accent-bright/8" />
              <div
                className={`absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-[22%] bg-accent-bright/80 ${
                  arrived > 0 && arrived < 1 ? 'rest-glow' : ''
                }`}
                style={{ height: pct(arrived * 100), ...drainOf('height') }}
              />
            </div>
          )
        }),
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- scale */

/** How far the beam tips at the extremes, in degrees. */
const TILT = 13

/** The scale's geometry in its own 100 × 100 box. */
const SCALE = {
  pivot: { x: 50, y: 31 },
  /** How far out along the beam each pan hangs. */
  arm: 31,
  /** Where the pans hang to, and how deep their bowls are. */
  panY: 55,
  bowl: 13,
} as const

/**
 * The 'scale' shape: a balance that tips from one side to the other over the rest.
 *
 * Three readings of the same number, which is what makes it legible from across a
 * gym: the beam's *angle*, the heap in the left pan (the rest still to come) and
 * the heap in the right (the rest already had). Level at the halfway mark.
 *
 * The pans hang plumb whatever the beam does — each is counter-rotated about its
 * own anchor inside the beam's rotation, so it swings from a tipping arm without
 * tipping itself. Their gentle sway is a separate, CSS-driven group inside that,
 * because a CSS `transform` would otherwise win against the attribute doing the
 * counter-rotation and the pans would hang askew.
 */
function BalanceScale({ fraction }: { fraction: number }) {
  const id = useId().replace(/\W/g, '')
  const left = clamp01(fraction)
  // Negative rotation is counter-clockwise, which drops the left end: heavy with
  // rest still to come at the start, and heavy the other way once it is spent.
  const angle = TILT * (1 - 2 * left)
  const { pivot, arm, panY, bowl } = SCALE

  const pan = (x: number, fill: number) => {
    const rim = bowl
    const bowlPath = `M ${x - rim} ${panY} A ${rim} ${bowl} 0 0 0 ${x + rim} ${panY} Z`
    const heap = fill * bowl
    return (
      <g key={x} transform={`rotate(${-angle} ${x} ${pivot.y})`}>
        <g className="rest-pan-sway">
          {/* Chains from the beam's end out to the rim. */}
          <path
            d={`M ${x} ${pivot.y} L ${x - rim} ${panY} M ${x} ${pivot.y} L ${x + rim} ${panY}`}
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1.4}
            fill="none"
          />
          <path d={bowlPath} fill="currentColor" fillOpacity={0.12} />
          {/* What the pan is carrying. Clipped to the bowl, so the heap narrows
              toward the bottom the way anything in a round dish does. */}
          <clipPath id={`${id}-bowl-${x}`}>
            <path d={bowlPath} />
          </clipPath>
          <g clipPath={`url(#${id}-bowl-${x})`}>
            <rect
              x={x - rim}
              width={rim * 2}
              y={panY + bowl - heap}
              height={heap}
              fill="currentColor"
              fillOpacity={0.8}
              style={{ transition: `y ${DRAIN}, height ${DRAIN}` }}
            />
          </g>
          <path
            d={bowlPath}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.55}
            strokeWidth={1.6}
          />
        </g>
      </g>
    )
  }

  return (
    <div className="absolute inset-0 text-accent-bright" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        {/* The stand: a plinth and a post up to the pivot. */}
        <g fill="currentColor">
          <rect x={30} y={92} width={40} height={6} rx={3} fillOpacity={0.6} />
          <rect x={46.5} y={pivot.y} width={7} height={92 - pivot.y} fillOpacity={0.45} />
          <path
            d={`M ${pivot.x} ${pivot.y - 7} L ${pivot.x + 6} ${pivot.y + 3} L ${pivot.x - 6} ${pivot.y + 3} Z`}
            fillOpacity={0.7}
          />
        </g>
        <g transform={`rotate(${angle} ${pivot.x} ${pivot.y})`} style={drainOf('transform')}>
          <rect
            x={pivot.x - arm - 3}
            y={pivot.y - 1.6}
            width={(arm + 3) * 2}
            height={3.2}
            rx={1.6}
            fill="currentColor"
            fillOpacity={0.65}
          />
          {pan(pivot.x - arm, left)}
          {pan(pivot.x + arm, 1 - left)}
        </g>
      </svg>
    </div>
  )
}

/* ---------------------------------------------------------------------- moon */

const MOON = { cx: 50, cy: 48, r: 33 } as const

/**
 * The lit part of a moon showing `lit` of its face, keeping the left limb — so the
 * light shrinks back toward that edge as the rest runs out.
 *
 * The boundary is the real thing: a semi-ellipse whose width is `R·|1 − 2·lit|`,
 * which is flat at half and hugs one limb or the other at the extremes. That also
 * makes the lit *width* exactly `2·R·lit` at every phase — linear in the
 * countdown, which is the reading. A straight-edged shadow would have been easier
 * and would have read as an eclipse instead of as a phase.
 */
function moonPath(lit: number): string {
  const { cx, cy, r } = MOON
  const terminator = r * Math.abs(1 - 2 * lit)
  // Gibbous bulges into the dark side, crescent away from it; both arcs run from
  // the bottom back up to the top, so the sweep flag is what flips the bulge.
  const sweep = lit > 0.5 ? 0 : 1
  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 0 0 ${cx} ${cy + r}`,
    `A ${terminator} ${r} 0 0 ${sweep} ${cx} ${cy - r}`,
    'Z',
  ].join(' ')
}

/** Craters, as offsets from the moon's centre in units of its radius. */
const MARIA = [
  { dx: -0.42, dy: -0.3, r: 0.19 },
  { dx: -0.1, dy: 0.26, r: 0.24 },
  { dx: -0.55, dy: 0.36, r: 0.13 },
  { dx: 0.12, dy: -0.44, r: 0.12 },
] as const

/** Stars, placed clear of the disc, each twinkling on its own beat. */
const STARS = [
  { x: 12, y: 14, s: 2.1, delay: 0 },
  { x: 88, y: 22, s: 1.7, delay: 1.1 },
  { x: 78, y: 8, s: 1.2, delay: 2.3 },
  { x: 18, y: 88, s: 1.5, delay: 0.7 },
  { x: 92, y: 74, s: 2, delay: 1.8 },
  { x: 6, y: 52, s: 1.3, delay: 3 },
  { x: 62, y: 94, s: 1.6, delay: 2.6 },
] as const

/**
 * The 'moon' shape: a moon waning from full to new over the rest.
 *
 * The calmest shape in the set, and the one that reads at the longest distance —
 * there is nothing to it but a lit area and its boundary, both moving slowly. The
 * craters ride inside the lit part, so they appear and disappear with it rather
 * than sitting on the disc.
 */
function WaningMoon({ fraction }: { fraction: number }) {
  const id = useId().replace(/\W/g, '')
  const lit = clamp01(fraction)
  const { cx, cy, r } = MOON
  const path = moonPath(lit)

  return (
    <div className="absolute inset-0 text-accent-bright" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        <defs>
          <clipPath id={`${id}-lit`}>
            <path d={path} />
          </clipPath>
        </defs>
        {STARS.map((star) => (
          <circle
            key={`${star.x}-${star.y}`}
            className="rest-star"
            cx={star.x}
            cy={star.y}
            r={star.s}
            fill="currentColor"
            style={{ animationDelay: `${star.delay}s` }}
          />
        ))}
        {/* The unlit moon, so the disc is still there once the light has gone. */}
        <circle cx={cx} cy={cy} r={r} fill="currentColor" fillOpacity={0.1} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeWidth={1.2}
        />
        <path d={path} fill="currentColor" fillOpacity={0.85} />
        <g clipPath={`url(#${id}-lit)`}>
          {MARIA.map((m) => (
            <circle
              key={`${m.dx}-${m.dy}`}
              cx={cx + m.dx * r}
              cy={cy + m.dy * r}
              r={m.r * r}
              fill="#000"
              opacity={0.16}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

/* -------------------------------------------------------------------- spiral */

/**
 * The coil, sampled once at module scope: it never changes shape, only how much of
 * it is drawn. See lib/spiral for why the dash is looked up rather than taken
 * straight from the fraction.
 */
const COIL = createSpiral({ cx: 50, cy: 50, inner: 5, outer: 43, turns: 3.2 })
const COIL_PATH = spiralPath(COIL)

/**
 * The 'spiral' shape: a coil of rope paying out, the free end travelling inward
 * over the rest.
 *
 * The reading is the coil's outer radius, which falls at a steady rate — see
 * lib/spiral, where the work of making that true against a dash measured in arc
 * length is done. The tracer at the free end is what turns a shrinking shape into
 * something with a direction.
 */
function UnspoolingSpiral({ fraction }: { fraction: number }) {
  const left = clamp01(fraction)
  const drawn = shareAt(COIL, left)
  const tip = pointAt(COIL, left)

  return (
    <div className="absolute inset-0 text-accent-bright" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        <g fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round">
          {/* The whole coil, dim: the path the rope has already left. */}
          <path d={COIL_PATH} strokeOpacity={0.12} />
          {/* pathLength normalises the dash to 0–1, so the looked-up share goes
              straight in. */}
          <path
            d={COIL_PATH}
            pathLength={1}
            strokeDasharray={`${drawn} 1`}
            style={drainOf('stroke-dasharray')}
          />
        </g>
        {/* The free end. Translated rather than moved by cx/cy so the position
            transitions on the compositor along with everything else. */}
        {left > 0 && (
          <g
            style={{
              transform: `translate(${tip.x}px, ${tip.y}px)`,
              ...drainOf('transform'),
            }}
          >
            <circle className="rest-glow" r={4.4} fill="currentColor" />
          </g>
        )}
      </svg>
    </div>
  )
}

/* ----------------------------------------------------------------------- ice */

/** The cube at full size and once it has gone, as percentages of the box. */
const CUBE = {
  height: 54,
  width: { min: 24, max: 56 },
  radius: { min: 10, max: 44 },
} as const

/** The puddle it leaves, at the start and at the end. */
const PUDDLE = { min: 18, max: 92 } as const

/** Where the cube stands and the puddle lies. */
const FLOOR = 22

/**
 * The 'ice' shape: a cube melting into a puddle.
 *
 * The only shape in the set that reads *sideways* — the puddle spreading outward
 * is the primary reading, and it means this one is recognisable at a glance before
 * you have parsed any of it, simply because nothing else here grows horizontally.
 * The cube's height carries the same number vertically, and its corners round off
 * as it goes, which is what stops it reading as a square being scaled down.
 */
function MeltingIce({ fraction }: { fraction: number }) {
  const left = clamp01(fraction)
  const gone = 1 - left
  const width = CUBE.width.min + (CUBE.width.max - CUBE.width.min) * left
  const radius = CUBE.radius.min + (CUBE.radius.max - CUBE.radius.min) * gone

  return (
    <div className="absolute inset-0" aria-hidden>
      {/* The puddle, under the cube so the cube always sits in it. */}
      <div
        className="absolute left-1/2 h-[7%] -translate-x-1/2 rounded-[50%] bg-accent-bright/35"
        style={{
          bottom: pct(FLOOR - 3),
          width: pct(PUDDLE.min + (PUDDLE.max - PUDDLE.min) * gone),
          transition: `width ${DRAIN}`,
        }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 overflow-hidden bg-accent-bright/55"
        style={{
          bottom: pct(FLOOR),
          width: pct(width),
          height: pct(CUBE.height * left),
          borderRadius: pct(radius),
          transition: `width ${DRAIN}, height ${DRAIN}, border-radius ${DRAIN}`,
        }}
      >
        {/* Facets, so it reads as a block of ice rather than a rounded rectangle. */}
        <div className="absolute left-[14%] top-[10%] h-[76%] w-[16%] -rotate-12 rounded-full bg-white/20" />
        <div className="absolute left-[40%] top-[18%] h-[54%] w-[9%] -rotate-12 rounded-full bg-white/12" />
        <div className="rest-frost absolute inset-0" />
      </div>
      {/* Meltwater, running off the underside into the puddle. Fixed geometry: the
          drop stays the same size and falls the same short distance whatever is
          left of the cube, and it is kept well inside the narrowest the cube ever
          gets so it never drips from thin air. */}
      {left > 0.04 && (
        <div
          className="absolute inset-x-0"
          style={{ bottom: pct(FLOOR - 4), height: pct(5) }}
        >
          {[42, 57].map((x, i) => (
            <div
              key={x}
              className="rest-ice-drip absolute top-0 aspect-square w-[3%] rounded-full bg-accent-bright"
              style={{ left: pct(x), animationDelay: `${i * 1.15}s` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- globe */

/** Flakes in the globe. Enough that the count in the air reads as a level, few enough to move on one frame budget. */
const FLAKE_COUNT = 34

/**
 * How much of the globe's height a full drift takes. Half: a bank that climbs past
 * the middle crowds the glass into a lens of snow with a sliver of air over it, and
 * the shape stops reading as a globe with weather in it. Stopped at the waterline
 * the drift still reads as full — it is the tallest the bank ever gets, and the
 * pulse round the glass is what says the rest is over.
 */
const DRIFT_MAX = 0.5

/** How high the drift's middle stands over its edges, in the drift SVG's units. */
const DRIFT_CROWN = 5

/**
 * How far below the bottom of its box the drift's body is drawn, in the same units.
 * The bank is drawn once and slid up, and the slide is nearly a full box at the top
 * of its travel; a body that stopped at the box's own floor would ride up with it
 * and leave the bottom of the glass unpainted — snow sitting on a dark band. Enough
 * to stay under the glass at every height the drift can reach.
 */
const DRIFT_FOOT = 200

/**
 * How high the drift's *average* surface stands over the bottom of its box, in the
 * same units. The bank's edges stand `DRIFT_CROWN` above the bottom and its middle
 * `2 × DRIFT_CROWN`, and a quadratic averages a third of its rise below its peak.
 *
 * This is the line the countdown is put on, and the line the flakes land on, so the
 * bank sits at the height the clock asked for on average rather than only at its
 * peak — which is what keeps a flake landing near the side of the glass from
 * touching down noticeably above the snow there.
 */
const DRIFT_MEAN = (5 * DRIFT_CROWN) / 3

/**
 * The 'globe' shape: a snow globe shaken at the start of the rest, its drift rising
 * as the rest runs down and the snow above it settling onto that drift a flake at a
 * time.
 *
 * Readings that agree — see lib/snow, which owns them all: the drift's height is
 * the rest already spent, the snow still in the air is the rest still to come, and
 * how low a flake floats is how close its own turn is. The floating itself is
 * texture, and it is simulated rather than keyframed for the same reason the
 * candle's flame is: a loop of snow is a loop, and the eye finds it inside a couple
 * of seconds.
 *
 * Every flake is in the glass from the first frame and none of them recycles, so
 * the snow fills the globe from the lid down to the drift for the whole rest rather
 * than blowing through it as a front with a hole behind.
 *
 * What makes zero legible is that flakes *land*. Each one is called down by the
 * countdown, drifts the last of the way down to the drift and melts into it, so the
 * snow leaves the air at the bottom of the glass where the bank is — never by fading
 * out halfway up, which says only that a dot went away. The last one touches down as
 * the clock runs out, and the globe then holds a state it holds at no other point in
 * the rest: half full of settled snow, with nothing moving above it.
 */
function SnowGlobe({ fraction }: { fraction: number }) {
  const left = clamp01(fraction)
  const calm = usePrefersReducedMotion()
  const [snow] = useState<Snow>(() => createSnow(FLAKE_COUNT))
  const flakeRefs = useRef<(HTMLDivElement | null)[]>([])
  const domeRef = useRef<HTMLDivElement>(null)
  // The dome's size in pixels, so flake positions can be written as transforms
  // rather than as `left`/`top` — 34 elements laying out every frame is a cost
  // this shape does not need to pay.
  const sizeRef = useRef({ w: 0, h: 0 })
  // The drift's surface is where the flakes land, and it moves over the rest; the
  // loop reads it — and the countdown with it — through refs rather than
  // restarting four times a second.
  const driftRef = useRef(0)
  driftRef.current = 1 - (1 - left) * DRIFT_MAX
  const leftRef = useRef(left)
  leftRef.current = left
  // Whether the last flake has finished landing. Not the same moment as the clock
  // reaching zero — the flake called down at the end is still falling for a beat
  // after it — and the globe's own payoff belongs to the landing, not the tick.
  const [atRest, setAtRest] = useState(false)
  const atRestRef = useRef(false)
  // Nothing is simulated under reduced motion, so there is no last landing to wait
  // for; the drift arriving at full height is the whole of the reading there.
  const settled = calm ? left <= 0 : atRest

  useEffect(() => {
    const dome = domeRef.current
    if (!dome) return
    const measure = () => {
      sizeRef.current = { w: dome.clientWidth, h: dome.clientHeight }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(dome)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const paint = () => {
      const { w, h } = sizeRef.current
      snow.flakes.forEach((flake, i) => {
        const el = flakeRefs.current[i]
        if (!el) return
        const { x, y, alpha, scale } = flakeLook(flake, snow.t)
        // The -50% centres the flake on its position; a percentage inside a
        // translate resolves against the element's own size, which is what makes
        // this work for flakes of different sizes without measuring any of them.
        el.style.transform = `translate3d(calc(${x * w}px - 50%), calc(${y * h}px - 50%), 0) scale(${scale})`
        // Painted here rather than left to a CSS transition, so the fade is tied to
        // the flake touching the drift instead of to the countdown's ticks.
        el.style.opacity = `${alpha}`
      })
    }
    // Under reduced motion there are no flakes to paint — see the render below.
    if (calm) return
    let raf = 0
    let last = performance.now()
    // Once before the first frame: without it the flakes render for a beat at the
    // corner they were laid out in, before any transform has been written.
    paint()
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      stepSnow(snow, dt, driftRef.current, leftRef.current)
      paint()
      if (!atRestRef.current && snow.flakes.every((flake) => isSettled(flake, snow.t))) {
        atRestRef.current = true
        setAtRest(true)
        // Nothing in the glass will move again — the drift is at its full height and
        // every flake has melted into it — and a rest can be left overrunning for
        // minutes. So the loop ends here rather than repainting a still globe.
        return
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [calm, snow])

  return (
    <div className="absolute inset-0" aria-hidden>
      {/* The plinth the globe stands on. */}
      <div
        className="absolute bottom-[4%] left-1/2 h-[13%] w-[46%] -translate-x-1/2 bg-accent-bright/40"
        style={{ clipPath: 'polygon(14% 0, 86% 0, 100% 100%, 0 100%)' }}
      />
      <div className="absolute bottom-[16%] left-1/2 h-[2.5%] w-[52%] -translate-x-1/2 rounded-full bg-accent-bright/55" />

      <div
        ref={domeRef}
        className={`absolute bottom-[18%] left-1/2 aspect-square w-[76%] -translate-x-1/2 overflow-hidden rounded-full ring-2 transition-shadow duration-500 ${
          // The glass firms up once the snow is down: a ring is a box-shadow, so the
          // change carries on `transition-shadow` rather than on `transition-colors`.
          settled ? 'ring-accent-bright/85' : 'ring-accent-bright/40'
        }`}
      >
        <div className="absolute inset-0 bg-accent-bright/8" />
        {/* The drift: a bank with a crowned top, rising out of the floor. */}
        <svg
          className="absolute inset-0 h-full w-full text-accent-bright"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Drawn once with its edges at `100 - DRIFT_CROWN` and slid up into
              place, rather than redrawn each tick: the crown then keeps its shape
              at every height, and the motion stays on `transform` so the
              countdown's steps smooth into one continuous rise. A quadratic only
              reaches halfway to its control point, hence the doubled crown there.
              `DRIFT_MEAN` is what puts the bank's average surface — the line the
              flakes land on — at the height the countdown asked for. */}
          <g
            style={{
              // px in an SVG transform is user units, so this is viewBox-relative.
              transform: `translateY(${driftRef.current * 100 - 100 + DRIFT_MEAN}px)`,
              ...drainOf('transform'),
            }}
          >
            <path
              d={`M 0 ${100 - DRIFT_CROWN} Q 50 ${100 - 3 * DRIFT_CROWN} 100 ${100 - DRIFT_CROWN} L 100 ${DRIFT_FOOT} L 0 ${DRIFT_FOOT} Z`}
              fill="currentColor"
              fillOpacity={settled ? 0.9 : 0.75}
              style={drainOf('fill-opacity')}
            />
            {/* The surface itself, drawn bright: the bank's top edge is the reading,
                and a solid line carries it across the glass from further away than
                the difference between two fills does. */}
            <path
              d={`M 0 ${100 - DRIFT_CROWN} Q 50 ${100 - 3 * DRIFT_CROWN} 100 ${100 - DRIFT_CROWN}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
          </g>
        </svg>
        {/* The snow. Every flake stays mounted for the whole rest — its ref is its
            place in the simulation, and no flake is ever added or removed — and
            both its position and how solid it is are written by the loop, since the
            melt into the drift begins when the flake touches it and not when the
            countdown says so. Starts invisible: the first paint is what gives it a
            place to be.
            Dropped entirely under reduced motion, the way the candle's embers and
            the tide's bubbles are: floating *is* the snow, and a globe full of dots
            hanging motionless says less than the drift alone does. The drift is
            still the whole reading, so no time is lost with them. */}
        {!calm &&
          snow.flakes.map((flake, i) => (
            <div
              key={i}
              ref={(el) => {
                flakeRefs.current[i] = el
              }}
              className="absolute left-0 top-0 rounded-full bg-accent-bright"
              style={{
                width: pct(flake.size * 100),
                aspectRatio: '1',
                opacity: 0,
                willChange: 'transform, opacity',
              }}
            />
          ))}
        {/* A highlight down the glass, so the dome reads as glass and not a hole. */}
        <div className="absolute left-[12%] top-[10%] h-[46%] w-[26%] -rotate-[18deg] rounded-full bg-white/10" />
      </div>

      {/* The payoff, once the last flake is down: one pulse around the glass, and it
          stays lit. The same job the cell's bolt does at full charge — a rest that
          is over should look unlike a rest that is nearly over, and a globe quietly
          running out of moving parts is too easy to miss. Outside the dome, and in
          a wrapper that holds the centring, because the pulse is a `transform`: in
          the dome it would be clipped, and on the dome it would undo its own
          position. */}
      {settled && (
        <div className="pointer-events-none absolute bottom-[18%] left-1/2 aspect-square w-[76%] -translate-x-1/2">
          <div className="rest-globe-settled absolute inset-0 rounded-full ring-2 ring-accent-bright" />
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- icicle */

/** How much of the shape's height the slabs at either end take. */
const SLAB = 4

/**
 * The 'icicle' shape: an icicle reaching down and a stalagmite reaching up, meeting
 * exactly as the rest ends.
 *
 * The reading is the *gap* between them, not either spike's length — which is what
 * makes it different from every falling level in the set, and why it lands: the
 * shape resolves into one column at zero instead of simply running out. Both
 * spikes grow by the same amount, so the gap closes at twice the rate either one
 * moves and is the most visible thing on the screen from a distance.
 */
function IcicleGap({ fraction }: { fraction: number }) {
  const left = clamp01(fraction)
  // The two slabs and the span between them; each spike takes half of what's spent.
  const span = 100 - 2 * SLAB
  const grown = ((1 - left) * span) / 2
  const gap = left * span

  return (
    <div className="absolute inset-y-[7%] left-1/2 w-[52%] -translate-x-1/2" aria-hidden>
      <div className="absolute inset-x-0 top-0 h-[4%] rounded-sm bg-accent-bright/45" />
      <div className="absolute inset-x-0 bottom-0 h-[4%] rounded-sm bg-accent-bright/45" />

      {/* The icicle, hanging. Its taper is in the clip, so growing it is a height
          change and the point stays a point. */}
      <div
        className="absolute left-1/2 w-[24%] -translate-x-1/2 bg-accent-bright/75"
        style={{
          top: pct(SLAB),
          height: pct(grown),
          clipPath: 'polygon(0 0, 100% 0, 74% 44%, 58% 100%, 42% 100%, 26% 44%)',
          ...drainOf('height'),
        }}
      />
      {/* And the stalagmite, broader at the base as one built out of drips is. */}
      <div
        className="absolute left-1/2 w-[34%] -translate-x-1/2 bg-accent-bright/75"
        style={{
          bottom: pct(SLAB),
          height: pct(grown),
          clipPath: 'polygon(0 100%, 100% 100%, 70% 40%, 56% 0, 44% 0, 30% 40%)',
          ...drainOf('height'),
        }}
      />
      {/* A drip crossing what's left of the gap: the column spans it, so
          translating the column its own height carries the drop from the icicle's
          tip exactly onto the stalagmite however far they have grown. */}
      {gap > 8 && grown > 3 && (
        <div
          className="absolute left-1/2 w-[8%] -translate-x-1/2"
          style={{
            top: pct(SLAB + grown),
            height: pct(gap),
            ...drainOf('height'),
          }}
        >
          <div className="rest-icicle-drip absolute inset-0">
            <div className="absolute left-1/2 top-0 aspect-square w-full -translate-x-1/2 rounded-full bg-accent-bright" />
          </div>
        </div>
      )}
      {/* The join, once they touch. */}
      {left <= 0 && (
        <div className="rest-glow absolute left-1/2 top-1/2 h-[6%] w-[36%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-accent-bright/60" />
      )}
    </div>
  )
}

/* --------------------------------------------------------------------- beads */

/**
 * The four glass-bead shapes: drops of liquid lying on a pane of black glass, and what
 * tells the time is *how many bodies* of it there are.
 *
 * A count is the one reading here that needs nothing measured against anything. A level
 * has to be judged against the vessel around it, where four bodies is four bodies — and
 * every step of a count lands as an event you can watch happen rather than as a line
 * creeping past a mark, which is what makes zero legible: whatever the shape has been
 * doing all rest, it does it for the last time exactly on the tick.
 *
 * `beads` and `shed` run one way, `split` and `gather` are those two run backwards
 * (see lib/beads, which owns the runs), so each of the four ends on a pane that looks
 * like no other moment of any of them: one body dead centre, seven spread across the
 * glass, nothing at all, or one body holding all seven.
 *
 * Drawn as liquid rather than as glass, through the same goo filter a lava lamp is
 * made of (blur the field, then crush the alpha back to an edge — see
 * {@link BeadPane}). Every drop is one opaque body lit from its upper left, always the
 * same size, and what the filter does is make one surface out of any two that have come
 * near enough. So a body of liquid here is however many drops are travelling together
 * (see lib/beads), and a join is the pair carrying on into each other until the two of
 * them read as one: nothing pops in, nothing swells, nothing is swapped for anything.
 * The pane holds seven drops from the first frame to the last, and the only thing that
 * changes at a join is which of them belong to the same body.
 *
 * Nothing changes pace in a step either. Every drop carries the momentum it had into
 * whatever happens to it — a pair keeps closing after it touches, and pours; a drop
 * torn off the mass leaves with what the mass gave it and the mass rocks back the other
 * way — which is the whole of why the four of them read as liquid rather than as an
 * arrangement being stepped through. The stir each drop does on top of its schedule
 * belongs to lib/beads too, so it can be answered for there.
 *
 * The one motion that lives up here is a turn of the whole field about the middle of the
 * pane, in the two shapes that can afford it (see {@link BeadPane}'s `swirl`). It can
 * reach nothing: a turn about a point changes no gap between two drops and no drop's
 * distance from that point.
 */

/**
 * A run, worked out once when the rest starts, and read at whatever fraction the
 * countdown is at rather than stepped along — so a rest resumed after a reload picks the
 * pane up exactly where it left it.
 */
function useBeadField(make: () => BeadPlan, fraction: number): BeadField {
  const [plan] = useState(make)
  return fieldAt(plan, fraction)
}

/**
 * How far the goo filter spreads a drop before it is crushed back, in CSS pixels.
 * This alone sets how close two drops have to get before they reach for each other:
 * about twice this much glass between their surfaces. Sized against the drop itself
 * (a fifth of the pane, so ~60px on a phone) so a merge is a quick pour and not a
 * long rubbery stretch — and comfortably under the glass lib/beads keeps between two
 * bodies that are not each other's business, which is what stops seven drops sitting
 * still from fusing into a doughnut.
 */
const GOO_BLUR = 8

/**
 * The alpha crush that turns the blur back into a liquid: `alpha * SLOPE - FLOOR`,
 * clamped. Everything under about 0.41 opacity goes to nothing and everything over
 * 0.46 goes to solid, so a blob keeps its own size and only the narrow band where
 * two hazes have added together becomes the neck between them.
 */
const GOO_SLOPE = 22
const GOO_FLOOR = -9

/** The blob's own lighting: pale at the upper left, bright through it, deep at the rim. */
const BLOB_FILL =
  'radial-gradient(circle at 34% 28%, #bbf7d0 0%, var(--color-accent-bright) 46%, #15803d 100%)'

/**
 * The pane the four of them share, and the liquid lying on it.
 *
 * Every drop sits in one filtered layer so any two of them can make one surface:
 * {@link GOO_BLUR} spreads each into a haze, and the alpha crush that follows throws away
 * everything below half-opaque and takes the rest to solid. A drop on its own comes back
 * exactly the size it started, because the middle of it never left full opacity; two
 * whose hazes overlap come back as one body with a neck between them, because the glass
 * between them crossed the threshold together. Only the drops go through it — the pane,
 * its sheen and the glow all sit outside, where a crushed alpha would flatten them.
 *
 * Nothing here is drawn per body: the drops are drawn, and the bodies are what the filter
 * makes of them. That is why a join needs no animation and gets none.
 *
 * `settled` is the shape's payoff — the pane holding the one arrangement it holds at no
 * other point in the rest — and everything it changes is a light coming up: the pane's
 * edge firms and the liquid's glow widens.
 */
function BeadPane({
  field,
  settled,
  swirl,
}: {
  field: BeadField
  settled: boolean
  /**
   * Whether the whole field may turn slowly about the middle of the pane, a few degrees
   * either way (see `rest-bead-swirl`).
   *
   * Safe wherever it is used because it is rigid: a turn about a point changes no gap
   * between any two drops and no drop's distance from the middle either, so it can neither
   * grow a neck nor carry anything into the rim, and it leaves the body a coalescence ends
   * on exactly centred — a turn about a point being the one motion that lets whatever sits
   * on that point alone.
   *
   * Which is also the whole of why `shed` and `gather` go without it. Their reading is a
   * drop crossing the rim on its tick, and a turn that can't take a drop any *nearer* the
   * rim does still slide it along one — moving the one moment those two shapes are built
   * to land.
   */
  swirl?: boolean
}) {
  const calm = usePrefersReducedMotion()
  const goo = useId().replace(/\W/g, '')
  return (
    <div className="absolute inset-0" aria-hidden>
      <div
        className={`absolute inset-[5%] overflow-hidden rounded-[11%] ring-1 transition-shadow duration-500 ${
          // A ring is a box-shadow, so this carries on `transition-shadow`.
          settled ? 'ring-accent-bright/60' : 'ring-accent-bright/20'
        }`}
      >
        {/* The pane: barely lit, and a shade brighter at the top, so it reads as a
            surface the liquid is lying on rather than a hole cut in the screen. It
            also cuts off everything crossing it, which is how a blob leaves. */}
        <div className="absolute inset-0 bg-gradient-to-b from-accent-bright/7 to-accent-bright/2" />
        {/* One band of light crossing it, slowly. Texture, like the drops' own stir: it
            passes behind them and touches nothing that tells the time. Dropped under
            reduced motion, where the schedule is all that is left moving. */}
        {!calm && (
          <div
            className="rest-bead-sheen absolute -inset-y-1/3 -left-1/3 w-1/3"
            style={{
              backgroundImage:
                'linear-gradient(to right, transparent, var(--color-accent-bright), transparent)',
            }}
          />
        )}
        <svg className="absolute h-0 w-0" aria-hidden>
          <defs>
            <filter id={goo} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation={GOO_BLUR} result="haze" />
              <feColorMatrix
                in="haze"
                mode="matrix"
                values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${GOO_SLOPE} ${GOO_FLOOR}`}
              />
            </filter>
          </defs>
        </svg>
        {/* Every drop in one filtered layer, so any pair of them can make one surface. The
            glow rides on the end of the same filter chain, which puts it around the body
            they came to be rather than around each drop that went into it. */}
        <div
          className={`absolute inset-0 ${swirl && !calm ? 'rest-bead-swirl' : ''}`}
          style={{
            filter: `url(#${goo}) drop-shadow(0 0 ${settled ? 16 : 8}px rgba(74, 222, 128, ${
              settled ? 0.5 : 0.3
            }))`,
            transition: 'filter 500ms linear',
          }}
        >
          {field.beads.map((bead) => (
            <div
              key={bead.id}
              // Positioned by translating a pane-sized box, so a percentage here is a
              // share of the pane and no element has to be measured. A drop's size never
              // changes, so this transform is the only thing the countdown moves — one
              // property, one element, and the whole journey rides on it.
              className="absolute inset-0"
              style={{
                transform: `translate(${(bead.x - 0.5) * 100}%, ${(bead.y - 0.5) * 100}%)`,
                ...drainOf('transform'),
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: pct(BEAD_R * 200),
                  aspectRatio: '1',
                  backgroundImage: BLOB_FILL,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The 'beads' shape: seven drops of liquid finding each other as the rest runs down, until
 * one body of them is left as it ends.
 *
 * Two more readings ride along with the count and agree with it: the biggest body only ever
 * grows, and the gaps are closing on every side at once. What makes zero legible is that
 * the last two bodies *touch* on the tick — every join lands as an event rather than a
 * fade, the pair meeting and pouring into itself, so the final one reads as the same thing
 * happening for the last time.
 */
function GlassBeads({ fraction }: { fraction: number }) {
  const field = useBeadField(createCoalescence, fraction)
  // One body on the pane happens at exactly one moment, the last join, and that lands
  // on zero: this is the shape's payoff, not a state it passes through.
  return <BeadPane field={field} settled={field.bodies.length === 1} swirl />
}

/**
 * The 'split' shape: one body of liquid coming apart into seven, which is 'beads' run
 * backwards.
 *
 * The count is the reading the other way up — one at the start, seven when the rest is up,
 * one more at every sixth of the way through — and the body in the middle reads narrower
 * every time it lets one go, so a glance at nothing but its width says roughly as much as
 * counting does.
 *
 * Where a join lands on the tick as two bodies touching, a break lands as two that have
 * only just stopped touching: the seventh comes away exactly at zero, still against what it
 * came off, and the pane is left with a full spread of seven where every other moment of
 * the rest had fewer. It opens on the payoff of a coalescence — one body, dead centre,
 * perfectly still — because that is precisely what running that one backwards begins with.
 */
function GlassSplit({ fraction }: { fraction: number }) {
  const field = useBeadField(createFission, fraction)
  return <BeadPane field={field} settled={field.bodies.length === BEAD_COUNT} swirl />
}

/**
 * The 'shed' shape: a mass of liquid in the middle of the pane emptying itself, one drop at
 * a time, out through the rim.
 *
 * The mass is the reading and it only ever shrinks, by a seventh of the liquid on the pane
 * at every seventh of the rest. Each drop tears out of it, crosses to the edge and is cut
 * off by it — the pane keeps nothing it lets go of — and because a drop is wholly gone on
 * the tick rather than fading out near it, the leaving is the beat.
 *
 * The mass rocks back as each one goes, harder the emptier it gets, and is dead centre
 * again by the time the next one comes away (see lib/beads): a mass throwing off a seventh
 * of itself has to answer for the momentum somewhere.
 *
 * What zero looks like here is the one thing none of the other three ever shows: clear
 * glass, with the rim lit and nothing standing on it.
 */
function GlassShed({ fraction }: { fraction: number }) {
  const field = useBeadField(createShedding, fraction)
  return <BeadPane field={field} settled={field.beads.length === 0} />
}

/**
 * The 'gather' shape: drops arriving out of the dark beyond the pane, one every seventh of
 * the rest, into a mass in the middle that ends up holding all seven — which is 'shed' run
 * backwards.
 *
 * The reading is what the middle has gathered, and it only ever grows. Alone among the
 * shapes on the rest screen it opens on an empty vessel: nothing on the glass at all, and
 * the first drop already on its way in. Each one dives into the mass and is taken into it,
 * nudging it as it goes, and the last of them lands exactly at zero.
 */
function GlassGather({ fraction }: { fraction: number }) {
  const field = useBeadField(createGathering, fraction)
  const whole = field.bodies.length === 1 && field.bodies[0].mass === BEAD_COUNT
  return <BeadPane field={field} settled={whole} />
}

/* ---------------------------------------------------------------------- fuse */

/** Sparks thrown off a burning head: where each one flies, in multiples of its own size. */
const FUSE_SPARKS = [
  { dx: '-360%', dy: '-260%', delay: 0 },
  { dx: '-180%', dy: '220%', delay: 0.35 },
  { dx: '-420%', dy: '60%', delay: 0.7 },
] as const

/** Ash left on the burnt cord, as percentages across the screen. */
const ASH = [4, 11, 19, 27, 35, 65, 73, 81, 89, 96] as const

/**
 * The 'fuse' shape: a cord burning in from both ends, the two heads meeting in the
 * middle as the rest ends.
 *
 * Full-bleed and horizontal, running off both edges of the screen — so it is the
 * one shape you can read without looking anywhere near the middle of the display.
 * The reading is the unburnt cord between the heads, which closes at twice the
 * rate either head travels.
 *
 * The heads carry sparks, and the burnt cord behind them keeps its ash: without
 * that the shape is a bar that shrinks, and half of what makes a fuse legible is
 * the evidence of where it has been.
 */
function FuseLine({ fraction }: { fraction: number }) {
  const left = clamp01(fraction)
  return (
    // Pulled out past the rest screen's own padding: a fuse that stops short of
    // the edges reads as a bar, and running off the screen is the point of it.
    <div className="pointer-events-none absolute inset-y-0 -left-6 -right-6 overflow-hidden" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
        {/* The burnt cord, and what it left behind. */}
        <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-full bg-accent-bright/12" />
        {ASH.map((x) => (
          <div
            key={x}
            className="absolute top-1/2 h-[3px] w-[3px] -translate-y-1/2 rounded-full bg-accent-bright/25"
            style={{ left: pct(x) }}
          />
        ))}
        {/* What's left to burn. */}
        <div
          className="relative left-1/2 h-[7px] -translate-x-1/2 rounded-full bg-accent-bright"
          style={{ width: pct(left * 100), ...drainOf('width') }}
        >
          {left > 0 &&
            ([-1, 1] as const).map((side) => (
              <div
                key={side}
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2"
                style={{ left: side < 0 ? '0%' : '100%' }}
              >
                <div className="rest-fuse-head absolute inset-0 rounded-full bg-accent-bright" />
                {FUSE_SPARKS.map((spark) => (
                  <div
                    key={spark.dx}
                    className="rest-fuse-spark absolute left-1/2 top-1/2 h-[3px] w-[3px] rounded-full bg-accent-bright"
                    style={
                      {
                        // Sparks fly the way the head is travelling: outward from
                        // the middle, which is backward along the cord it came from.
                        '--dx': side < 0 ? spark.dx : `calc(${spark.dx} * -1)`,
                        '--dy': spark.dy,
                        animationDelay: `${spark.delay}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ rotation */

/**
 * Any of the shapes in this file, by name. Keeps RestTimer's own switch to the
 * shapes it holds — see the comments on each component above for what the shape is
 * and which dimension carries the countdown.
 */
export function ExtraRestShape({
  variant,
  fraction,
}: {
  variant: ExtraVariant
  fraction: number
}) {
  switch (variant) {
    // Fills rather than drains: a cell charging, full exactly as rest ends.
    case 'recharge':
      return <RechargeCell fraction={fraction} />
    // A tap dripping into a glass — the tide, run the other way.
    case 'tap':
      return <DrippingTap fraction={fraction} />
    // A bar loading a plate at a time, ready when the rest is up.
    case 'plates':
      return <LoadingBar fraction={fraction} />
    // A balance tipping over: the beam's angle and both pans say the same thing.
    case 'scale':
      return <BalanceScale fraction={fraction} />
    // A moon waning from full to new; the lit width is the time left.
    case 'moon':
      return <WaningMoon fraction={fraction} />
    // A coil paying out, its outer radius shrinking at a steady rate.
    case 'spiral':
      return <UnspoolingSpiral fraction={fraction} />
    // Ice melting: the cube shrinks while the puddle spreads outward.
    case 'ice':
      return <MeltingIce fraction={fraction} />
    // A snow globe: the drift rises as the snow in the air thins out.
    case 'globe':
      return <SnowGlobe fraction={fraction} />
    // An icicle and a stalagmite closing on each other, meeting at zero.
    case 'icicle':
      return <IcicleGap fraction={fraction} />
    // Beads of black glass joining one pair at a time, down to a single bead.
    case 'beads':
      return <GlassBeads fraction={fraction} />
    // The same pane run backwards: one bead of glass coming apart into seven.
    case 'split':
      return <GlassSplit fraction={fraction} />
    // A mass in the middle dropping a bead at a time, each one out through the rim.
    case 'shed':
      return <GlassShed fraction={fraction} />
    // And that backwards: beads arriving out of the dark into a mass that takes them.
    case 'gather':
      return <GlassGather fraction={fraction} />
    // A cord burning in from both edges of the screen.
    case 'fuse':
    default:
      return <FuseLine fraction={fraction} />
  }
}
