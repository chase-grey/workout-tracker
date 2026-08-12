import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { KebabMenu, type MenuItem } from './KebabMenu'
import { SessionProgress } from './SessionProgress'
import { createFlame, flameLook, stepFlame } from '../lib/flame'
import { createWave, impulseWave, splashStrength, stepWave, waveSurfacePath } from '../lib/tide'

// Time-telling shapes made for rest: each one encodes the remaining fraction
// directly in its dominant dimension — a sand level, a liquid line, a candle's
// height, a stack of lit segments — so a glance reads how much rest is left.
// Any looping motion (rising bubbles, a flickering flame) is texture only and
// never drives that level, so the time reading stays honest.
//
// Boxed shapes live in a square in the middle of the screen. Full-bleed ones use
// the entire viewport instead, sitting behind the readout — a rest you can read
// from across the gym without looking at the numbers.
const BOX_VARIANTS = ['sandglass', 'tide', 'candle', 'pips'] as const
// 'perimeter' frames the screen edge; the other two fill it, so they sit below the
// up-next block rather than behind it.
const FILL_VARIANTS = ['curtain', 'hourglass'] as const
const FULL_VARIANTS = ['perimeter', ...FILL_VARIANTS] as const
const VARIANTS = [...BOX_VARIANTS, ...FULL_VARIANTS] as const
type Variant = (typeof VARIANTS)[number]
type FullVariant = (typeof FULL_VARIANTS)[number]
type FillVariant = (typeof FILL_VARIANTS)[number]

function isFullBleed(v: Variant): v is FullVariant {
  return (FULL_VARIANTS as readonly string[]).includes(v)
}

function isFill(v: Variant): v is FillVariant {
  return (FILL_VARIANTS as readonly string[]).includes(v)
}

/**
 * How long after mounting the rest screen ignores a tap-to-dismiss.
 *
 * Finishing a set fires on pointerup, and the browser follows that with a
 * synthesized mouse `click` at the same coordinates. By then this overlay is
 * mounted underneath the finger, so that stray click hit-tests onto it and
 * dismissed the rest before it was ever seen. Long enough to swallow the
 * compatibility click, short enough that a deliberate tap still works.
 */
const GHOST_CLICK_GRACE_MS = 400

// Remembered across mounts (each rest remounts the timer) so we never show the
// same shape twice in a row — rest reliably rotates through the whole set.
let lastVariant: Variant | null = null
function pickVariant(): Variant {
  const pool = VARIANTS.filter((v) => v !== lastVariant)
  lastVariant = pool[Math.floor(Math.random() * pool.length)]
  return lastVariant
}

/**
 * The rest animation itself. `fraction` is how much rest is still left (1 at the
 * start, 0 when it's up); every shape maps it straight onto its level so the
 * shape *is* the timer.
 *
 * Bright green throughout — the resting animation is meant to call attention, so
 * it reads as vividly green rather than a faint wash. Dark green (accent) stays
 * reserved for the numeric timer and bar UI.
 */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * How the perimeter path splits its time budget across the three edges it
 * crosses on each side of the screen: out along the top to the corner, down the
 * full side, then in along the bottom to the centre. Fixed weights rather than
 * measured pixel lengths — the drain still finishes exactly at zero, and this
 * needs no knowledge of the viewport's aspect ratio.
 */
const PERIMETER_WEIGHTS = { top: 0.25, side: 0.5, bottom: 0.25 } as const

/**
 * Radius of the perimeter path's bottom corners, in CSS pixels — sized to the
 * phone's own screen curvature so the sand reads as tracing the edge of the
 * display rather than a rectangle drawn just inside it. The top corners stay
 * square: they sit up under the status bar where the curve isn't read anyway.
 */
const SCREEN_CORNER_RADIUS = 44

/** Half the perimeter stroke, so the 6px band sits fully on screen. */
const PERIMETER_INSET = 3

/**
 * The perimeter shape: sand starts along the top edge of the screen, runs down
 * both sides and settles along the bottom. The bright arc is the rest still to
 * come and always touches the top; the dim track behind it is sand already
 * fallen.
 *
 * Drawn as two mirrored SVG paths rather than eight divs so the bottom corners
 * can actually curve. Each half runs from the top centre out to its corner, down
 * the side, around the bottom curve and back in to the bottom centre; the fixed
 * time weights above are converted into a distance along that real geometry, so
 * the drain still spends a quarter of the rest on the top edge and half of it on
 * the sides no matter how tall the viewport is.
 */
function PerimeterFrame({ fraction }: { fraction: number }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { w, h } = size
  const inset = PERIMETER_INSET
  // Never let the curve eat more than the path has room for (a short/narrow
  // viewport would otherwise produce an arc that overshoots the centre line).
  const r = Math.max(0, Math.min(SCREEN_CORNER_RADIUS, w / 2 - inset, h - inset * 2))

  const weights = PERIMETER_WEIGHTS
  const topFill = clamp01(fraction / weights.top)
  const sideFill = clamp01((fraction - weights.top) / weights.side)
  const bottomFill = clamp01((fraction - weights.top - weights.side) / weights.bottom)

  // Pixel length of each leg one half-path crosses, used only to turn the time
  // weights into a fraction of the path's total length.
  const lTop = Math.max(0, w / 2 - inset)
  const lSide = Math.max(0, h - inset * 2 - r)
  const lBottom = (Math.PI * r) / 2 + Math.max(0, w / 2 - inset - r)
  const lTotal = lTop + lSide + lBottom
  const drawn =
    lTotal > 0 ? (lTop * topFill + lSide * sideFill + lBottom * bottomFill) / lTotal : 0

  // `dir` mirrors the path: 1 sweeps down the right edge, -1 down the left.
  const halfPath = (dir: 1 | -1) => {
    const x = (fromCentre: number) => w / 2 + dir * fromCentre
    const edge = w / 2 - inset
    return [
      `M ${x(0)} ${inset}`,
      `L ${x(edge)} ${inset}`,
      `L ${x(edge)} ${h - inset - r}`,
      `A ${r} ${r} 0 0 ${dir === 1 ? 1 : 0} ${x(edge - r)} ${h - inset}`,
      `L ${x(0)} ${h - inset}`,
    ].join(' ')
  }

  return (
    <div className="pointer-events-none absolute inset-0 text-accent-bright" aria-hidden>
      <svg className="absolute inset-0" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {([1, -1] as const).map((dir) => (
          <g key={dir} fill="none" stroke="currentColor" strokeWidth={6}>
            {/* The full loop, dim: the path the sand travels. */}
            <path d={halfPath(dir)} strokeOpacity={0.12} />
            {/* pathLength normalises the dash to 0–1, so `drawn` is used directly
                and the two halves stay in step despite different pixel lengths. */}
            <path
              d={halfPath(dir)}
              pathLength={1}
              strokeDasharray={`${drawn} 1`}
              style={{ transition: 'stroke-dasharray 260ms linear' }}
            />
          </g>
        ))}
      </svg>
      {/* Grains running along whichever edge the sand is currently crossing. */}
      {fraction > 0 && fraction < 1 && (
        <div
          className="rest-perimeter-glow absolute inset-0"
          style={{ borderBottomLeftRadius: r, borderBottomRightRadius: r }}
        />
      )}
    </div>
  )
}

/**
 * The 'hourglass' shape's geometry, in its own SVG user units — a 100 × 164 box,
 * so every number here is also a percentage of the glass.
 *
 * The sand is two fixed shapes that *slide* rather than two shapes redrawn on
 * every tick: the upper charge is a block with a crater scooped out of its top
 * edge that sinks down the funnel, the pile is a block with a mound on top that
 * rises out of the floor, and each bulb clips whatever leaves it. Both surfaces
 * keep their own shape at every level that way, and the motion stays on
 * `transform`, so the countdown's 250ms steps smooth into one continuous fall the
 * way the other shapes' `height` transitions do.
 */
const GLASS = {
  width: 100,
  height: 164,
  /** Inside face of the upper bulb's ceiling and of the lower bulb's floor. */
  ceiling: 9,
  floor: 155,
  /** The waist: sand leaves the upper bulb here and lands in the lower one. */
  neckTop: 79,
  neckBottom: 85,
  /** Half-width of the throat between them. */
  neckHalf: 3.5,
  /** How far the glass sits inside the frame's posts. */
  wall: 13,
} as const

/**
 * Top of the upper sand in a glass that hasn't started draining — a touch above
 * the ceiling, so a full glass reads as packed rather than settled a hair short.
 */
const UPPER_SAND_TOP = GLASS.ceiling - 2

/** How deep the crater in the draining sand's surface runs at its centre. */
const CRATER = 7

/**
 * How high the pile's peak stands over its own skirt. Sand piles at roughly 34°
 * from horizontal, which across the width of this glass is about this much.
 */
const MOUND = 18

/** How far the sand travels: the full height of either bulb. */
const SAND_FALL = GLASS.floor - GLASS.neckBottom
const SAND_DRAIN = GLASS.neckTop - UPPER_SAND_TOP

/**
 * A body of sand with a shaped top: a flat edge at `y` bulging `depth` at its
 * centre — positive digs a bowl, negative heaps a mound — filled down to `bottom`
 * and run wider than the glass so a clipped edge never shows. The control point
 * is twice that depth, since a quadratic only reaches halfway toward it.
 */
function sandBody(y: number, depth: number, bottom: number): string {
  const right = GLASS.width + 12
  return [
    `M -12 ${y}`,
    `Q ${GLASS.width / 2} ${y + 2 * depth} ${right} ${y}`,
    `L ${right} ${bottom}`,
    `L -12 ${bottom}`,
    'Z',
  ].join(' ')
}

/** The charge still to fall, at rest in a full glass. */
const UPPER_SAND_PATH = sandBody(UPPER_SAND_TOP, CRATER, GLASS.neckBottom)

/**
 * The pile, parked with its peak exactly on the floor and its skirt below it: an
 * empty lower bulb shows nothing at all, and the first grains raise a small cone
 * rather than popping a whole mound into being.
 */
const LOWER_SAND_PATH = sandBody(GLASS.floor + MOUND, -MOUND, GLASS.floor + MOUND + SAND_FALL)

/** How far down a bulb's wall runs straight before it starts leaning in. */
const SHOULDER = 44
/** Where that lean tightens into the funnel feeding the throat. */
const THROAT = { x: 62, y: 58 } as const
/** The lower bulb is the upper one turned over about the waist. */
const flipY = (y: number) => GLASS.floor - (y - GLASS.ceiling)
const NECK_L = GLASS.width / 2 - GLASS.neckHalf
const NECK_R = GLASS.width / 2 + GLASS.neckHalf
const GLASS_L = GLASS.wall
const GLASS_R = GLASS.width - GLASS.wall

/**
 * The bulbs: each wall drops straight from its plate, takes a shoulder, then
 * sweeps into the throat. That line is what reads as an hourglass — two triangles
 * meeting at a point read as a diagram of one.
 */
const TOP_BULB_PATH = [
  `M ${GLASS_L} ${GLASS.ceiling}`,
  `L ${GLASS_R} ${GLASS.ceiling}`,
  `C ${GLASS_R} ${SHOULDER} ${THROAT.x} ${THROAT.y} ${NECK_R} ${GLASS.neckTop}`,
  `L ${NECK_L} ${GLASS.neckTop}`,
  `C ${GLASS.width - THROAT.x} ${THROAT.y} ${GLASS_L} ${SHOULDER} ${GLASS_L} ${GLASS.ceiling}`,
  'Z',
].join(' ')

const BOTTOM_BULB_PATH = [
  `M ${NECK_L} ${GLASS.neckBottom}`,
  `L ${NECK_R} ${GLASS.neckBottom}`,
  `C ${THROAT.x} ${flipY(THROAT.y)} ${GLASS_R} ${flipY(SHOULDER)} ${GLASS_R} ${GLASS.floor}`,
  `L ${GLASS_L} ${GLASS.floor}`,
  `C ${GLASS_L} ${flipY(SHOULDER)} ${GLASS.width - THROAT.x} ${flipY(THROAT.y)} ${NECK_L} ${GLASS.neckBottom}`,
  'Z',
].join(' ')

/**
 * Where the sand sits with `fraction` of the rest left (1 at the start, 0 when
 * it's up): how far the upper charge has sunk, and how far the pile has risen.
 */
function hourglassLevels(fraction: number) {
  const spent = 1 - clamp01(fraction)
  return { drop: SAND_DRAIN * spent, rise: SAND_FALL * spent }
}

/**
 * The 'hourglass' shape: a whole hourglass — frame, glass and all — standing the
 * full height of the rest screen. The upper bulb's sand sinks down its funnel as
 * the rest runs out and the pile in the lower bulb rises by exactly as much, so
 * either half alone says how much rest is left.
 *
 * No stream through the throat: watching grains fall pulled the eye to the neck,
 * which is the one part of the glass that says nothing about the time. Both
 * levels move continuously on their own, so the sand still reads as flowing
 * without anything crossing the gap.
 *
 * One SVG, letterboxed into whatever space the rest screen has: the glass keeps
 * its proportions on any display instead of being stretched to the viewport, and
 * sand and frame live in the one coordinate system.
 */
function Hourglass({ fraction }: { fraction: number }) {
  // The bulbs clip their sand, and a clip path is referenced by id. Stripped to
  // word characters: useId's own punctuation has no business inside a url(#…).
  const id = useId().replace(/\W/g, '')
  const { drop, rise } = hourglassLevels(fraction)
  const slide = (dy: number): CSSProperties => ({
    transform: `translateY(${dy}px)`,
    transition: 'transform 260ms linear',
  })

  return (
    <div className="pointer-events-none absolute inset-0 text-accent-bright" aria-hidden>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`0 0 ${GLASS.width} ${GLASS.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={`${id}-upper`}>
            <path d={TOP_BULB_PATH} />
          </clipPath>
          <clipPath id={`${id}-lower`}>
            <path d={BOTTOM_BULB_PATH} />
          </clipPath>
        </defs>
        <g fill="currentColor">
          {/* Empty glass, so both bulbs are still there once their sand has gone. */}
          <path d={TOP_BULB_PATH} fillOpacity={0.1} />
          <path d={BOTTOM_BULB_PATH} fillOpacity={0.1} />
          {/* The sand still to fall, and the sand already fallen. */}
          <g clipPath={`url(#${id}-upper)`}>
            <path d={UPPER_SAND_PATH} fillOpacity={0.85} style={slide(drop)} />
          </g>
          <g clipPath={`url(#${id}-lower)`}>
            <path d={LOWER_SAND_PATH} fillOpacity={0.85} style={slide(-rise)} />
          </g>
        </g>
        {/* The glass itself, over the sand so its walls stay crisp, and a highlight
            down each bulb so it reads as glass rather than as an outline. */}
        <g fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke">
          <path d={TOP_BULB_PATH} strokeWidth={3} strokeOpacity={0.5} />
          <path d={BOTTOM_BULB_PATH} strokeWidth={3} strokeOpacity={0.5} />
          <path
            d="M 22 15 C 22 34 33 47 42 58"
            strokeWidth={2}
            strokeOpacity={0.3}
            strokeLinecap="round"
          />
          <path
            d="M 42 106 C 33 117 22 130 22 149"
            strokeWidth={2}
            strokeOpacity={0.3}
            strokeLinecap="round"
          />
        </g>
        {/* The frame: the plates the glass sits between, and the posts joining them. */}
        <g fill="currentColor" fillOpacity={0.6}>
          <rect x={2} y={0} width={GLASS.width - 4} height={GLASS.ceiling} rx={4} />
          <rect
            x={2}
            y={GLASS.floor}
            width={GLASS.width - 4}
            height={GLASS.height - GLASS.floor}
            rx={4}
          />
          <rect x={5} y={4} width={4} height={GLASS.height - 8} rx={2} fillOpacity={0.35} />
          <rect x={91} y={4} width={4} height={GLASS.height - 8} rx={2} fillOpacity={0.35} />
        </g>
      </svg>
    </div>
  )
}

/**
 * Full-screen rest shapes that fill rather than frame. Same contract as the boxed
 * ones: `fraction` is how much rest is left and drives the level directly. These
 * render below the up-next block rather than behind it, so what's coming stays
 * readable while the shape runs.
 */
function FullBleedShape({ variant, fraction }: { variant: FillVariant; fraction: number }) {
  if (variant === 'hourglass') return <Hourglass fraction={fraction} />

  // 'curtain': the whole viewport is the vessel, and the level falls from the top
  // of the screen to the bottom over the rest.
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-x-0 top-0 bg-accent-bright/20"
        style={{ height: `${fraction * 100}%`, transition: 'height 260ms linear' }}
      >
        {/* The surface line is the reading; everything else is texture. */}
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-accent-bright" />
      </div>
    </div>
  )
}

/**
 * Below this much rest left, the water is too shallow to surface through: a
 * bubble is a fixed size while the liquid is not, so down here it would be about
 * as tall as the water it's meant to rise through.
 */
const TIDE_SURFACING_MIN = 0.15

/**
 * How rare it is for a bubble to make it all the way up: the gap between one
 * surfacing and the next, in ms. Most bubbles fade out mid-water (the
 * `rest-bubble` ones, which drift constantly) — breaking the surface is an event
 * you occasionally catch rather than the steady beat of the shape.
 */
const SURFACE_GAP_MS = { min: 5500, max: 14000 } as const

/** The first surfacing comes sooner, so even a short rest shows one. */
const FIRST_SURFACE_MS = { min: 1200, max: 4200 } as const

/** How long a bubble takes to climb the water, whatever the level. */
const RISE_MS = { min: 2200, max: 3400 } as const

/** One splash's lifetime — keep in step with the `rest-splash-*` keyframes. */
const SPLASH_MS = 720

/**
 * How far up a full-strength splash throws the surface, in the vessel's own
 * hundredths (the SVG viewBox is 100 tall). A small one barely creases it.
 */
const WAVE_LIFT = 8

/** Bubble diameter as a share of the vessel's width, smallest splash to largest. */
const BUBBLE_SIZE = { min: 3.4, max: 7 } as const

/** Droplets thrown by one splash: position across the crown and how far out each flies. */
const SPLASH_DROPS = [
  { left: 34, size: 7, dx: '-300%' },
  { left: 50, size: 8, dx: '30%' },
  { left: 66, size: 6, dx: '340%' },
] as const

const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** A bubble on its way up, alive only until it breaks the surface. */
type Riser = { id: number; left: number; size: number; rise: number }
/** The splash it left behind: `x` across the vessel, `strength` its size. */
type Splash = { id: number; x: number; strength: number }

/** Whether the OS asks for less motion — the splashing is dropped entirely if so. */
function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * The 'tide' shape: a vessel that empties, with a living water surface.
 *
 * The surface is a real wave (see lib/tide) rather than a straight line — a row
 * of sprung nodes that gets thrown upward wherever a bubble bursts, spreads the
 * bump outward, bounces it off the walls and rings down to flat. So the top of
 * the water answers the bubbles instead of ignoring them, and goes still between
 * them. The water *level* is still the countdown, exactly as before; the wave
 * only ever rides on top of it.
 *
 * Bubbles that make it all the way up are spawned one at a time on a random gap,
 * each with its own randomly drawn splash — mostly small dents, occasionally a
 * full crown with droplets arcing out. Bubble size, splash size and the shove
 * given to the wave all come from that one strength draw, so a big splash comes
 * off a big bubble and hits the surface as hard as it looks like it should.
 *
 * `left`/`size` are percentages of the *vessel's width*, never its height, so the
 * bubbles stay round as the level drops; the rise is a full-height column
 * translated by a percentage, which is what keeps a bubble surfacing exactly at
 * the line however far the water has drained.
 */
function TideVessel({ fraction }: { fraction: number }) {
  const [wave] = useState(createWave)
  const [risers, setRisers] = useState<Riser[]>([])
  const [splashes, setSplashes] = useState<Splash[]>([])
  const calm = usePrefersReducedMotion()
  // The render loop and the bubble scheduler both run for the whole rest, so they
  // read the countdown through a ref rather than restarting on every tick.
  const fractionRef = useRef(fraction)
  fractionRef.current = fraction
  const fillRef = useRef<SVGPathElement>(null)
  const lineRef = useRef<SVGPathElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  // The surface is redrawn every frame, so it's written straight to the DOM: this
  // is texture at 60fps and has no business re-rendering the tree that often. The
  // water level follows the countdown here too — a CSS transition on the bubble
  // layer would drift out of step with the path drawn from `level`.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let level = fractionRef.current
    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      // Smooths the countdown's 250ms steps into one continuous drain, the way the
      // other shapes' `transition: height` does.
      level += (fractionRef.current - level) * (1 - Math.exp(-dt / 0.09))
      stepWave(wave, dt)
      const surface = waveSurfacePath(wave, (1 - level) * 100)
      fillRef.current?.setAttribute('d', `${surface} L 100 100 L 0 100 Z`)
      lineRef.current?.setAttribute('d', surface)
      if (layerRef.current) layerRef.current.style.height = `${level * 100}%`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [wave])

  // One bubble in flight at a time: spawn it, and when it reaches the top swap it
  // for a splash and shove the wave where it broke through.
  useEffect(() => {
    if (calm) return
    const timers = new Set<number>()
    const after = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id)
        fn()
      }, ms)
      timers.add(id)
    }
    let nextId = 0
    const spawn = () => {
      after(rand(SURFACE_GAP_MS.min, SURFACE_GAP_MS.max), spawn)
      if (fractionRef.current <= TIDE_SURFACING_MIN) return
      const strength = splashStrength(Math.random())
      const size = BUBBLE_SIZE.min + strength * (BUBBLE_SIZE.max - BUBBLE_SIZE.min)
      // Kept off the far edges: the vessel is round, so near the top of a full one
      // the water is a narrow chord and a bubble at 20% would surface into glass.
      const left = rand(24, 70 - size)
      const rise = rand(RISE_MS.min, RISE_MS.max)
      const id = nextId++
      setRisers((r) => [...r, { id, left, size, rise }])
      after(rise, () => {
        setRisers((r) => r.filter((b) => b.id !== id))
        const x = left + size / 2
        impulseWave(wave, x / 100, strength * WAVE_LIFT)
        setSplashes((s) => [...s, { id, x, strength }])
        after(SPLASH_MS, () => setSplashes((s) => s.filter((p) => p.id !== id)))
      })
    }
    after(rand(FIRST_SURFACE_MS.min, FIRST_SURFACE_MS.max), spawn)
    return () => timers.forEach(clearTimeout)
  }, [calm, wave])

  return (
    <div className="absolute h-[74%] w-[74%] overflow-hidden rounded-full ring-1 ring-accent-bright/50">
      <div className="absolute inset-0 bg-accent-bright/12" />
      {/* The water is a path so its top edge can be the wave. */}
      <svg
        className="absolute inset-0 h-full w-full text-accent-bright"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path ref={fillRef} fill="currentColor" fillOpacity={0.7} />
        {/* The surface line is the reading; non-scaling so it stays 3px however
            the viewBox is stretched onto the vessel. */}
        <path
          ref={lineRef}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Everything that belongs *to* the water rides in a layer exactly as tall
          as it, so `top: 0` is the surface and `bottom: 0` the floor. */}
      <div
        ref={layerRef}
        className="absolute inset-x-0 bottom-0"
        style={{ height: `${fraction * 100}%` }}
      >
        <div className="rest-bubble absolute bottom-[8%] left-[34%] h-[6%] w-[6%] rounded-full bg-accent-bright/70" />
        <div
          className="rest-bubble absolute bottom-[8%] left-[62%] h-[4%] w-[4%] rounded-full bg-accent-bright/70"
          style={{ animationDelay: '1.6s' }}
        />
        {risers.map((b) => (
          // The riser is the travel: a full-height column carrying one bubble at its foot.
          <div
            key={b.id}
            className="rest-riser absolute inset-y-0"
            style={
              { left: `${b.left}%`, width: `${b.size}%`, '--rise': `${b.rise}ms` } as CSSProperties
            }
          >
            <div className="rest-riser-bubble absolute bottom-0 aspect-square w-full rounded-full bg-accent-bright/70" />
          </div>
        ))}
        {splashes.map((s) => (
          // Pinned to the surface line where its bubble broke through. Zero height,
          // so its children hang off the line; one scale sizes the whole splash.
          <div
            key={s.id}
            className="absolute top-0 h-0 w-[44%] -translate-x-1/2"
            style={{
              left: `${s.x}%`,
              transform: `scale(${s.strength})`,
              transformOrigin: '50% 100%',
            }}
          >
            <div className="rest-splash-crown absolute bottom-0 left-1/2 aspect-square w-[26%] -translate-x-1/2 rounded-t-full bg-accent-bright/60" />
            {SPLASH_DROPS.map((drop) => (
              <div
                key={drop.left}
                className="rest-splash-drop absolute bottom-0 aspect-square -translate-x-1/2 rounded-full bg-accent-bright"
                style={
                  { left: `${drop.left}%`, width: `${drop.size}%`, '--dx': drop.dx } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The 'candle' shape: a wax column whose height is the time left, with a flame
 * riding its top down.
 *
 * The flame is simulated rather than keyframed (see lib/flame). A CSS loop can
 * only do the same thing over and over, and the eye picks that up in a second or
 * two — the flame stops reading as a flame and starts reading as a bobbing
 * teardrop. Instead its lean, its height and its brightness each wander on their
 * own beat off their own randomness, and a draught catches it every few seconds,
 * so it never quite does the same thing twice.
 *
 * Like the tide's surface, this is texture at 60fps and is written straight to
 * the DOM — it has no business re-rendering the tree that often. The wax level
 * is still plain React state driven by the countdown; the flicker never touches
 * it, so the time reading stays honest.
 */
function CandleColumn({ fraction }: { fraction: number }) {
  const level = `${fraction * 100}%`
  const flameRef = useRef<SVGSVGElement>(null)
  const calm = usePrefersReducedMotion()

  useEffect(() => {
    // Reduced motion gets a steady flame: no loop at all, so the element keeps
    // the resting look CSS gives it rather than being frozen mid-flicker.
    if (calm) return
    const flame = createFlame()
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      stepFlame(flame, dt)
      const el = flameRef.current
      if (el) {
        const look = flameLook(flame)
        el.style.transform = look.transform
        el.style.opacity = String(look.opacity)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [calm])

  return (
    <div className="absolute bottom-[12%] left-1/2 h-[74%] w-[24%] -translate-x-1/2">
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[16%] rounded-b-[8%] bg-accent-deep/70"
        style={{ height: level, transition: 'height 260ms linear' }}
      >
        {/* Melted rim across the wax top, so it reads as a candle's flat top. */}
        <div className="absolute inset-x-[10%] top-0 h-[9%] -translate-y-1/2 rounded-[50%] bg-accent-deep" />
      </div>
      {fraction > 0 && (
        <div
          className="pointer-events-none absolute left-1/2 h-[30%] w-[64%] -translate-x-1/2"
          style={{ bottom: level, marginBottom: '-4%', transition: 'bottom 260ms linear' }}
        >
          {/* Flame: a pointed teardrop with a denser inner core for depth. The
              wide, faint outer body reads as the flame's glow. */}
          <svg
            ref={flameRef}
            className="rest-flame absolute bottom-0 left-1/2 h-[66%] w-[88%] -translate-x-1/2 text-accent-bright"
            viewBox="0 0 100 100"
            fill="currentColor"
            aria-hidden
          >
            <path d="M50 4 C 70 30 84 44 74 68 C 68 84 60 92 50 96 C 40 92 32 84 26 68 C 16 44 30 30 50 4 Z" opacity="0.4" />
            <path d="M50 34 C 60 46 66 54 61 68 C 58 80 54 86 50 91 C 46 86 42 80 39 68 C 34 54 40 46 50 34 Z" />
          </svg>
          {/* Embers lifting off the flame's tip and winking out. */}
          <span className="rest-ember absolute bottom-[56%] left-[42%] h-[8%] w-[8%] rounded-full bg-accent-bright" />
          <span
            className="rest-ember absolute bottom-[62%] left-[56%] h-[6%] w-[6%] rounded-full bg-accent-bright"
            style={{ animationDelay: '0.7s' }}
          />
          <span
            className="rest-ember absolute bottom-[58%] left-[50%] h-[5%] w-[5%] rounded-full bg-accent-bright"
            style={{ animationDelay: '1.3s' }}
          />
        </div>
      )}
    </div>
  )
}

function RestShape({ variant, fraction }: { variant: Variant; fraction: number }) {
  const level = `${fraction * 100}%`
  const filled = `${(1 - fraction) * 100}%`
  // Smooth the 250ms wall-clock steps into one continuous drain.
  const drain = { transition: 'height 260ms linear' } as const
  switch (variant) {
    case 'tide':
      // A vessel that empties: the water line drops from full to nothing, and the
      // line itself is a wave that rocks when a bubble bursts through it. Small
      // bubbles fade out mid-water; the rare one that surfaces splashes.
      return <TideVessel fraction={fraction} />
    case 'candle':
      // A candle burning down: the wax column (darker green) is squared off like
      // a real candle and its height is the time left; the flame (brighter green)
      // rides its top downward, shedding embers, and gutters out at the base.
      return <CandleColumn fraction={fraction} />
    case 'pips': {
      // A meter that empties bottom-up: lit segments are the time left, and the
      // leading one breathes so the boundary is easy to find at a glance.
      //
      // The leading segment *drains* rather than switching off — its fill sinks
      // to nothing before the segment below takes over as the leading one. A lit
      // pip never vanishes mid-pulse at full brightness, so the boundary slides
      // down the meter continuously instead of hopping segment to segment.
      const total = 6
      const exact = fraction * total
      const leading = Math.floor(exact)
      return (
        <div className="absolute inset-y-[10%] left-1/2 flex w-[26%] -translate-x-1/2 flex-col-reverse gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className="relative flex-1 overflow-hidden rounded-full bg-accent-bright/12">
              <div
                className={`absolute inset-x-0 bottom-0 rounded-full bg-accent-bright/80 ${
                  i === leading ? 'rest-pip' : ''
                }`}
                style={{ height: `${clamp01(exact - i) * 100}%`, ...drain }}
              />
            </div>
          ))}
        </div>
      )
    }
    case 'sandglass':
    default:
      // An hourglass: the top chamber's sand drains out the neck (its surface
      // descending as time runs out) and piles up in the bottom chamber. Nothing
      // is drawn crossing the neck — the two levels moving together carry the
      // flow, and a stream there only drew the eye to the part of the shape that
      // says nothing about the time.
      return (
        <div className="absolute inset-[8%]">
          {/* Caps frame the glass as a timer object. */}
          <div className="absolute inset-x-[6%] top-0 h-[4%] rounded-full bg-accent-bright/60" />
          <div className="absolute inset-x-[6%] bottom-0 h-[4%] rounded-full bg-accent-bright/60" />
          <div
            className="absolute inset-x-0 top-[4%] h-[46%] overflow-hidden"
            style={{ clipPath: 'polygon(2% 0, 98% 0, 55% 100%, 45% 100%)' }}
          >
            <div className="absolute inset-0 bg-accent-bright/12" />
            <div className="absolute inset-x-0 bottom-0 bg-accent-bright/80" style={{ height: level, ...drain }} />
          </div>
          <div
            className="absolute inset-x-0 bottom-[4%] h-[46%] overflow-hidden"
            style={{ clipPath: 'polygon(45% 0, 55% 0, 98% 100%, 2% 100%)' }}
          >
            <div className="absolute inset-0 bg-accent-bright/12" />
            <div className="absolute inset-x-0 bottom-0 bg-accent-bright/80" style={{ height: filled, ...drain }} />
          </div>
        </div>
      )
  }
}

/**
 * Full-screen rest countdown. Wall-clock based: it tracks a target end time and
 * derives the remaining seconds from `Date.now()`, so it stays accurate even
 * when the browser throttles/pauses timers in the background — switch apps and
 * come back and it reflects the real elapsed time. Counts into overtime until
 * dismissed. No system notifications by design.
 *
 * The rest animation is the timer: a restful shape (a sandglass, a draining
 * vessel, a burning-down candle) encodes the time left directly in its level — a
 * calm, glanceable cue for how much rest is left — while the numeric countdown
 * (in dark green) sits at the bottom of the screen. Because the level is derived
 * from the wall-clock end time (not a CSS loop), it stays in sync after
 * backgrounding or a reload. Optional `upNext` tells the resting
 * user what's coming; `progress` + `timeLeftLabel` (rendered verbatim, so the
 * caller phrases it — "~5 min left in workout") show the same session progress
 * bar as the session header — pinned to the top of the rest screen — so rest says
 * how far in you are and not just how long is left. `upNextTarget` puts the load
 * and reps for the coming set alongside its name — see lib/rest for which rests
 * get it. `menu` keeps the session's overflow actions reachable without ending
 * rest first.
 */
export function RestTimer({
  seconds,
  endsAt,
  onClose,
  upNext,
  upNextTarget,
  progress,
  timeLeftLabel,
  autoAdvance,
  menu,
}: {
  seconds: number
  /**
   * When this rest ends (epoch ms). Pass a saved value to resume a rest that was
   * already running — e.g. after a page reload. Defaults to a fresh `seconds`
   * countdown starting now.
   */
  endsAt?: number
  onClose: () => void
  upNext?: string | null
  /** What to go for on the coming set, pre-formatted ("135 × 8", "12 reps"). */
  upNextTarget?: string | null
  /** Session position for the progress bar — completed sets out of the total. */
  progress?: { done: number; total: number; unit?: string }
  timeLeftLabel?: string | null
  /**
   * Roll into the next set the moment rest is up, with no tap. Set per exercise
   * from the overflow menu; the countdown and shape are unchanged, they just stop
   * waiting at zero.
   */
  autoAdvance?: boolean
  /** Overflow actions for the 3-dots menu, mirroring the session header's. */
  menu?: MenuItem[]
}) {
  const endRef = useRef<number>(endsAt ?? Date.now() + seconds * 1000)
  // When this overlay mounted, so a tap that belongs to the *previous* screen
  // can't dismiss it. The set-advance button fires on pointerup (see
  // usePressAction) and the browser then emits a compatibility mouse `click` at
  // the same coordinates — which now hit-tests onto this freshly-mounted overlay
  // and closed the rest instantly, so no rest screen appeared at all.
  const mountedAt = useRef(Date.now())
  // Kept in milliseconds, not whole seconds: the shape's level is derived from
  // this, and rounding here would step it once a second — a staircase the drain
  // transition can't smooth over. The readout rounds for display instead.
  const [remainingMs, setRemainingMs] = useState(() => endRef.current - Date.now())
  const [variant] = useState<Variant>(pickVariant)
  const buzzed = useRef(false)
  // The ticker runs on a mount-only effect, so auto-advance reads its trigger and
  // its callback through refs rather than re-subscribing whenever either changes.
  const autoRef = useRef(autoAdvance)
  autoRef.current = autoAdvance
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const advanced = useRef(false)

  useEffect(() => {
    const tick = () => {
      const ms = endRef.current - Date.now()
      setRemainingMs(ms)
      if (ms <= 0 && !buzzed.current) {
        buzzed.current = true
        navigator.vibrate?.(400)
      }
      // On auto, zero is the tap: the buzz still fires, then rest ends itself.
      if (ms <= 0 && autoRef.current && !advanced.current) {
        advanced.current = true
        closeRef.current()
      }
    }
    tick()
    const id = setInterval(tick, 250)
    // Recompute immediately when returning to the app (timers throttle while hidden).
    const onWake = () => tick()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [])

  const remaining = Math.round(remainingMs / 1000)
  const over = remaining < 0
  const abs = Math.abs(remaining)
  const label = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  // How much of the rest is still left (1 at the start, 0 when rest is up). Each
  // shape encodes this directly as its level — a sand column, a liquid line, a
  // candle's height — so the animation itself reads as the timer. Taken from the
  // millisecond value so the level advances every tick and the drain transition
  // has a small, continuous step to smooth rather than a full second's jump.
  const remainingFraction = seconds > 0 ? clamp01(remainingMs / (seconds * 1000)) : 0
  const full = isFullBleed(variant)
  const fills = isFill(variant)

  /**
   * Wrap a handler so the ghost click that ended the previous set can't trigger it.
   * Applied to tap-to-dismiss so a stray click can't skip the rest entirely.
   */
  const afterGrace = (fn: () => void) => () => {
    if (Date.now() - mountedAt.current < GHOST_CLICK_GRACE_MS) return
    fn()
  }
  const dismiss = afterGrace(onClose)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-hidden bg-black px-6"
      onClick={dismiss}
    >
      {/* The perimeter shape frames the screen edge, so it spans the whole overlay
          and passes behind everything without covering any of it. */}
      {variant === 'perimeter' && <PerimeterFrame fraction={remainingFraction} />}

      {/* Top region: the "how far through the workout" bar sits at the very top,
          with the up-next/menu row and the coming set's numbers under it. This
          is the part you're resting to read, so it gets the top of the screen
          and the filling shapes start below it. */}
      <div className="relative z-10 w-full pt-[calc(0.75rem+env(safe-area-inset-top))]">
        {progress && (
          <SessionProgress
            done={progress.done}
            total={progress.total}
            unit={progress.unit ?? 'sets'}
            timeLeftLabel={timeLeftLabel}
            className="w-full"
          />
        )}
        {(upNext || menu) && (
          // One row: the menu sits at the right with "up next" still centered
          // between the edges, so a long exercise name can't run underneath it.
          <div className="mt-3 flex w-full items-start gap-2">
            <div className="w-11 shrink-0" aria-hidden />
            <p className="flex-1 pt-2.5 text-center text-base font-semibold text-neutral-200">{upNext}</p>
            {/* Tapping the overlay ends rest, so the menu keeps its taps to itself. */}
            <div className="w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
              {menu && <KebabMenu items={menu} />}
            </div>
          </div>
        )}
        {upNextTarget && (
          // The numbers for the coming set, big enough to read at arm's length
          // while you walk over and load it.
          <p className="mt-2 text-center text-4xl font-bold tabular-nums text-white">
            {upNextTarget}
          </p>
        )}
      </div>

      {/* The animation is the timer: the shape's level carries the countdown
          (full at the start, empty when rest is up); any looping motion is just
          texture and never drives the level. A filling shape and a boxed one both
          take the space under the row above rather than running behind it. */}
      <div className="relative flex w-full flex-1 items-center justify-center">
        {fills && <FullBleedShape variant={variant} fraction={remainingFraction} />}
        {!full && (
          <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
            <RestShape variant={variant} fraction={remainingFraction} />
          </div>
        )}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* Dark green for the timer UI, overtime included — the leading "+" says
            you're past due without the number brightening to grab at you. */}
        <div className="font-mono text-7xl font-bold tabular-nums text-accent">{label}</div>
        {/* The session progress bar now lives at the top; when there's no bar to
            show, fall back to the bare time-left line here. */}
        {!progress && timeLeftLabel && (
          <p className="text-sm font-medium text-neutral-400">{timeLeftLabel}</p>
        )}
      </div>
    </div>
  )
}
