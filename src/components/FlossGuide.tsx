import { useId } from 'react'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'
import { isFlossVariant, type FlossVariant, type RhythmVariant } from '../lib/rhythmVariant'

/** The glide runs between these two points of the frame's height; forward is up. */
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
 * The sciatic floss's guide: a figure that glides forward and back, the way the
 * nerve glides through its sheath. Forward is away from you — up the phone — and
 * back is toward you, never side to side: the leg goes out in front, and so does
 * the figure. It says which way it's going by its shape alone — a sharp edge in
 * front and a long, fading wake behind, so the heading reads from the lean. No
 * track, no arrow, no word. Each phase is sine-eased, so the end of one is where
 * the next begins, and the wake gathers in at each turn so the reversal is visible
 * before it happens. Reduced motion parks the crest at the end it's heading to
 * with a middling wake, so it still leans.
 *
 * The frame is whatever the session has under its header — on a phone, much taller
 * than it is wide — so the run and everything laid along or across it is in shares
 * of the frame, and whatever has to keep its own shape (a bead, a mote, the capsule)
 * is sized in `cqmin`, a hundredth of the frame's short side.
 *
 * Six figures draw the same glide; the rotation picks one per set (see
 * lib/rhythmVariant), and the kebab can hide one like any other shape:
 * - 'beads': a strand of beads with a swell running up it — the beads under the
 *   crest bow out, grow and light, and a soft glow rides along like the halo's core.
 * - 'wake': a mote shedding rings as it goes, each one spreading and fading behind
 *   it, so where it has been is written on the water and where it's going is clear.
 * - 'capsule': one pill with two echoes behind it; it stretches with speed and
 *   squares off its trailing end, so at speed it's a slug and at the turn a circle.
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

  return (
    <div
      className="absolute inset-0"
      role="img"
      aria-label={forward ? 'forward' : 'back'}
      data-direction={forward ? 'forward' : 'back'}
      data-variant={figure}
    >
      <Glow x={50} y={up(crest)} />
      {figure === 'helix' ? (
        <Helix glide={glide} />
      ) : figure === 'fill' ? (
        <Fill glide={glide} />
      ) : figure === 'scan' ? (
        <Scan glide={glide} />
      ) : figure === 'wake' ? (
        <Wake glide={glide} />
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
      className="absolute h-[46cqmin] w-[46cqmin] rounded-full bg-current/40 blur-2xl"
      style={{ left: `${r(x)}%`, top: `${r(y)}%`, transform: 'translate(-50%, -50%)' }}
    />
  )
}

/**
 * A stroke for a drawing that is stretched to the frame: so many hundredths of the
 * frame's short side wide, and kept out of the stretch, so a line is the same
 * weight whichever way it runs and whatever shape the frame is.
 */
const hairline = (width: number) =>
  ({ vectorEffect: 'non-scaling-stroke', style: { strokeWidth: `${width}cqmin` } }) as const

/** A gradient id with the punctuation stripped, so it's safe inside a url() wherever React writes it. */
const useGradientId = () => `floss-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

/** Beads strung evenly up the frame, a little past either end of the run. */
const BEADS = Array.from({ length: 13 }, (_, k) => 6 + k * 7.333)
/** Where the strand hangs, and how far the swell bows it out at its crest, in % of the frame. */
const STRAND = 40
const BOW = 20

function Beads({ glide }: { glide: Glide }) {
  return (
    <>
      {BEADS.map((along, k) => {
        // Distance along the way of travel: positive is ahead of the crest.
        const l = lit((along - glide.crest) * glide.heading, glide)
        return (
          <div
            key={k}
            className="absolute h-[7cqmin] w-[7cqmin] rounded-full bg-current"
            style={{
              left: `${r(STRAND + l * BOW)}%`,
              top: `${r(up(along))}%`,
              opacity: DIM + l * (BRIGHT - DIM),
              transform: `translate(-50%, -50%) scale(${0.7 + l * 1.3})`,
            }}
          />
        )
      })}
    </>
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
        const size = 7 + age * 75
        return (
          <div
            key={k}
            className="absolute rounded-full border-2 border-current"
            style={{
              left: '50%',
              top: `${r(up(trail(age)))}%`,
              width: `${r(size)}cqmin`,
              height: `${r(size)}cqmin`,
              opacity: r(DIM + fade * (BRIGHT - DIM)),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )
      })}
      <div
        className="absolute h-[8cqmin] w-[8cqmin] rounded-full bg-current"
        style={{
          left: '50%',
          top: `${r(up(crest))}%`,
          opacity: CREST,
          transform: `translate(-50%, -50%) scale(${r(1 + speed * 0.5)})`,
        }}
      />
    </>
  )
}

/**
 * The capsule's width, its height at a standstill, and the extra at full speed —
 * all in hundredths of the frame's short side, so the ends stay round in a frame
 * that isn't square.
 */
const CAPSULE_WIDTH = 26
const CAPSULE_HEIGHT = 26
const CAPSULE_STRETCH = 24
/** Echoes behind the capsule, so many phase-lengths back. */
const ECHOES = [0.07, 0.14]

function Capsule({ glide }: { glide: Glide }) {
  const { crest, heading, speed, trail } = glide
  const height = CAPSULE_HEIGHT + speed * CAPSULE_STRETCH
  // Vertical radii in percent of the height; fully round is half the width.
  const round = (CAPSULE_WIDTH / 2 / height) * 100
  // The leading end stays round and the trailing end squares off with speed. At
  // a standstill both ends are round, so the turn changes nothing.
  const tail = round * (1 - speed * 0.85)
  const [top, bottom] = heading > 0 ? [round, tail] : [tail, round]
  const radius = `50% 50% 50% 50% / ${r(top)}% ${r(top)}% ${r(bottom)}% ${r(bottom)}%`
  return (
    <>
      {ECHOES.map((back, k) => (
        <div
          key={k}
          className="absolute rounded-full bg-current"
          style={{
            left: '50%',
            top: `${r(up(trail(back)))}%`,
            width: `${r(CAPSULE_WIDTH * (0.8 - k * 0.2))}cqmin`,
            height: `${r(CAPSULE_HEIGHT * (0.8 - k * 0.2))}cqmin`,
            opacity: r(DIM + (BRIGHT - DIM) * (0.5 - k * 0.2)),
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      <div
        className="absolute bg-current"
        style={{
          left: '50%',
          top: `${r(up(crest))}%`,
          width: `${CAPSULE_WIDTH}cqmin`,
          height: `${r(height)}cqmin`,
          borderRadius: radius,
          opacity: CREST,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </>
  )
}

/**
 * The helix: its radius across the frame, the rise of one turn, and the motes
 * trailing the crest, so many phase-lengths apart. The pitch is long and the trail
 * short because the spiral turns a hair of travel along the run into a few hairs
 * across it; any more and the trail would be seen to shift at the turn.
 */
const HELIX_RADIUS = 30
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
        const size = (3 + fade * 3.5) * (0.6 + 0.4 * p.depth)
        return (
          <div
            key={k}
            className="absolute rounded-full bg-current"
            style={{
              left: `${r(p.x)}%`,
              top: `${r(p.y)}%`,
              width: `${r(size)}cqmin`,
              height: `${r(size)}cqmin`,
              opacity: r(DIM + fade * (BRIGHT - DIM)),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )
      })}
      <div
        className="absolute h-[9cqmin] w-[9cqmin] rounded-full bg-current"
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
const TUBE_LEFT = 22
const TUBE_RIGHT = 78
const TUBE_TOP = 3
const TUBE_FLOOR = 97
const DOME = 5
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
        fill="none"
        stroke="currentColor"
        strokeOpacity={DIM}
        {...hairline(0.9)}
      />
      <path d={column} fill={`url(#${id})`} />
      <path d={surface} fill="none" stroke="currentColor" strokeLinecap="round" opacity={CREST} {...hairline(1.8)} />
    </svg>
  )
}

/** Rungs set evenly up the frame, a little past either end of the run. */
const RUNGS = Array.from({ length: 15 }, (_, k) => 8 + k * 6)
/** The sweep's reach across the frame, and how far its trail of light stretches behind it at full speed. */
const SWEEP_LEFT = 3
const SWEEP_RIGHT = 97
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
            strokeLinecap="round"
            {...hairline(r(0.7 + l * 1.3))}
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
        strokeLinecap="round"
        opacity={CREST}
        {...hairline(2.4)}
      />
    </svg>
  )
}
