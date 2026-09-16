import type { TempoPhase } from '../lib/tempo'

/** Both cues use the rep clock, so they reverse together at each phase boundary. */
export function FlossGuide({
  phaseIndex,
  progress,
  phases,
  bright,
}: {
  phaseIndex: number
  progress: number
  phases: TempoPhase[]
  bright: boolean
}) {
  const forward = phaseIndex % 2 === 0
  const direction = forward ? 'forward' : 'backward'
  const eased = (1 - Math.cos(Math.PI * progress)) / 2
  const angle = (forward ? -1 : 1) * (1 - 2 * eased) * 28
  const remaining = Math.max(1, Math.ceil(phases[phaseIndex].seconds * (1 - progress)))

  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-5 text-accent-bright">
      <div className="text-center" role="status" aria-live="polite">
        <p className="text-sm font-semibold tracking-widest">toe + head</p>
        <p className="text-4xl font-bold">lean {direction}</p>
      </div>
      <div className="flex gap-4" aria-hidden="true">
        {['toe', 'head'].map((part) => (
          <div key={part} className="min-w-0 flex-1 rounded-2xl bg-surface px-2 py-3 text-center">
            <svg viewBox="0 0 120 110" className="w-full" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M25 94 H95" opacity="0.2" />
              <path d={forward ? 'M38 16 H82 M72 6 L82 16 L72 26' : 'M82 16 H38 M48 6 L38 16 L48 26'} />
              <g transform={`rotate(${angle} 60 90)`} opacity={bright ? 1 : 0.75}>
                {part === 'head' ? (
                  <>
                    <path d="M60 90 V68" />
                    <circle cx="60" cy="53" r="15" />
                    <path d="M74 50 L80 55 L74 57" />
                  </>
                ) : (
                  <path d="M60 90 V57 Q60 43 68 43 Q76 43 76 55 V78 Q76 90 60 90" />
                )}
              </g>
              <circle cx="60" cy="90" r="3" fill="currentColor" />
            </svg>
            <p className="text-sm font-semibold">{part}</p>
          </div>
        ))}
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold tabular-nums" aria-hidden="true">{remaining}s</p>
        <p className="mt-1 text-sm text-neutral-400">then lean {forward ? 'backward' : 'forward'}</p>
      </div>
    </div>
  )
}
