import { useEffect, useRef, useState } from 'react'
import { KebabMenu, type MenuItem } from './KebabMenu'
import { SessionProgress } from './SessionProgress'

// Calming shapes made for rest — slow, self-contained loops that read as
// "wind down," distinct from the effortful rhythm shapes used during a set.
const VARIANTS = ['orb', 'tide', 'ripple', 'glow', 'orbit', 'aurora', 'bloom'] as const
type Variant = (typeof VARIANTS)[number]

// Remembered across mounts (each rest remounts the timer) so we never show the
// same shape twice in a row — rest reliably rotates through the whole set.
let lastVariant: Variant | null = null
function pickVariant(): Variant {
  const pool = VARIANTS.filter((v) => v !== lastVariant)
  lastVariant = pool[Math.floor(Math.random() * pool.length)]
  return lastVariant
}

/** The rest animation itself, in one of a few restful shapes. */
function RestShape({ variant }: { variant: Variant }) {
  // Bright green — the resting animation is meant to call attention, matching the
  // rhythm guide. Dark green (accent) is reserved for solid UI like the buttons.
  const fill = 'bg-accent-bright/15'
  const ring = 'ring-accent-bright/30'
  const border = 'border-accent-bright/30'
  // Small elements need more opacity than the big washes to stay readable.
  const dot = 'bg-accent-bright/35'
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
    case 'orbit':
      // A single dot tracing a slow circuit — something to follow with the eyes
      // instead of a pulse to breathe with.
      return (
        <div className="absolute h-[62%] w-[62%]">
          <div className={`absolute inset-0 rounded-full border ${border}`} />
          <div className="rest-orbit absolute inset-0">
            <div className={`absolute left-1/2 top-0 h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}`} />
          </div>
        </div>
      )
    case 'aurora':
      // Two blurred bands drifting past each other behind the ring — motion
      // with no pulse at all, for when a rhythm would feel like a countdown.
      return (
        <div className="absolute h-[70%] w-[70%] overflow-hidden rounded-full">
          <div className={`rest-aurora-a absolute h-[55%] w-[130%] -left-[15%] rounded-full blur-2xl ${fill}`} />
          <div className={`rest-aurora-b absolute h-[45%] w-[130%] -left-[15%] rounded-full blur-2xl ${fill}`} />
        </div>
      )
    case 'bloom':
      // Six petals opening and closing around a center as the whole flower
      // turns — the slowest, most ornamental shape of the set.
      return (
        <div className="rest-bloom absolute h-[62%] w-[62%]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 60}deg)` }}>
              <div className={`absolute left-1/2 top-[4%] h-[44%] w-[44%] -translate-x-1/2 rounded-full border ${border}`} />
            </div>
          ))}
        </div>
      )
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
 * The rest animation is the timer: a restful shape grows from almost nothing at
 * the start of the rest to filling the screen when rest is up — a calm, glanceable
 * cue for how much rest is left — and the numeric countdown sits at the bottom of
 * the screen. Because the growth is derived from the wall-clock end time (not a CSS
 * loop), it stays in sync after backgrounding or a reload. Optional `upNext` tells the resting
 * user what's coming; `progress` + `timeLeftLabel` (rendered verbatim, so the
 * caller phrases it — "~5 min left in workout") show the same session progress
 * bar as the session header, so rest says how far in you are and not just how
 * long is left. `onAddSet` surfaces an "Add another set" action during an
 * exercise's final rest, and `menu` keeps the session's overflow actions reachable
 * without ending rest first.
 */
export function RestTimer({
  seconds,
  endsAt,
  onClose,
  upNext,
  progress,
  timeLeftLabel,
  onAddSet,
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
  /** Session position for the progress bar — completed sets out of the total. */
  progress?: { done: number; total: number; unit?: string }
  timeLeftLabel?: string | null
  onAddSet?: () => void
  /** Overflow actions for the 3-dots menu, mirroring the session header's. */
  menu?: MenuItem[]
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
  // How much of the rest has elapsed (0 at the start, 1 when rest is up). The
  // shape scales with this, so the animation itself reads as the timer.
  const elapsed = seconds > 0 ? 1 - Math.max(0, Math.min(1, remaining / seconds)) : 1

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center bg-black px-6"
      onClick={onClose}
    >
      {(upNext || menu) && (
        // One top row: the menu sits at the right with "up next" still centered
        // between the edges, so a long exercise name can't run underneath it.
        <div className="flex w-full items-start gap-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="w-11 shrink-0" aria-hidden />
          <p className="flex-1 pt-2.5 text-center text-base font-semibold text-neutral-200">{upNext}</p>
          {/* Tapping the overlay ends rest, so the menu keeps its taps to itself. */}
          <div className="w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
            {menu && <KebabMenu items={menu} />}
          </div>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center">
        <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
          {/* The animation is the timer: it grows from almost nothing at the start
              of the rest to filling the space when rest is up. The variant keeps its
              own gentle loop for life; this scale carries the countdown. */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `scale(${0.12 + 0.88 * elapsed})`,
              transition: 'transform 250ms linear',
            }}
          >
            <RestShape variant={variant} />
          </div>
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
            add another set
          </button>
        )}
        <div className={`font-mono text-7xl font-bold tabular-nums ${over ? 'text-accent-2' : 'text-white'}`}>
          {label}
        </div>
        {progress ? (
          <SessionProgress
            done={progress.done}
            total={progress.total}
            unit={progress.unit ?? 'sets'}
            timeLeftLabel={timeLeftLabel}
            className="w-[min(78vw,20rem)]"
          />
        ) : (
          timeLeftLabel && <p className="text-sm font-medium text-neutral-400">{timeLeftLabel}</p>
        )}
      </div>
    </div>
  )
}
