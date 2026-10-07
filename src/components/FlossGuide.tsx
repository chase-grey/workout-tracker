import { MdKeyboardArrowLeft, MdKeyboardArrowRight } from 'react-icons/md'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'

/** The track runs between these two points of the frame's width; forward is right. */
const TRACK_START = 12
const TRACK_SPAN = 76
/** The same floor and ceiling the other shapes light their parts within. */
const DIM = 0.2
const BRIGHT = 0.7
/** How many times a second the chevrons sweep the way you're going. */
const SWEEPS_PER_SEC = 1.2

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const easeInOutSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2

/**
 * An orb gliding along a track between two unlike ends — a wide ring out at the
 * forward end, a small dot back at the near one — so where you're headed reads
 * from the shape alone, without a word on screen. The orb grows as it reaches
 * forward and shrinks coming back, streams a tail behind it, and lights the end
 * it's travelling to; under the track a row of chevrons sweeps the same way.
 * Each phase eases out of one turn and into the next, so the reversal is a glide
 * rather than a bounce, and the end of one phase is where the next begins.
 */
export function FlossGuide({ phaseIndex, progress, seconds }: {
  phaseIndex: number
  progress: number
  seconds: number
}) {
  const reduced = usePrefersReducedMotion()
  const forward = phaseIndex % 2 === 0
  const travel = reduced ? 1 : easeInOutSine(progress)
  const position = forward ? travel : 1 - travel
  // The speed of the glide: nothing at the turns, most in the middle.
  const speed = reduced ? 0 : Math.sin(Math.PI * progress)
  const left = TRACK_START + position * TRACK_SPAN
  const Arrow = forward ? MdKeyboardArrowRight : MdKeyboardArrowLeft
  const sweep = ((progress * seconds * SWEEPS_PER_SEC) % 1) * 4 - 0.5

  return (
    <div
      className="absolute inset-0"
      role="img"
      aria-label={forward ? 'forward' : 'back'}
      data-direction={forward ? 'forward' : 'back'}
    >
      <div
        className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-current/15"
        style={{ left: `${TRACK_START}%`, width: `${TRACK_SPAN}%` }}
      />
      <div
        className="absolute top-1/2 h-[6%] w-[6%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
        style={{ left: `${TRACK_START}%`, opacity: forward ? DIM : BRIGHT }}
      />
      <div
        className="absolute top-1/2 h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current"
        style={{ left: `${TRACK_START + TRACK_SPAN}%`, opacity: forward ? BRIGHT : DIM }}
      />
      <div
        className="absolute top-1/2 h-[3%] -translate-y-1/2 rounded-full"
        style={{
          width: `${speed * 24}%`,
          left: forward ? undefined : `${left}%`,
          right: forward ? `${100 - left}%` : undefined,
          background: `linear-gradient(to ${forward ? 'right' : 'left'}, transparent, currentColor)`,
          opacity: 0.5,
        }}
      />
      <div
        className="absolute top-1/2 h-[18%] w-[18%] rounded-full bg-current/40 ring-1 ring-current/70"
        style={{ left: `${left}%`, transform: `translate(-50%, -50%) scale(${0.75 + position * 0.45})` }}
      />
      <div
        className="absolute inset-x-0 top-[66%] flex justify-center"
        style={{ fontSize: 'min(14vw, 5rem)' }}
      >
        {[0, 1, 2].map((k) => {
          // Count along the way of travel, so the sweep runs toward where you're going.
          const step = forward ? k : 2 - k
          const lit = reduced ? 1 : clamp01(1 - Math.abs(sweep - step))
          return (
            <Arrow
              key={k}
              aria-hidden
              className="-mx-[3%] text-current"
              style={{ opacity: DIM + lit * (BRIGHT - DIM) }}
            />
          )
        })}
      </div>
    </div>
  )
}
