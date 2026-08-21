import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { type ExtraVariant } from '../lib/restShapes'
import { createSnow, flakeLook, isAirborne, stepSnow, type Snow } from '../lib/snow'
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

/** How much of the globe's height a full drift takes. */
const DRIFT_MAX = 0.6

/** How high the drift's middle stands over its edges, in the drift SVG's units. */
const DRIFT_CROWN = 9

/**
 * The 'globe' shape: a snow globe, its drift rising as the rest runs down and the
 * snow still in the air thinning out with it.
 *
 * Two readings that agree — see lib/snow, which owns both: the drift's height is
 * the rest already spent, and the number of flakes still falling is the rest still
 * to come. The falling itself is texture, and it is simulated rather than
 * keyframed for the same reason the candle's flame is: a loop of snow is a loop,
 * and the eye finds it inside a couple of seconds.
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
  // The drift is where the flakes land, and it moves over the rest; the loop reads
  // it through a ref rather than restarting four times a second.
  const driftRef = useRef(0)
  driftRef.current = 1 - (1 - left) * DRIFT_MAX

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
        const { x, y } = flakeLook(flake, snow.t)
        // The -50% centres the flake on its position; a percentage inside a
        // translate resolves against the element's own size, which is what makes
        // this work for flakes of different sizes without measuring any of them.
        el.style.transform = `translate3d(calc(${x * w}px - 50%), calc(${y * h}px - 50%), 0)`
      })
    }
    // Under reduced motion there are no flakes to paint — see the render below.
    if (calm) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      stepSnow(snow, dt, driftRef.current)
      paint()
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
        className="absolute bottom-[18%] left-1/2 aspect-square w-[76%] -translate-x-1/2 overflow-hidden rounded-full ring-2 ring-accent-bright/40"
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
              reaches halfway to its control point, hence the doubled crown there. */}
          <path
            d={`M 0 ${100 - DRIFT_CROWN} Q 50 ${100 - 3 * DRIFT_CROWN} 100 ${100 - DRIFT_CROWN} L 100 100 L 0 100 Z`}
            fill="currentColor"
            fillOpacity={0.75}
            style={{
              // px in an SVG transform is user units, so this is viewBox-relative.
              transform: `translateY(${driftRef.current * 100 - 100 + DRIFT_CROWN}px)`,
              ...drainOf('transform'),
            }}
          />
        </svg>
        {/* The snow. Every flake stays mounted for the whole rest — its ref is its
            place in the simulation — and fades out when its turn to settle comes.
            Dropped entirely under reduced motion, the way the candle's embers and
            the tide's bubbles are: falling *is* the snow, and a globe full of dots
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
                opacity: isAirborne(flake, left) ? 0.85 : 0,
                transition: 'opacity 500ms linear',
                willChange: 'transform',
              }}
            />
          ))}
        {/* A highlight down the glass, so the dome reads as glass and not a hole. */}
        <div className="absolute left-[12%] top-[10%] h-[46%] w-[26%] -rotate-[18deg] rounded-full bg-white/10" />
      </div>
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
    // A cord burning in from both edges of the screen.
    case 'fuse':
    default:
      return <FuseLine fraction={fraction} />
  }
}
