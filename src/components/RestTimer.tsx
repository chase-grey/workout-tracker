import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { rollsThroughRest, type FastMode } from '../lib/fastMode'
import { createFlame, flameLook, gutterFlame, stepFlame, type Flame } from '../lib/flame'
import { bubbleOpacity, createSwarm, stepSwarm, type Vent } from '../lib/bubbles'
import { createWave, impulseWave, stepWave, waveHeightAt, waveSurfacePath } from '../lib/tide'
import { createVessel, VESSEL_KINDS, type Vessel } from '../lib/vessels'
import { EXTRA_BOX_VARIANTS, EXTRA_FILL_VARIANTS, isExtraVariant } from '../lib/restShapes'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'
import { createRotation } from '../lib/variantRotation'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../lib/shell'
import { ExtraRestShape } from './RestShapes'

// Time-telling shapes made for rest: each one encodes the remaining fraction
// directly in its dominant dimension — a sand level, a liquid line, a candle's
// height, a stack of lit segments — so a glance reads how much rest is left.
// Any looping motion (rising bubbles, a flickering flame) is texture only and
// never drives that level, so the time reading stays honest.
//
// A shape may just as well *fill* as drain: `1 - fraction` is the same reading the
// other way up, and rest is a recharge as much as it is a countdown. The rest of
// the set lives in RestShapes, which is also where the mechanics that aren't a
// falling level are — a closing gap, an angle, a width, a radius, a count.
//
// Boxed shapes live in a square in the middle of the screen. Full-bleed ones use
// the entire viewport instead, sitting behind the readout — a rest you can read
// from across the gym without looking at the numbers.
const BOX_VARIANTS = ['sandglass', 'tide', 'candle', 'pips', ...EXTRA_BOX_VARIANTS] as const
// 'perimeter' frames the screen edge; the others fill it, so they sit below the
// up-next block rather than behind it.
const FILL_VARIANTS = ['curtain', 'hourglass', ...EXTRA_FILL_VARIANTS] as const
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

// Held across mounts (each rest remounts the timer) so the order stays random
// without repeating the shape you just watched or leaving one unseen for a whole
// workout — see lib/variantRotation for how the two pull against each other.
const rotation = createRotation(VARIANTS)

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
 * The 'hourglass' shape's geometry, in its own SVG user units — a 100 × 150 box,
 * so every number here is also a percentage of the glass.
 *
 * Straight lines only, and no depth of any kind: this is the *sign* for an
 * hourglass rather than a drawing of one. Two trapezoids meeting at a waist, one
 * stroke weight, flat fills — nothing that implies a lit surface, a thickness or
 * a material.
 *
 * The sand is two flat-topped blocks that *slide* rather than shapes redrawn on
 * every tick, each clipped by the half it lives in: the upper one sinks toward
 * the waist, the lower one rises off the base. The motion stays on `transform`,
 * so the countdown's 250ms steps smooth into one continuous fall the way the
 * other shapes' `height` transitions do.
 */
const GLASS = {
  width: 100,
  height: 150,
  /** The upper half's top edge, and the lower half's bottom edge. */
  top: 5,
  bottom: 145,
  /** The waist, where the two halves meet. */
  waist: 75,
  /** Half-width of the opening at that waist. */
  waistHalf: 3,
  /** How far the halves sit inside the box, leaving room for the stroke. */
  wall: 8,
} as const

const HALF_L = GLASS.wall
const HALF_R = GLASS.width - GLASS.wall
const WAIST_L = GLASS.width / 2 - GLASS.waistHalf
const WAIST_R = GLASS.width / 2 + GLASS.waistHalf

/** How far each block travels: the full height of its half. */
const UPPER_SPAN = GLASS.waist - GLASS.top
const LOWER_SPAN = GLASS.bottom - GLASS.waist

/**
 * The two halves: a flat edge tapering in straight lines to the waist. Mirrored
 * about it, so the empty lower half is the full upper one upside down.
 */
const UPPER_PATH = [
  `M ${HALF_L} ${GLASS.top}`,
  `L ${HALF_R} ${GLASS.top}`,
  `L ${WAIST_R} ${GLASS.waist}`,
  `L ${WAIST_L} ${GLASS.waist}`,
  'Z',
].join(' ')

const LOWER_PATH = [
  `M ${WAIST_L} ${GLASS.waist}`,
  `L ${WAIST_R} ${GLASS.waist}`,
  `L ${HALF_R} ${GLASS.bottom}`,
  `L ${HALF_L} ${GLASS.bottom}`,
  'Z',
].join(' ')

/**
 * A block of sand with a flat top at `y`, filled down to `bottom` and run wider
 * than the box so its clipped side edges never show.
 */
function sandBlock(y: number, bottom: number): string {
  return `M -10 ${y} H ${GLASS.width + 10} V ${bottom} H -10 Z`
}

/** The charge still to fall, filling the upper half of a fresh glass. */
const UPPER_SAND_PATH = sandBlock(GLASS.top, GLASS.waist)

/** The sand already fallen, parked just under the base until it starts rising. */
const LOWER_SAND_PATH = sandBlock(GLASS.bottom, GLASS.bottom + LOWER_SPAN)

/**
 * Where the sand sits with `fraction` of the rest left (1 at the start, 0 when
 * it's up): how far the upper block has sunk, and how far the lower has risen.
 */
function hourglassLevels(fraction: number) {
  const spent = 1 - clamp01(fraction)
  return { drop: UPPER_SPAN * spent, rise: LOWER_SPAN * spent }
}

/**
 * The 'hourglass' shape: a flat two-tone diagram of an hourglass standing the
 * full height of the rest screen. The upper half's level sinks toward the waist
 * as the rest runs out and the lower half's rises by exactly as much, so either
 * half alone says how much rest is left.
 *
 * Deliberately abstract: no frame, no glass, no highlights, no heaped or scooped
 * sand — those all read as an illustration of an object, and the shape is meant
 * to read as a gauge. What's left is two tapered blocks of colour and the line
 * between full and empty.
 *
 * No stream through the waist either: watching grains fall pulled the eye to the
 * one part of the shape that says nothing about the time. Both levels move
 * continuously on their own, so the fall still reads without anything crossing
 * the gap.
 *
 * One SVG, letterboxed into whatever space the rest screen has, so the shape
 * keeps its proportions on any display instead of being stretched to the
 * viewport.
 */
function Hourglass({ fraction }: { fraction: number }) {
  // Each half clips its own sand, and a clip path is referenced by id. Stripped
  // to word characters: useId's own punctuation has no business in a url(#…).
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
            <path d={UPPER_PATH} />
          </clipPath>
          <clipPath id={`${id}-lower`}>
            <path d={LOWER_PATH} />
          </clipPath>
        </defs>
        <g fill="currentColor">
          {/* The empty halves, so both are still there once their sand has gone. */}
          <path d={UPPER_PATH} fillOpacity={0.1} />
          <path d={LOWER_PATH} fillOpacity={0.1} />
          {/* The sand still to fall, and the sand already fallen. */}
          <g clipPath={`url(#${id}-upper)`}>
            <path d={UPPER_SAND_PATH} fillOpacity={0.85} style={slide(drop)} />
          </g>
          <g clipPath={`url(#${id}-lower)`}>
            <path d={LOWER_SAND_PATH} fillOpacity={0.85} style={slide(-rise)} />
          </g>
        </g>
        {/* The outline, over the sand so the taper stays crisp. One weight, no
            highlight — the line is the shape's edge and nothing more. */}
        <g fill="none" stroke="currentColor" strokeOpacity={0.55} vectorEffect="non-scaling-stroke">
          <path d={UPPER_PATH} strokeWidth={2} />
          <path d={LOWER_PATH} strokeWidth={2} />
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
  if (variant !== 'curtain') return <ExtraRestShape variant={variant} fraction={fraction} />

  // 'curtain': the whole viewport is the vessel, and the level falls from the top
  // of the screen to the bottom over the rest.
  return (
    // Pulled out past the rest screen's own padding, like the fuse: a surface line
    // that stops short of both edges reads as a bar sitting on the screen instead
    // of as the level of something the screen is full of.
    <div className="pointer-events-none absolute inset-y-0 -left-6 -right-6 overflow-hidden" aria-hidden>
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
 * One splash's lifetime at a modest pop, in ms — scaled by how high the crown was
 * thrown, so one thrown higher also takes longer to come back down. Kept in step
 * with the `rest-splash-*` keyframes, which read the same duration.
 */
const SPLASH_MS = 780

/**
 * How strong a burst has to be to be worth a crown. Below it the bubble still shoves
 * the surface — the wave answers every burst, so the water is never still — there is
 * just nothing thrown clear of the line to draw, which is what an ordinary little
 * bubble does. Set where roughly a third of the bursts clear it: the line is always
 * moving, and water actually leaving it is an event every few seconds.
 */
const SPLASH_VISIBLE = 0.42

/** How high a crown is thrown, as a multiple of a modest pop: weakest burst to full. */
const SPLASH_HEIGHT = { min: 0.7, max: 1.8 } as const

/** How many places along the floor the bubbles come from. */
const VENTS = { min: 1, max: 3 } as const

/**
 * How much room across a vent needs, in box units: the widest bubble that forms plus
 * the walls it has to stay off. A vessel that comes to a point at the bottom has none
 * of that at its floor, so its vents are pushed up it until they fit.
 */
const VENT_ROOM = 6

/** How far up the vessel that may push them, as a share of the depth. */
const VENT_LIFT = 0.3

/** How far over a vent the walls are read, so the floor line itself isn't a pinch. */
const VENT_PROBE = 1

/** How far the vents stay off the walls, in box units. */
const VENT_EDGE = 4

/** How much of its share of the floor a vent may wander, so two never line up. */
const VENT_WANDER = 0.5

/** Droplets thrown by one splash: position across the crown and how far out each flies. */
const SPLASH_DROPS = [
  { left: 34, size: 7, dx: '-300%' },
  { left: 50, size: 8, dx: '30%' },
  { left: 66, size: 6, dx: '340%' },
] as const

const lerp = (range: { min: number; max: number }, at: number) =>
  range.min + at * (range.max - range.min)

/** The splash a bubble left behind: `x` across the vessel, `strength` its size. */
type Splash = { id: number; x: number; strength: number; pop: number }

/**
 * Which vessel the water is in. Rotated the same way the rest shapes themselves
 * are — module scope, because the timer is remounted for every rest — so the tide
 * comes up in a different container each time rather than always the circle.
 */
const vessels = createRotation(VESSEL_KINDS)

/**
 * The lowest line across the vessel with room on it for a bubble. A flat-bottomed
 * shape gives that up at its floor; a triangle standing on a corner or a random
 * polygon that came to a point has to be climbed a little way first, and the search
 * gives up a third of the way up rather than sending the bubbles to the middle.
 */
function ventFloor(vessel: Vessel): number {
  const limit = vessel.bottom - (vessel.bottom - vessel.top) * VENT_LIFT
  for (let y = vessel.bottom; y > limit; y -= 1) {
    const room = vessel.spanAt(y - VENT_PROBE)
    if (room && room[1] - room[0] >= VENT_ROOM) return y
  }
  return limit
}

/**
 * Where the bubbles come from: a few places spread along that line, each given its
 * own share of it to sit somewhere in. Sharing it out rather than drawing each one
 * freely is what keeps two vents from coming up in the same place — and keeps them
 * close enough that a bubble rising off one drifts into the chain off the next,
 * which is where most of the merges come from.
 */
function bubbleVents(vessel: Vessel, rng: () => number = Math.random): Vent[] {
  const y = ventFloor(vessel)
  const room = vessel.spanAt(y - VENT_PROBE) ?? [50, 50]
  const lo = room[0] + VENT_EDGE
  const hi = room[1] - VENT_EDGE
  const count = VENTS.min + Math.floor(rng() * (VENTS.max - VENTS.min + 1))
  if (hi <= lo) return [{ x: (room[0] + room[1]) / 2, y }]
  const share = (hi - lo) / count
  return Array.from({ length: count }, (_, i) => ({
    x: lo + share * (i + 0.5) + (rng() - 0.5) * share * VENT_WANDER,
    y,
  }))
}

/**
 * The 'tide' shape: a vessel that empties, with a living water surface.
 *
 * The surface is a real wave (see lib/tide) rather than a straight line — a row of
 * sprung nodes that gets thrown upward wherever a bubble bursts, spreads the bump
 * outward, bounces it off the walls and rings down. So the top of the water answers
 * the bubbles instead of ignoring them. It is tuned slow, because wave speed is what
 * says how big a body of water this is. The water *level* is still the countdown; the
 * wave only ever rides on top of it.
 *
 * The bubbles are a simulation (see lib/bubbles), not an animation: each one is a
 * body carrying a velocity, pulled up by buoyancy, held back by the water, knocked
 * about by its own wobble and by the walls, and joined to any bubble it touches —
 * volume and momentum both conserved, so the pair comes out of it slower than the
 * bigger one was and has to earn its speed back. Nothing about a bubble's life is
 * decided when it forms. Big ones outrun small ones, so a vent's chain eats itself on
 * the way up, and the crown worth looking at is one that grew three bubbles deep and
 * arrived fast. What each burst does to the wave is what the bubble was carrying when
 * it hit the line.
 *
 * Because the bubbles read the water line every frame rather than being told about it
 * when they were born, a falling surface catches them: as the rest runs out the last
 * of them burst early, and there is nothing left in an empty vessel.
 *
 * The vessel is whatever came up in the rotation, and can be any shape that holds
 * water. Its bounds are what the level is mapped into, so full is full and empty is
 * empty in a triangle as much as in a circle; a CSS clip path cuts the water and the
 * bubbles to its outline, and the simulation is handed the vessel's own walls, so
 * nothing rises through the glass.
 *
 * The surface and the bubbles are both written straight to the DOM every frame — this
 * is texture at 60fps and has no business re-rendering the tree that often. React is
 * only told which bubbles exist, which changes when one forms, merges or bursts.
 */
function TideVessel({ fraction }: { fraction: number }) {
  const [vessel] = useState(() => createVessel(vessels.next()))
  const [wave] = useState(createWave)
  const [swarm] = useState(() => createSwarm(bubbleVents(vessel)))
  const [live, setLive] = useState<number[]>([])
  const [splashes, setSplashes] = useState<Splash[]>([])
  const calm = usePrefersReducedMotion()
  // The render loop runs for the whole rest, so it reads the countdown through a ref
  // rather than restarting on every tick.
  const fractionRef = useRef(fraction)
  fractionRef.current = fraction
  const fillRef = useRef<SVGPathElement>(null)
  const lineRef = useRef<SVGPathElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const bubbleEls = useRef(new Map<number, HTMLDivElement>())
  const liveRef = useRef<number[]>([])

  // The water line runs from the vessel's own top to its own bottom rather than the
  // box's, so a shape that doesn't reach the edges still reads full at the start and
  // empty at the end instead of spending the ends of the rest out of sight.
  const depth = vessel.bottom - vessel.top

  useEffect(() => {
    // Reduced motion mid-rest: empty the water rather than leaving whatever was in it
    // frozen in place, which is the one thing worse than motion.
    if (calm && swarm.bubbles.length) {
      swarm.bubbles = []
      liveRef.current = []
      setLive([])
    }
    const timers = new Set<number>()
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
      const flat = vessel.bottom - level * depth

      if (!calm) {
        // The bubbles are given the wave's surface rather than the flat line, so what
        // lets one out is the water actually over it at that moment.
        const water = {
          surfaceAt: (x: number) => flat + waveHeightAt(wave, x / 100),
          spanAt: vessel.spanAt,
        }
        for (const pop of stepSwarm(swarm, water, dt)) {
          impulseWave(wave, pop.x / 100, pop.lift, pop.bump)
          if (pop.strength < SPLASH_VISIBLE) continue
          const height = lerp(SPLASH_HEIGHT, pop.strength)
          const splash = { id: pop.id, x: pop.x, strength: pop.strength, pop: height }
          setSplashes((s) => [...s, splash])
          const timer = window.setTimeout(() => {
            timers.delete(timer)
            setSplashes((s) => s.filter((p) => p.id !== splash.id))
          }, SPLASH_MS * height)
          timers.add(timer)
        }

        // React is told the roster; the loop places each one itself.
        const ids = swarm.bubbles.map((b) => b.id)
        const roster = liveRef.current
        if (ids.length !== roster.length || ids.some((id, i) => id !== roster[i])) {
          liveRef.current = ids
          setLive(ids)
        }
        for (const b of swarm.bubbles) {
          const el = bubbleEls.current.get(b.id)
          if (!el) continue
          el.style.left = `${b.x - b.r}%`
          el.style.top = `${b.y - b.r}%`
          el.style.width = `${b.r * 2}%`
          el.style.opacity = `${bubbleOpacity(b)}`
        }
      }

      const surface = waveSurfacePath(wave, flat)
      fillRef.current?.setAttribute('d', `${surface} L 100 100 L 0 100 Z`)
      lineRef.current?.setAttribute('d', surface)
      if (layerRef.current) layerRef.current.style.height = `${level * depth}%`
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the vessel never changes
  }, [calm, wave, swarm, depth])

  return (
    <div className="absolute h-[74%] w-[74%]">
      {/* The vessel's outline cuts the water and everything in it, so any shape that
          holds water can be the container. */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: vessel.clip }}>
        <div className="absolute inset-0 bg-accent-bright/12" />
        {/* The water is a path so its top edge can be the wave. It's drawn across the
            whole box and cropped to the vessel, which is what lets the surface line
            meet the walls exactly wherever they happen to be — the wave's own
            reflections happen at the box's edges rather than the vessel's, so in a
            narrow shape a ripple rolls out of sight and comes back, which is as
            close to right as a one-dimensional surface gets. */}
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
        {/* The bubbles sit in the vessel's own box — the simulation works in the same
            hundredths the clip path does — so nothing here says where one is or how
            big it is. The box is square, so a width in percent and a square aspect
            make a circle. */}
        {live.map((id) => (
          <div
            key={id}
            ref={(el) => {
              if (el) bubbleEls.current.set(id, el)
              else bubbleEls.current.delete(id)
            }}
            className="absolute aspect-square rounded-full bg-accent-bright/70"
            style={{ opacity: 0 }}
          />
        ))}
        {/* The splashes ride in a layer exactly as tall as the water, so `top: 0` is
            the surface and the crown hangs off the line as it falls. */}
        <div
          ref={layerRef}
          className="absolute inset-x-0"
          style={{ bottom: `${100 - vessel.bottom}%`, height: `${fraction * depth}%` }}
        >
          {splashes.map((s) => (
            // Pinned to the surface line where its bubble broke through. Zero height,
            // so its children hang off the line; one scale sizes the whole splash,
            // and `--lift` is how high this one throws it.
            <div
              key={s.id}
              className="absolute top-0 h-0 w-[44%] -translate-x-1/2"
              style={
                {
                  left: `${s.x}%`,
                  transform: `scale(${s.strength})`,
                  transformOrigin: '50% 100%',
                  '--lift': s.pop,
                  '--splash-ms': `${SPLASH_MS * s.pop}ms`,
                } as CSSProperties
              }
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
      {/* The glass, over the water and outside the clip so its full weight shows
          rather than the outer half being cropped away. */}
      <svg
        className="absolute inset-0 h-full w-full text-accent-bright"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={vessel.outline}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.5}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

/**
 * Where a candle is in its life: burning, going out (the flame collapsing into
 * the wick, the first smoke already lifting off it), smoking (the flame gone, the
 * plume still climbing), or out — nothing above the wax at all.
 */
type CandlePhase = 'lit' | 'snuff' | 'smoke' | 'out'

/**
 * How long the flame takes to go out once the wax has run out, in ms — kept in
 * step with the `rest-flame-snuff` keyframes, which read the same duration.
 */
const SNUFF_MS = 700

/**
 * How long the whole burn-out runs, in ms, measured from the moment the wax runs
 * out: the last wisp's delay plus its own climb, with a little room to spare.
 * After this the candle is simply out and nothing above the wax is drawn.
 */
const BURN_OUT_MS = 4900

/**
 * The smoke the snuffed wick gives off. `left` and `size` place each wisp across
 * the flame's own box in hundredths of it; `curl` is how far it has drifted by
 * mid-climb and `dx` where it ends up, both in vw and deliberately of opposite
 * signs — a wisp that doubles back on itself on the way up reads as smoke, where
 * one that runs straight reads as a bubble. `blur` softens it in its own frame,
 * which is before the climb's growing `scale` is applied, so the blur spreads
 * with the wisp and it thins out as it rises at no per-frame cost. `delay`/`secs`
 * stagger the plume so it trails off the top of the screen rather than leaving in
 * a clump, and the first wisp is away while the flame is still dying.
 */
const SMOKE_WISPS = [
  { left: 42, size: 32, curl: -2.2, dx: 3.4, blur: 4, peak: 0.5, delay: 0.45, secs: 3.4 },
  { left: 57, size: 26, curl: 1.9, dx: -2.8, blur: 4, peak: 0.44, delay: 0.75, secs: 3.3 },
  { left: 46, size: 36, curl: -1.5, dx: 4.2, blur: 5, peak: 0.42, delay: 1.05, secs: 3.1 },
  { left: 55, size: 28, curl: 2.4, dx: -1.7, blur: 5, peak: 0.38, delay: 1.4, secs: 3 },
  { left: 48, size: 34, curl: -1.9, dx: 2.6, blur: 5, peak: 0.34, delay: 1.75, secs: 2.8 },
  { left: 53, size: 26, curl: 1.4, dx: -3.4, blur: 6, peak: 0.3, delay: 2.15, secs: 2.6 },
] as const

/**
 * The 'candle' shape: a wax column whose height is the time left, with a flame
 * riding its top down — and, once the wax runs out, a flame that goes out and
 * leaves as smoke.
 *
 * The flame is simulated rather than keyframed (see lib/flame). A CSS loop can
 * only do the same thing over and over, and the eye picks that up in a second or
 * two — the flame stops reading as a flame and starts reading as a bobbing
 * teardrop. Instead its lean, its height and its brightness each wander on their
 * own beat off their own randomness, and a draught catches it every few seconds,
 * so it never quite does the same thing twice.
 *
 * The burn-out *is* keyframed, and that isn't a contradiction: what a loop can't
 * do is happen once. The candle goes out one time per rest, so the snuff and the
 * plume are exactly what CSS is good at — and the snuff rides a wrapper around
 * the flame rather than the flame itself, so the simulation keeps running
 * underneath and the flame dies mid-lean and mid-flicker, with one last draught
 * for the lurch, instead of snapping upright to die.
 *
 * Like the tide's surface, the flicker is texture at 60fps and is written straight
 * to the DOM — it has no business re-rendering the tree that often. The wax level
 * is still plain React state driven by the countdown; the flicker never touches
 * it, so the time reading stays honest. Neither does the burn-out: it starts when
 * the level reaches nothing, and it's the one thing here that outlives the
 * reading rather than telling it.
 */
function CandleColumn({ fraction }: { fraction: number }) {
  const level = `${fraction * 100}%`
  const flameRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<Flame | null>(null)
  const calm = usePrefersReducedMotion()
  const lit = fraction > 0
  // A candle that arrives already spent — rest reopened past its own end — starts
  // out, rather than replaying a burn-out nobody was here to watch.
  const [phase, setPhase] = useState<CandlePhase>(() => (lit ? 'lit' : 'out'))

  useEffect(() => {
    if (lit) {
      setPhase('lit')
      return
    }
    // Reduced motion gets no burn-out at all: the whole of it is a plume crossing
    // the entire screen, which is the one thing it asks not to be given. The flame
    // is simply gone once the wax is.
    setPhase((p) => (p !== 'lit' ? p : calm ? 'out' : 'snuff'))
  }, [lit, calm])

  useEffect(() => {
    if (phase === 'snuff') {
      const id = setTimeout(() => setPhase('smoke'), SNUFF_MS)
      return () => clearTimeout(id)
    }
    if (phase === 'smoke') {
      const id = setTimeout(() => setPhase('out'), BURN_OUT_MS - SNUFF_MS)
      return () => clearTimeout(id)
    }
  }, [phase])

  useEffect(() => {
    // Reduced motion gets a steady flame: no loop at all, so the element keeps
    // the resting look CSS gives it rather than being frozen mid-flicker. The loop
    // also stops once the flame is out, since there's nothing left to flicker.
    if (calm || (phase !== 'lit' && phase !== 'snuff')) return
    // Held in a ref across the phase change, so the flame that dies is the one
    // that was burning a moment ago rather than a fresh one starting from rest.
    const flame = (simRef.current ??= createFlame())
    // The draught that put it out.
    if (phase === 'snuff') gutterFlame(flame, Math.random() < 0.5 ? -1 : 1)
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
  }, [calm, phase])

  return (
    <div className="absolute bottom-[12%] left-1/2 h-[74%] w-[24%] -translate-x-1/2">
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[16%] rounded-b-[8%] bg-accent-deep/70"
        style={{ height: level, transition: 'height 260ms linear' }}
      >
        {/* Melted rim across the wax top, so it reads as a candle's flat top. */}
        <div className="absolute inset-x-[10%] top-0 h-[9%] -translate-y-1/2 rounded-[50%] bg-accent-deep" />
      </div>
      {phase !== 'out' && (
        <div
          className="pointer-events-none absolute left-1/2 h-[30%] w-[64%] -translate-x-1/2"
          style={{ bottom: level, marginBottom: '-4%', transition: 'bottom 260ms linear' }}
        >
          {phase !== 'smoke' && (
            // The flame and its sparks together, so the snuff takes both down at
            // once — a flame that has gone out throws no more embers. The wrapper
            // spans the whole box, so everything inside keeps measuring against
            // the same edges it did while the candle was burning.
            <div className={`absolute inset-0 ${phase === 'snuff' ? 'rest-flame-snuff' : ''}`}>
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
          {phase !== 'lit' && (
            // Mounted for the whole burn-out rather than per phase, so the plume
            // runs as one unbroken set of animations across the flame going out:
            // the thread is already standing off the wick as the flame collapses
            // into it, which is what ties the smoke to the fire that made it.
            <>
              <div className="rest-smoke-thread absolute bottom-[22%] left-1/2 h-[46%] w-[13%] -translate-x-1/2 rounded-full bg-accent-bright" />
              {SMOKE_WISPS.map((wisp) => (
                <div
                  key={wisp.delay}
                  className="rest-smoke absolute aspect-square -translate-x-1/2 rounded-full bg-accent-bright"
                  style={
                    {
                      left: `${wisp.left}%`,
                      bottom: '42%',
                      width: `${wisp.size}%`,
                      filter: `blur(${wisp.blur}px)`,
                      animationDelay: `${wisp.delay}s`,
                      animationDuration: `${wisp.secs}s`,
                      '--curl': `${wisp.curl}vw`,
                      '--dx': `${wisp.dx}vw`,
                      '--peak': wisp.peak,
                    } as CSSProperties
                  }
                />
              ))}
            </>
          )}
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
  // The shapes that live in RestShapes — a cell charging, a tap filling a glass, a
  // bar loading, a balance tipping, a moon waning, a coil paying out, ice melting,
  // a snow globe settling, an icicle closing on its stalagmite, and a pane of black
  // glass counting its beads: joining seven of them into one, breaking one into
  // seven, shedding them off the pane, or gathering them onto it.
  if (isExtraVariant(variant)) return <ExtraRestShape variant={variant} fraction={fraction} />

  switch (variant) {
    case 'tide':
      // A vessel that empties: the water line drops from full to nothing, and the
      // line itself is a wave that rocks when a bubble bursts through it. Small
      // bubbles fade out mid-water; the rare one that surfaces splashes.
      return <TideVessel fraction={fraction} />
    case 'candle':
      // A candle burning down: the wax column (darker green) is squared off like
      // a real candle and its height is the time left; the flame (brighter green)
      // rides its top downward, shedding embers, and gutters out at the base —
      // where it collapses into the wick and goes up as smoke, which climbs the
      // screen and leaves over the top of it.
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
 * (in dark green) sits at the bottom of the screen. Running hands-free the
 * countdown goes away and the shape is the whole screen. Because the level is derived
 * from the wall-clock end time (not a CSS loop), it stays in sync after
 * backgrounding or a reload.
 *
 * The top of the screen is the part you're resting to read, and it belongs to the
 * session: the caller hands over the very node its own screen puts up there as
 * `header`, and this renders it in the same content box the app shell gives that
 * screen — so the progress bar, the move named, the set coming and the session's
 * controls all stay exactly where they were when rest opens over them. There is
 * no alternative top row on purpose; a rest screen that built its own would drift
 * from the session's the moment either changed. `upNextTarget` puts the load and
 * reps for the coming set under it, big enough to read while you walk over and
 * load it — see lib/rest for which rests get it.
 */
export function RestTimer({
  seconds,
  endsAt,
  onClose,
  header,
  upNextTarget,
  fastMode = 'off',
}: {
  seconds: number
  /**
   * When this rest ends (epoch ms). Pass a saved value to resume a rest that was
   * already running — e.g. after a page reload. Defaults to a fresh `seconds`
   * countdown starting now.
   */
  endsAt?: number
  /**
   * Rest is over. `expired` is true only when the countdown ran itself out under
   * fast-forward, so a caller can tell that from a rest cut short by a tap — the
   * one it hands a get-into-position count to.
   */
  onClose: (expired?: boolean) => void
  /**
   * The session's own top-of-screen block — the same node the screen behind this
   * one renders, so resting leaves the top of the screen untouched. Required:
   * every rest belongs to a session, and the session's toolbar is the only one
   * there is. Controls inside it must stop their own clicks, since a tap on the
   * overlay ends rest.
   */
  header: ReactNode
  /** What to go for on the coming set, pre-formatted ("135 × 8", "12 reps"). */
  upNextTarget?: string | null
  /**
   * How hands-free the session is running (see lib/fastMode). Anything but `off`
   * rolls into the next set the moment rest is up, with no tap, and drops the
   * numeric countdown: the seconds are only worth reading when you're the one
   * deciding when rest is over, so what's left is the shape draining. Stepping the
   * mode from here is the header's own fast-forward toggle, riding along in it.
   */
  fastMode?: FastMode
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
  const [variant] = useState<Variant>(() => rotation.next())
  const buzzed = useRef(false)
  // Whether this rest ends itself. Also what hides the numeric countdown: nothing
  // is waiting on the number, so the shape carries the rest by itself.
  const rolls = rollsThroughRest(fastMode)
  // The ticker runs on a mount-only effect, so auto-advance reads its trigger and
  // its callback through refs rather than re-subscribing whenever either changes.
  const autoRef = useRef(rolls)
  autoRef.current = rolls
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
      // On fast-forward, zero is the tap: the buzz still fires, then rest ends
      // itself — flagged as expired, so what follows knows the full rest was had.
      if (ms <= 0 && autoRef.current && !advanced.current) {
        advanced.current = true
        closeRef.current(true)
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
  // A tap ends rest early, so it never reports the rest as expired.
  const dismiss = afterGrace(() => onClose())

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-hidden bg-black px-6"
      onClick={dismiss}
    >
      {/* The perimeter shape frames the screen edge, so it spans the whole overlay
          and passes behind everything without covering any of it. */}
      {variant === 'perimeter' && <PerimeterFrame fraction={remainingFraction} />}

      {/* Top region: the session's own toolbar, with the coming set's numbers under
          it. This is the part you're resting to read, so it gets the top of the
          screen and the filling shapes start below it.

          It is laid out in the app shell's own content box (see lib/shell), which
          this overlay isn't inside — hence the negative margin, undoing the `px-6`
          the shapes below are padded by so the shell's gutters can apply instead.
          The toolbar then lands on the pixels it already occupied, and rest opening
          moves nothing above the fold. */}
      <div className={`relative z-10 -mx-6 self-stretch ${SHELL_PAD_TOP}`}>
        <div className={`${SHELL_WIDTH} ${SHELL_PAD_X}`}>
          {header}
          {upNextTarget && (
            // The numbers for the coming set, big enough to read at arm's length
            // while you walk over and load it.
            <p className="mt-2 text-center text-4xl font-bold tabular-nums text-white">
              {upNextTarget}
            </p>
          )}
        </div>
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
            you're past due without the number brightening to grab at you.
            Hidden while the session is running itself forward: there's no moment
            to wait for and no decision to make on the number, so the shape is
            left to say how much rest is left on its own. */}
        {!rolls && (
          <div className="font-mono text-7xl font-bold tabular-nums text-accent">{label}</div>
        )}
      </div>
    </div>
  )
}
