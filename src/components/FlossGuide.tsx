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
      <Glow x={crest} y={figure === 'beads' ? 46 : figure === 'grass' ? 52 : 50} />
      {figure === 'thread' ? (
        <Thread glide={glide} />
      ) : figure === 'wake' ? (
        <Wake glide={glide} />
      ) : figure === 'grass' ? (
        <Grass glide={glide} />
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
      style={{ left: `${r(x)}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
    />
  )
}

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
  // Punctuation stripped, so the id is safe inside a url() wherever React writes it.
  const id = `floss-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
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
