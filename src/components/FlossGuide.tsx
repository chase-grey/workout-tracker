import { useId } from 'react'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'
import { isFlossVariant, type FlossVariant, type RhythmVariant } from '../lib/rhythmVariant'

/** The glide runs between these two points of the frame's width; forward is right. */
const RUN_START = 12
const RUN_SPAN = 76
/** The same floor and ceiling the other shapes light their parts within. */
const DIM = 0.2
const BRIGHT = 0.7
/** The crest itself, the one part lit past the ceiling. */
const CREST = 0.9
/** The wake: short at the turns, drawn out at full speed. */
const WAKE_MIN = 7
const WAKE_GAIN = 24
/** The front stays tight, so every figure leans into the way it's going. */
const FRONT = 6

/**
 * The figures that run up the phone instead of across it. They draw the same glide
 * on the same clock; only the axis turns, and forward is up.
 */
const VERTICAL: ReadonlySet<FlossVariant> = new Set(['kite', 'helix', 'fill', 'scan'])
/** The frame's `top` for a point so far along the run, forward being up. */
const up = (along: number) => 100 - along

const easeInOutSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2
const front = (d: number) => Math.exp(-((d / FRONT) ** 2))
/** Three decimals: plenty for a percent of the frame, and never in exponent form. */
const r = (n: number) => Math.round(n * 1000) / 1000

/**
 * The glide as every figure reads it off: where the crest is along the frame,
 * which way it's heading, and how fast — nothing at the turns, most in the middle.
 * The wake is the length a figure trails behind the crest; it draws out as the
 * glide speeds up and gathers in at each turn.
 */
type Glide = {
  forward: boolean
  heading: 1 | -1
  crest: number
  speed: number
  wake: number
  /** Where the crest was `back` phase-lengths ago, following the glide round its turns. */
  trail: (back: number) => number
}

/**
 * How lit a point `ahead` of the crest is (negative is behind): a tight front, and
 * behind it a wake that melts into the shape of the front as the glide slows. At a
 * turn the two sides match, so the heading can flip without anything jumping — the
 * same seam at the end of a rep, which is what lets every figure loop.
 */
const lit = (ahead: number, { wake, speed }: Glide) =>
  ahead >= 0 ? front(ahead) : front(ahead) + (Math.exp(ahead / wake) - front(ahead)) * speed

/** The crest's place at a point in the glide, with the phase clock run backwards past a turn. */
function positionAt(phaseIndex: number, progress: number): number {
  let phase = phaseIndex
  let t = progress
  while (t < 0) {
    t += 1
    phase -= 1
  }
  const forward = ((phase % 2) + 2) % 2 === 0
  const travel = easeInOutSine(t)
  return RUN_START + (forward ? travel : 1 - travel) * RUN_SPAN
}

/**
 * The sciatic floss's guide: a figure that glides forward and back across the
 * frame, the way the nerve glides through its sheath, and says which way it's
 * going by its shape alone — a sharp edge in front and a long, fading wake behind,
 * so the heading reads from the lean. No track, no arrow, no word. Each phase is
 * sine-eased, so the end of one is where the next begins, and the wake gathers in
 * at each turn so the reversal is visible before it happens. Reduced motion parks
 * the crest at the end it's heading to with a middling wake, so it still leans.
 *
 * Four figures draw the same glide; the rotation picks one per set (see
 * lib/rhythmVariant), and the kebab can hide one like any other shape:
 * - 'beads': a strand of beads with a swell running through it — the beads under
 *   the crest rise, grow and light, and a soft glow rides along like the halo's core.
 * - 'thread': a thread drawn through a sheath, with a knot for the crest — taut
 *   ahead of the knot, and behind it the slack it drags, waving in its wake.
 * - 'wake': a mote shedding rings as it goes, each one spreading and fading behind
 *   it, so where it has been is written on the water and where it's going is clear.
 * - 'grass': a field of stalks combed by a gust — the stalks under it brighten and
 *   bend the way it's going, and the ones it has passed are still coming back up.
 * Three more are plain geometry, for the sets where the organic ones have worn in:
 * - 'slats': a row of bars that rise and light under the crest and shear as one
 *   into the heading, a histogram leaning the way it's read.
 * - 'tiles': a grid of squares; the column under the crest turns to diamonds and
 *   the ones behind are still turning back, with the whole grid skewed into the lean.
 * - 'capsule': one pill with two echoes behind it; it stretches with speed and
 *   squares off its trailing end, so at speed it's a slug and at the turn a circle.
 * Four more run up the phone instead of across it — forward climbs toward the top
 * of the screen and back sinks toward the bottom — so they read differently from
 * the rest at a glance before any of them has moved:
 * - 'kite': a diamond with a ribbon tail of bows, the tail trailing behind it and
 *   swaying, and its nose drawn out into the heading with speed.
 * - 'helix': a mote climbing a spiral, nearer and farther as it goes round, with a
 *   string of fading motes behind it tracing the turns it has made.
 * - 'fill': a tube that fills toward the top and drains toward the bottom; the
 *   surface domes when it's rising and sags when it's draining, flat at the turns.
 * - 'scan': a line sweeping the frame with a trail of light behind it, over rungs
 *   that brighten as it passes and dim again along its wake.
 */
export function FlossGuide({ phaseIndex, progress, variant = 'beads' }: {
  phaseIndex: number
  progress: number
  seconds: number
  /** One of the floss figures; anything else draws the beads. */
  variant?: RhythmVariant
}) {
  const reduced = usePrefersReducedMotion()
  const forward = phaseIndex % 2 === 0
  const heading = forward ? 1 : -1
  const travel = reduced ? 1 : easeInOutSine(progress)
  const position = forward ? travel : 1 - travel
  // The speed of the glide: nothing at the turns, most in the middle. Sine-squared
  // rather than sine so it reaches each turn flat, and the lean comes back in as
  // smoothly as it went out.
  const speed = reduced ? 0.6 : Math.sin(Math.PI * progress) ** 2
  const crest = RUN_START + position * RUN_SPAN
  const glide: Glide = {
    forward,
    heading,
    crest,
    speed,
    wake: WAKE_MIN + speed * WAKE_GAIN,
    // Parked, the trail is laid out behind the crest at a steady spacing instead.
    trail: (back) => (reduced ? crest - heading * back * RUN_SPAN : positionAt(phaseIndex, progress - back)),
  }
  const figure: FlossVariant = isFlossVariant(variant) ? variant : 'beads'
  const vertical = VERTICAL.has(figure)

  return (
    <div
      className="absolute inset-0"
      role="img"
      aria-label={forward ? 'forward' : 'back'}
      data-direction={forward ? 'forward' : 'back'}
      data-variant={figure}
      data-axis={vertical ? 'vertical' : 'horizontal'}
    >
      {vertical ? (
        <Glow x={50} y={up(crest)} />
      ) : (
        <Glow x={crest} y={figure === 'beads' ? 46 : figure === 'grass' ? 52 : 50} />
      )}
      {figure === 'kite' ? (
        <Kite glide={glide} />
      ) : figure === 'helix' ? (
        <Helix glide={glide} />
      ) : figure === 'fill' ? (
        <Fill glide={glide} />
      ) : figure === 'scan' ? (
        <Scan glide={glide} />
      ) : figure === 'thread' ? (
        <Thread glide={glide} />
      ) : figure === 'wake' ? (
        <Wake glide={glide} />
      ) : figure === 'grass' ? (
        <Grass glide={glide} />
      ) : figure === 'slats' ? (
        <Slats glide={glide} />
      ) : figure === 'tiles' ? (
        <Tiles glide={glide} />
      ) : figure === 'capsule' ? (
        <Capsule glide={glide} />
      ) : (
        <Beads glide={glide} />
      )}
    </div>
  )
}

/** A soft glow that travels with the crest, like the halo's core. */
function Glow({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="absolute h-[40%] w-[40%] rounded-full bg-current/40 blur-2xl"
      style={{ left: `${r(x)}%`, top: `${r(y)}%`, transform: 'translate(-50%, -50%)' }}
    />
  )
}

/** A gradient id with the punctuation stripped, so it's safe inside a url() wherever React writes it. */
const useGradientId = () => `floss-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

/** Beads strung evenly across the frame, a little past either end of the run. */
const BEADS = Array.from({ length: 13 }, (_, k) => 6 + k * 7.333)
/** How far the swell lifts the strand at its crest, in % of the frame. */
const LIFT = 16

function Beads({ glide }: { glide: Glide }) {
  return (
    <>
      {BEADS.map((x, k) => {
        // Distance along the way of travel: positive is ahead of the crest.
        const l = lit((x - glide.crest) * glide.heading, glide)
        return (
          <div
            key={k}
            className="absolute h-[4.5%] w-[4.5%] rounded-full bg-current"
            style={{
              left: `${x}%`,
              top: `${54 - l * LIFT}%`,
              opacity: DIM + l * (BRIGHT - DIM),
              transform: `translate(-50%, -50%) scale(${0.7 + l * 1.3})`,
            }}
          />
        )
      })}
    </>
  )
}

/** How far the slack lifts the thread off its line at the knot, in % of the frame. */
const SLACK = 5
/** The length of one wave in the slack. */
const SLACK_WAVE = 14
/** How far ahead of the knot the thread is lit, and how far behind at a standstill. */
const KNOT_LIGHT = FRONT * 1.5

function Thread({ glide }: { glide: Glide }) {
  const { crest, heading, speed, wake } = glide
  const id = useGradientId()
  // Taut ahead of the knot; behind it, the slack the knot drags waves and dies away.
  const y = (x: number) => {
    const ahead = (x - crest) * heading
    if (ahead >= 0) return 50
    return 50 + speed * SLACK * Math.exp(ahead / wake) * Math.sin((2 * Math.PI * ahead) / SLACK_WAVE)
  }
  const points: string[] = []
  for (let x = 0; x <= 100; x += 0.5) points.push(`${x} ${r(y(x))}`)
  const d = `M ${points.join(' L ')}`
  // The light on the thread, drawn left to right whichever way the knot heads:
  // brightest at the knot, dying out ahead within the front and behind along the
  // wake. At a standstill the two reaches match, so the turn changes nothing.
  const behind = KNOT_LIGHT + speed * WAKE_GAIN * 3
  const left = heading > 0 ? behind : KNOT_LIGHT
  const right = heading > 0 ? KNOT_LIGHT : behind
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={r(crest - left)} x2={r(crest + right)} y1="0" y2="0">
          <stop offset="0" stopColor="currentColor" stopOpacity={DIM} />
          <stop offset={r(left / (left + right))} stopColor="currentColor" stopOpacity={BRIGHT} />
          <stop offset="1" stopColor="currentColor" stopOpacity={DIM} />
        </linearGradient>
      </defs>
      <rect x="36" y="42" width="28" height="16" rx="8" fill="none" stroke="currentColor" strokeOpacity={DIM} strokeWidth="0.8" />
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx={r(crest)} cy="50" r={r(2.6 + speed * 1.2)} fill="currentColor" opacity={CREST} />
    </svg>
  )
}

/** Rings shed behind the mote, so many phase-lengths apart. */
const RING_COUNT = 6
const RING_SPACING = 0.085

function Wake({ glide }: { glide: Glide }) {
  const { crest, speed, trail } = glide
  return (
    <>
      {Array.from({ length: RING_COUNT }, (_, k) => {
        const age = (k + 1) * RING_SPACING
        const fade = 1 - age / ((RING_COUNT + 1) * RING_SPACING)
        const size = 6 + age * 70
        return (
          <div
            key={k}
            className="absolute rounded-full border border-current"
            style={{
              left: `${r(trail(age))}%`,
              top: '50%',
              width: `${r(size)}%`,
              height: `${r(size)}%`,
              opacity: r(DIM + fade * (BRIGHT - DIM)),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )
      })}
      <div
        className="absolute h-[6%] w-[6%] rounded-full bg-current"
        style={{
          left: `${r(crest)}%`,
          top: '50%',
          opacity: CREST,
          transform: `translate(-50%, -50%) scale(${r(1 + speed * 0.5)})`,
        }}
      />
    </>
  )
}

/** Stalks planted evenly across the frame, a little past either end of the run. */
const STALKS = Array.from({ length: 17 }, (_, k) => 6 + k * 5.5)
/** How far the gust bends a stalk at full speed, in degrees. */
const BEND = 38

function Grass({ glide }: { glide: Glide }) {
  const { crest, heading, speed, wake } = glide
  return (
    <>
      {STALKS.map((x, k) => {
        const ahead = (x - crest) * heading
        const l = lit(ahead, glide)
        // The gust bends what's under it the way it's going, and the stalks it has
        // passed are still coming back up; the ones ahead of it stand straight.
        const bend = heading * speed * BEND * (ahead >= 0 ? front(ahead) : Math.exp(ahead / wake))
        return (
          <div
            key={k}
            className="absolute w-[1.6%] origin-bottom rounded-full bg-current"
            style={{
              left: `${x}%`,
              bottom: '36%',
              height: `${r(16 + l * 14)}%`,
              opacity: r(DIM + l * (BRIGHT - DIM)),
              transform: `translateX(-50%) rotate(${r(bend)}deg)`,
            }}
          />
        )
      })}
    </>
  )
}

/** Slats set evenly across the frame, a little past either end of the run. */
const SLATS = Array.from({ length: 15 }, (_, k) => 8 + k * 6)
/** How far the row shears into the heading at full speed, in degrees. */
const SHEAR = 22

function Slats({ glide }: { glide: Glide }) {
  const { crest, heading, speed } = glide
  // CSS skewX leans the top of a bar the other way from its sign, so a forward
  // lean is a negative skew. The whole row shears as one; the bump travels.
  const shear = -heading * speed * SHEAR
  return (
    <>
      {SLATS.map((x, k) => {
        const l = lit((x - crest) * heading, glide)
        const height = 10 + l * 30
        return (
          <div
            key={k}
            className="absolute w-[2.6%] rounded-[1px] bg-current"
            style={{
              left: `${x}%`,
              top: `${r(50 - height / 2)}%`,
              height: `${r(height)}%`,
              opacity: r(DIM + l * (BRIGHT - DIM)),
              transform: `translateX(-50%) skewX(${r(shear)}deg)`,
            }}
          />
        )
      })}
    </>
  )
}

/** The grid: columns a little past either end of the run, rows about the midline. */
const TILE_COLUMNS = Array.from({ length: 9 }, (_, c) => 10 + c * 10)
const TILE_ROWS = Array.from({ length: 5 }, (_, row) => 30 + row * 10)
/** How far the grid skews into the heading at full speed, in degrees. */
const TILT = 14

function Tiles({ glide }: { glide: Glide }) {
  const { crest, heading, speed } = glide
  return (
    <div className="absolute inset-0" style={{ transform: `skewX(${r(-heading * speed * TILT)}deg)` }}>
      {TILE_COLUMNS.map((x) => {
        // A column turns toward the diamond as the crest reaches it and turns back
        // along the wake. The turn itself is unsigned: the lean is all in the skew.
        const l = lit((x - crest) * heading, glide)
        return TILE_ROWS.map((y, row) => (
          <div
            key={`${x}:${row}`}
            className="absolute h-[5%] w-[5%] rounded-[12%] bg-current"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              opacity: r(DIM + l * (BRIGHT - DIM)),
              transform: `translate(-50%, -50%) rotate(${r(l * 45)}deg) scale(${r(0.8 + l * 0.5)})`,
            }}
          />
        ))
      })}
    </div>
  )
}

/** The capsule's height, its width at a standstill, and the extra at full speed. */
const CAPSULE_HEIGHT = 18
const CAPSULE_WIDTH = 18
const CAPSULE_STRETCH = 22
/** Echoes behind the capsule, so many phase-lengths back. */
const ECHOES = [0.07, 0.14]

function Capsule({ glide }: { glide: Glide }) {
  const { crest, heading, speed, trail } = glide
  const width = CAPSULE_WIDTH + speed * CAPSULE_STRETCH
  // Horizontal radii in percent of the width; fully round is half the height.
  const round = (CAPSULE_HEIGHT / 2 / width) * 100
  // The leading end stays round and the trailing end squares off with speed. At
  // a standstill both ends are round, so the turn changes nothing.
  const tail = round * (1 - speed * 0.85)
  const [left, right] = heading > 0 ? [tail, round] : [round, tail]
  const radius = `${r(left)}% ${r(right)}% ${r(right)}% ${r(left)}% / 50% 50% 50% 50%`
  return (
    <>
      {ECHOES.map((back, k) => (
        <div
          key={k}
          className="absolute rounded-full bg-current"
          style={{
            left: `${r(trail(back))}%`,
            top: '50%',
            width: `${r(CAPSULE_WIDTH * (0.8 - k * 0.2))}%`,
            height: `${r(CAPSULE_HEIGHT * (0.8 - k * 0.2))}%`,
            opacity: r(DIM + (BRIGHT - DIM) * (0.5 - k * 0.2)),
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      <div
        className="absolute bg-current"
        style={{
          left: `${r(crest)}%`,
          top: '50%',
          width: `${r(width)}%`,
          height: `${CAPSULE_HEIGHT}%`,
          borderRadius: radius,
          opacity: CREST,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </>
  )
}

/** The kite's half-height and half-width at a standstill, and the nose it grows with speed. */
const KITE_HALF_HEIGHT = 9
const KITE_HALF_WIDTH = 6
const KITE_NOSE = 6
/** The tail: how far back it reaches in phase-lengths, how far it sways, the length of a sway, and where its bows sit. */
const TAIL_REACH = 0.3
const TAIL_SWAY = 5
const TAIL_WAVE = 18
const BOWS = [0.08, 0.16, 0.24]

function Kite({ glide }: { glide: Glide }) {
  const { crest, heading, speed, trail } = glide
  const cy = up(crest)
  // The tail follows the glide round its turns, swaying side to side as a wave
  // fixed in the frame: where the kite has been it draws, and after a turn it
  // folds back over the way the kite is now going, which is how the turn reads.
  const sway = (along: number) => 50 + TAIL_SWAY * Math.sin((2 * Math.PI * along) / TAIL_WAVE)
  const at = (back: number) => {
    const along = trail(back)
    return { x: sway(along), y: up(along) }
  }
  const points: string[] = []
  for (let back = 0; back <= TAIL_REACH + 1e-9; back += 0.01) {
    const p = at(back)
    points.push(`${r(p.x)} ${r(p.y)}`)
  }
  // The nose reaches into the heading with speed; the trailing tip stays put. At a
  // standstill the diamond is even, so the turn changes nothing. The points are
  // written top, right, bottom, left whichever end is the nose, so the markup is
  // the same across the turn too.
  const nose = cy - heading * (KITE_HALF_HEIGHT + speed * KITE_NOSE)
  const tip = cy + heading * KITE_HALF_HEIGHT
  const [top, bottom] = heading > 0 ? [nose, tip] : [tip, nose]
  const body = `50 ${r(top)} ${50 + KITE_HALF_WIDTH} ${r(cy)} 50 ${r(bottom)} ${50 - KITE_HALF_WIDTH} ${r(cy)}`
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path
        d={`M ${points.join(' L ')}`}
        fill="none"
        stroke="currentColor"
        strokeOpacity={DIM + (BRIGHT - DIM) * 0.5}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      {BOWS.map((back, k) => {
        const p = at(back)
        const fade = 1 - k / BOWS.length
        return (
          <rect
            key={k}
            x={r(p.x - 2)}
            y={r(p.y - 2)}
            width="4"
            height="4"
            rx="0.6"
            fill="currentColor"
            opacity={r(DIM + (BRIGHT - DIM) * fade)}
            transform={`rotate(45 ${r(p.x)} ${r(p.y)})`}
          />
        )
      })}
      <polygon points={body} fill="currentColor" opacity={CREST} />
    </svg>
  )
}

/**
 * The helix: its radius across the frame, the rise of one turn, and the motes
 * trailing the crest, so many phase-lengths apart. The pitch is long and the trail
 * short because the spiral turns a hair of travel along the run into a few hairs
 * across it; any more and the trail would be seen to shift at the turn.
 */
const HELIX_RADIUS = 22
const HELIX_PITCH = 46
const HELIX_TRAIL = 10
const HELIX_SPACING = 0.02

function Helix({ glide }: { glide: Glide }) {
  const { crest, speed, trail } = glide
  // Round the helix: across the frame by the sine, and nearer or farther by the
  // cosine, which the size carries so the spiral reads in depth.
  const place = (along: number) => {
    const angle = (2 * Math.PI * along) / HELIX_PITCH
    return { x: 50 + HELIX_RADIUS * Math.sin(angle), y: up(along), depth: (1 + Math.cos(angle)) / 2 }
  }
  const head = place(crest)
  return (
    <>
      {Array.from({ length: HELIX_TRAIL }, (_, k) => {
        const p = place(trail((k + 1) * HELIX_SPACING))
        const fade = 1 - (k + 1) / (HELIX_TRAIL + 1)
        const size = (2 + fade * 2.5) * (0.6 + 0.4 * p.depth)
        return (
          <div
            key={k}
            className="absolute rounded-full bg-current"
            style={{
              left: `${r(p.x)}%`,
              top: `${r(p.y)}%`,
              width: `${r(size)}%`,
              height: `${r(size)}%`,
              opacity: r(DIM + fade * (BRIGHT - DIM)),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )
      })}
      <div
        className="absolute h-[6%] w-[6%] rounded-full bg-current"
        style={{
          left: `${r(head.x)}%`,
          top: `${r(head.y)}%`,
          opacity: CREST,
          transform: `translate(-50%, -50%) scale(${r((0.8 + 0.4 * head.depth) * (1 + speed * 0.3))})`,
        }}
      />
    </>
  )
}

/** The tube's walls, top and floor, and how far the surface domes into the heading at full speed. */
const TUBE_LEFT = 34
const TUBE_RIGHT = 66
const TUBE_TOP = 5
const TUBE_FLOOR = 95
const DOME = 7
/** How far below the surface the column's light fades to the floor's dimness. */
const FILL_FADE = 45

function Fill({ glide }: { glide: Glide }) {
  const { crest, heading, speed } = glide
  const id = useGradientId()
  const level = up(crest)
  // The surface bulges the way the column is going: a dome when it's rising, a
  // sag when it's draining, flat at the turns. A quadratic's control point sits
  // twice as far out as the curve itself reaches.
  const control = r(level - 2 * heading * speed * DOME)
  const surface = `M ${TUBE_LEFT} ${r(level)} Q 50 ${control} ${TUBE_RIGHT} ${r(level)}`
  const column = `${surface} L ${TUBE_RIGHT} ${TUBE_FLOOR} L ${TUBE_LEFT} ${TUBE_FLOOR} Z`
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={r(level)} y2={r(level + FILL_FADE)}>
          <stop offset="0" stopColor="currentColor" stopOpacity={BRIGHT} />
          <stop offset="1" stopColor="currentColor" stopOpacity={DIM} />
        </linearGradient>
      </defs>
      <rect
        x={TUBE_LEFT}
        y={TUBE_TOP}
        width={TUBE_RIGHT - TUBE_LEFT}
        height={TUBE_FLOOR - TUBE_TOP}
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeOpacity={DIM}
        strokeWidth="0.8"
      />
      <path d={column} fill={`url(#${id})`} />
      <path d={surface} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity={CREST} />
    </svg>
  )
}

/** Rungs set evenly up the frame, a little past either end of the run. */
const RUNGS = Array.from({ length: 15 }, (_, k) => 8 + k * 6)
/** The sweep's reach across the frame, and how far its trail of light stretches behind it at full speed. */
const SWEEP_LEFT = 8
const SWEEP_RIGHT = 92
const SWEEP_TRAIL = 30

function Scan({ glide }: { glide: Glide }) {
  const { crest, heading, speed } = glide
  const id = useGradientId()
  const y = up(crest)
  // The trail: light from the line back along the way it came, as long as the
  // glide is fast and gone at the turns. Behind a rising line is below it.
  const reach = speed * SWEEP_TRAIL
  const behind = y + heading * reach
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={r(y)} y2={r(behind)}>
          <stop offset="0" stopColor="currentColor" stopOpacity={0.35} />
          <stop offset="1" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      {RUNGS.map((ry) => {
        const l = lit((up(ry) - crest) * heading, glide)
        return (
          <line
            key={ry}
            x1={SWEEP_LEFT}
            x2={SWEEP_RIGHT}
            y1={ry}
            y2={ry}
            stroke="currentColor"
            strokeOpacity={r(DIM + l * (BRIGHT - DIM))}
            strokeWidth={r(0.5 + l * 0.9)}
            strokeLinecap="round"
          />
        )
      })}
      <rect
        x={SWEEP_LEFT}
        y={r(Math.min(y, behind))}
        width={SWEEP_RIGHT - SWEEP_LEFT}
        height={r(reach)}
        fill={`url(#${id})`}
      />
      <line
        x1={SWEEP_LEFT}
        x2={SWEEP_RIGHT}
        y1={r(y)}
        y2={r(y)}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={CREST}
      />
    </svg>
  )
}
