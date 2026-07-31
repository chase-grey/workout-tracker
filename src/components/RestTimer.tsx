import { useEffect, useRef, useState } from 'react'
import { KebabMenu, type MenuItem } from './KebabMenu'
import { SessionProgress } from './SessionProgress'

// Time-telling shapes made for rest: each one encodes the remaining fraction
// directly in its dominant dimension — a sand level, a liquid line, a candle's
// height, a stack of lit segments — so a glance reads how much rest is left.
// Any looping motion (falling sand, rising bubbles, a flickering flame) is
// texture only and never drives that level, so the time reading stays honest.
const VARIANTS = ['sandglass', 'tide', 'candle', 'pips'] as const
type Variant = (typeof VARIANTS)[number]

// Remembered across mounts (each rest remounts the timer) so we never show the
// same shape twice in a row — rest reliably rotates through the whole set.
let lastVariant: Variant | null = null
function pickVariant(): Variant {
  const pool = VARIANTS.filter((v) => v !== lastVariant)
  lastVariant = pool[Math.floor(Math.random() * pool.length)]
  return lastVariant
}

/**
 * The rest animation itself. `fraction` is how much rest is still left (1 at the
 * start, 0 when it's up); every shape maps it straight onto its level so the
 * shape *is* the timer.
 *
 * Bright green throughout — the resting animation is meant to call attention, so
 * it reads as vividly green rather than a faint wash. Dark green (accent) stays
 * reserved for the numeric timer and bar UI.
 */
function RestShape({ variant, fraction }: { variant: Variant; fraction: number }) {
  const level = `${fraction * 100}%`
  const filled = `${(1 - fraction) * 100}%`
  // Smooth the 250ms wall-clock steps into one continuous drain.
  const drain = { transition: 'height 260ms linear' } as const
  switch (variant) {
    case 'tide':
      // A vessel that empties: the liquid line drops from full to nothing. The
      // surface glint and slow bubbles read as liquid without moving the line.
      return (
        <div className="absolute h-[74%] w-[74%] overflow-hidden rounded-full ring-1 ring-accent-bright/50">
          <div className="absolute inset-0 bg-accent-bright/12" />
          <div className="absolute inset-x-0 bottom-0 bg-accent-bright/70" style={{ height: level, ...drain }}>
            <div className="absolute inset-x-0 top-0 h-[3px] bg-accent-bright" />
            <div className="rest-bubble absolute bottom-[8%] left-[34%] h-[6%] w-[6%] rounded-full bg-accent-bright/70" />
            <div
              className="rest-bubble absolute bottom-[8%] left-[62%] h-[4%] w-[4%] rounded-full bg-accent-bright/70"
              style={{ animationDelay: '1.6s' }}
            />
          </div>
        </div>
      )
    case 'candle':
      // A candle burning down: the wax height is the time left and the flame
      // rides its top downward, guttering out as it reaches the base.
      return (
        <div className="absolute bottom-[12%] left-1/2 h-[74%] w-[22%] -translate-x-1/2">
          {/* Faint full-height guide so the shrinking wax reads against a whole. */}
          <div className="absolute inset-0 rounded-t-[45%] rounded-b-[14%] bg-accent-bright/12" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[45%] rounded-b-[14%] bg-accent-bright/70"
            style={{ height: level, ...drain }}
          />
          {fraction > 0 && (
            <div
              className="rest-flame absolute left-1/2 h-[15%] w-[64%] -translate-x-1/2 rounded-[50%_50%_50%_50%/72%_72%_38%_38%] bg-accent-bright"
              style={{ bottom: level, marginBottom: '-3%', transition: 'bottom 260ms linear' }}
            />
          )}
        </div>
      )
    case 'pips': {
      // A meter that empties bottom-up: lit segments are the time left, and the
      // leading one breathes so the boundary is easy to find at a glance.
      const total = 6
      const lit = Math.ceil(fraction * total)
      return (
        <div className="absolute inset-y-[10%] left-1/2 flex w-[26%] -translate-x-1/2 flex-col-reverse gap-1.5">
          {Array.from({ length: total }, (_, i) => {
            const on = i < lit
            return (
              <div
                key={i}
                className={`flex-1 rounded-full ${on ? 'bg-accent-bright/80' : 'bg-accent-bright/12'} ${
                  on && i === lit - 1 ? 'rest-pip' : ''
                }`}
              />
            )
          })}
        </div>
      )
    }
    case 'sandglass':
    default:
      // An hourglass: the top chamber's sand drains out the neck (its surface
      // descending as time runs out) and piles up in the bottom chamber.
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
          {/* A thin stream through the neck while sand is still falling. */}
          {fraction > 0 && fraction < 1 && (
            <div className="rest-stream absolute left-1/2 top-1/2 h-[12%] w-[2.5%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
          )}
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
 * (in dark green) sits at the bottom of the screen. Because the level is derived
 * from the wall-clock end time (not a CSS loop), it stays in sync after
 * backgrounding or a reload. Optional `upNext` tells the resting
 * user what's coming; `progress` + `timeLeftLabel` (rendered verbatim, so the
 * caller phrases it — "~5 min left in workout") show the same session progress
 * bar as the session header — pinned to the top of the rest screen — so rest says
 * how far in you are and not just how long is left. `onAddSet` surfaces an "Add another set" action during an
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
  // How much of the rest is still left (1 at the start, 0 when rest is up). Each
  // shape encodes this directly as its level — a sand column, a liquid line, a
  // candle's height — so the animation itself reads as the timer.
  const remainingFraction = seconds > 0 ? Math.max(0, Math.min(1, remaining / seconds)) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center bg-black px-6"
      onClick={onClose}
    >
      {/* Top region: the "how far through the workout" bar sits at the very top,
          with the up-next/menu row beneath it. */}
      <div className="w-full pt-[calc(0.75rem+env(safe-area-inset-top))]">
        {progress && (
          <SessionProgress
            done={progress.done}
            total={progress.total}
            unit={progress.unit ?? 'sets'}
            timeLeftLabel={timeLeftLabel}
            className="w-full"
          />
        )}
        {(upNext || menu) && (
          // One row: the menu sits at the right with "up next" still centered
          // between the edges, so a long exercise name can't run underneath it.
          <div className="mt-3 flex w-full items-start gap-2">
            <div className="w-11 shrink-0" aria-hidden />
            <p className="flex-1 pt-2.5 text-center text-base font-semibold text-neutral-200">{upNext}</p>
            {/* Tapping the overlay ends rest, so the menu keeps its taps to itself. */}
            <div className="w-11 shrink-0" onClick={(e) => e.stopPropagation()}>
              {menu && <KebabMenu items={menu} />}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
          {/* The animation is the timer: the shape's level carries the countdown
              (full at the start, empty when rest is up); any looping motion is
              just texture and never drives the level. */}
          <RestShape variant={variant} fraction={remainingFraction} />
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
        {/* Dark green for the timer UI, overtime included — the leading "+" says
            you're past due without the number brightening to grab at you. */}
        <div className="font-mono text-7xl font-bold tabular-nums text-accent">{label}</div>
        {/* The session progress bar now lives at the top; when there's no bar to
            show, fall back to the bare time-left line here. */}
        {!progress && timeLeftLabel && (
          <p className="text-sm font-medium text-neutral-400">{timeLeftLabel}</p>
        )}
      </div>
    </div>
  )
}
