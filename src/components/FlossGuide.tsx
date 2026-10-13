import { usePrefersReducedMotion } from '../lib/useReducedMotion'

/** The swell runs between these two points of the frame's width; forward is right. */
const RUN_START = 12
const RUN_SPAN = 76
/** Beads strung evenly across the frame, a little past either end of the run. */
const BEADS = Array.from({ length: 13 }, (_, k) => 6 + k * 7.333)
/** The same floor and ceiling the other shapes light their parts within. */
const DIM = 0.2
const BRIGHT = 0.7
/** How far the swell lifts the strand at its crest, in % of the frame. */
const LIFT = 16
/** The wake: short at the turns, drawn out at full speed. */
const WAKE_MIN = 7
const WAKE_GAIN = 24
/** The front stays tight, so the swell leans into the way it's going. */
const FRONT = 6

const easeInOutSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2

/**
 * A strand of beads with a swell running through it, the way a nerve glides
 * through its sheath: the beads under the crest rise, swell and light up, and the
 * crest leaves a long, fading wake behind it and a sharp edge in front, so the
 * way it's heading reads from the lean of the shape alone. A soft glow travels
 * with the crest, like the halo's core. The wake draws out as the glide speeds up
 * and gathers in at each turn, where the swell stands nearly upright for a beat
 * before leaning the other way — a reversal you can see coming. Each phase is
 * sine-eased, so the end of one is where the next begins.
 */
export function FlossGuide({ phaseIndex, progress }: {
  phaseIndex: number
  progress: number
  seconds: number
}) {
  const reduced = usePrefersReducedMotion()
  const forward = phaseIndex % 2 === 0
  const travel = reduced ? 1 : easeInOutSine(progress)
  const position = forward ? travel : 1 - travel
  // The speed of the glide: nothing at the turns, most in the middle. Reduced
  // motion holds a middling wake so the parked swell still leans one way.
  const speed = reduced ? 0.6 : Math.sin(Math.PI * progress)
  const crest = RUN_START + position * RUN_SPAN
  const wake = WAKE_MIN + speed * WAKE_GAIN
  const heading = forward ? 1 : -1

  return (
    <div
      className="absolute inset-0"
      role="img"
      aria-label={forward ? 'forward' : 'back'}
      data-direction={forward ? 'forward' : 'back'}
    >
      <div
        className="absolute top-[46%] h-[40%] w-[40%] rounded-full bg-current/40 blur-2xl"
        style={{ left: `${crest}%`, transform: 'translate(-50%, -50%)' }}
      />
      {BEADS.map((x, k) => {
        // Distance along the way of travel: positive is ahead of the crest.
        const ahead = (x - crest) * heading
        const lit = ahead >= 0
          ? Math.exp(-((ahead / FRONT) ** 2))
          : Math.exp(ahead / wake)
        return (
          <div
            key={k}
            className="absolute h-[4.5%] w-[4.5%] rounded-full bg-current"
            style={{
              left: `${x}%`,
              top: `${54 - lit * LIFT}%`,
              opacity: DIM + lit * (BRIGHT - DIM),
              transform: `translate(-50%, -50%) scale(${0.7 + lit * 1.3})`,
            }}
          />
        )
      })}
    </div>
  )
}
