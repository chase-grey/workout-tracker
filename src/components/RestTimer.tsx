import { useEffect, useRef, useState } from 'react'

const RING_R = 112
const RING_C = 2 * Math.PI * RING_R

// Calming shapes made for rest — slow, self-contained loops that read as
// "wind down," distinct from the effortful rhythm shapes used during a set.
const VARIANTS = ['orb', 'tide', 'ripple', 'glow'] as const
type Variant = (typeof VARIANTS)[number]

// Remembered across mounts (each rest remounts the timer) so we never show the
// same shape twice in a row — rest reliably rotates through all four.
let lastVariant: Variant | null = null
function pickVariant(): Variant {
  const pool = VARIANTS.filter((v) => v !== lastVariant)
  lastVariant = pool[Math.floor(Math.random() * pool.length)]
  return lastVariant
}

/** The calm pace cue behind the drain ring, in one of a few restful shapes. */
function RestShape({ variant }: { variant: Variant }) {
  // Bright green — the resting animation is meant to call attention, matching the
  // rhythm guide. Dark green (accent) is reserved for solid UI like the buttons.
  const fill = 'bg-accent-bright/15'
  const ring = 'ring-accent-bright/30'
  const border = 'border-accent-bright/30'
  switch (variant) {
    case 'tide':
      return (
        <div className={`absolute h-[62%] w-[62%] overflow-hidden rounded-full ring-1 ${ring}`}>
          <div className={`rest-tide absolute bottom-0 left-0 w-full ${fill}`} />
        </div>
      )
    case 'ripple':
      // Rings that expand outward and fade like a still pond — staggered so a
      // new ripple sets off before the last one clears.
      return (
        <>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`rest-ripple absolute h-[46%] w-[46%] rounded-full border ${border}`}
              style={{ animationDelay: `${i * 1.5}s` }}
            />
          ))}
        </>
      )
    case 'glow':
      // A soft, blurred halo that swells and dims — the most passive of the set.
      return <div className={`rest-glow absolute h-[64%] w-[64%] rounded-full blur-2xl ${fill}`} />
    case 'orb':
    default:
      return <div className={`rest-breathe absolute h-[62%] w-[62%] rounded-full ring-1 ${fill} ${ring}`} />
  }
}

/**
 * Full-screen rest countdown. Wall-clock based: it tracks a target end time and
 * derives the remaining seconds from `Date.now()`, so it stays accurate even
 * when the browser throttles/pauses timers in the background — switch apps and
 * come back and it reflects the real elapsed time. Counts into overtime until
 * dismissed. No system notifications by design.
 *
 * A large ring drains over the rest period with a slow breathing orb pulsing
 * behind it — a calm, glanceable cue for how much rest is left — and the numeric
 * countdown sits at the bottom of the screen. Optional `upNext` / `timeLeftLabel`
 * (rendered verbatim, so the caller phrases it — "~5 min left in workout") give the
 * resting user a heads-up on what's coming and how much of the session is left,
 * and `onAddSet` surfaces an "Add another set" action during an exercise's final
 * rest.
 */
export function RestTimer({
  seconds,
  endsAt,
  onClose,
  upNext,
  timeLeftLabel,
  onAddSet,
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
  timeLeftLabel?: string | null
  onAddSet?: () => void
}) {
  const endRef = useRef<number>(endsAt ?? Date.now() + seconds * 1000)
  const [remaining, setRemaining] = useState(() => Math.round((endRef.current - Date.now()) / 1000))
  const [variant] = useState<Variant>(pickVariant)
  const buzzed = useRef(false)

  useEffect(() => {
    const tick = () => {
      const r = Math.round((endRef.current - Date.now()) / 1000)
      setRemaining(r)
      if (r <= 0 && !buzzed.current) {
        buzzed.current = true
        navigator.vibrate?.(400)
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

  const over = remaining < 0
  const abs = Math.abs(remaining)
  const label = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  // Fraction of rest still remaining (drains the ring from full to empty).
  const fraction = seconds > 0 ? Math.max(0, Math.min(1, remaining / seconds)) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center bg-black px-6"
      onClick={onClose}
    >
      {upNext && (
        <div className="pt-[calc(1.5rem+env(safe-area-inset-top))] text-center">
          <p className="text-base font-semibold text-neutral-200">{upNext}</p>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
          {/* Breathing shape — a calm pace cue that varies from rest to rest. */}
          <RestShape variant={variant} />

          {/* Rest progress ring: full at the start, empty when rest is up. */}
          <svg viewBox="0 0 240 240" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
            <circle cx="120" cy="120" r={RING_R} fill="none" strokeWidth="4" className="stroke-surface-2" />
            <circle
              cx="120"
              cy="120"
              r={RING_R}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              className={over ? 'stroke-accent-2' : 'stroke-accent-bright'}
              style={{
                strokeDasharray: RING_C,
                strokeDashoffset: RING_C * (1 - (over ? 1 : fraction)),
                transition: 'stroke-dashoffset 250ms linear',
              }}
            />
          </svg>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {onAddSet && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddSet()
            }}
            className="min-h-[44px] rounded-2xl border border-border bg-surface px-5 font-semibold text-neutral-200 active:opacity-80"
          >
            Add another set
          </button>
        )}
        <div className={`font-mono text-7xl font-bold tabular-nums ${over ? 'text-accent-2' : 'text-white'}`}>
          {label}
        </div>
        {timeLeftLabel && (
          <p className="text-sm font-medium text-neutral-400">{timeLeftLabel}</p>
        )}
      </div>
    </div>
  )
}
