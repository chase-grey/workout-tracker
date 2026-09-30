import { MdKeyboardArrowLeft, MdKeyboardArrowRight } from 'react-icons/md'
import { usePrefersReducedMotion } from '../lib/useReducedMotion'

/** Travel for the entire phase, reversing continuously at each three-second cue. */
export function FlossGuide({ phaseIndex, progress, seconds }: {
  phaseIndex: number
  progress: number
  seconds: number
}) {
  const reduced = usePrefersReducedMotion()
  const forward = phaseIndex % 2 === 0
  const position = reduced ? (forward ? 1 : 0) : forward ? progress : 1 - progress
  const Arrow = forward ? MdKeyboardArrowRight : MdKeyboardArrowLeft

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
      <p role="status" className="text-3xl font-bold">
        {forward ? 'move forward' : 'move back'}
      </p>
      <div className="relative h-20 w-[85%]" aria-hidden>
        <div className="absolute inset-x-[10%] top-1/2 h-1 -translate-y-1/2 rounded-full bg-current/20" />
        <div
          className="absolute top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-current/20 ring-2 ring-current"
          style={{ left: `${10 + position * 80}%` }}
        >
          <Arrow className="text-5xl" />
        </div>
      </div>
      <div className="flex w-[85%] justify-between text-sm" aria-hidden>
        <span>back</span><span>forward</span>
      </div>
      <p className="text-2xl tabular-nums" aria-hidden>{Math.max(1, Math.ceil(seconds * (1 - progress)))}s</p>
    </div>
  )
}
