import { useEffect, useRef } from 'react'
import {
  MdCheckCircle,
  MdEmojiEvents,
  MdFlag,
  MdLocalFireDepartment,
  MdMilitaryTech,
  MdStars,
} from 'react-icons/md'
import type { IconType } from 'react-icons'
import type { Celebration, CelebrationIcon, CelebrationTier } from '../lib/celebration'
import { Confetti } from './Confetti'

const ICONS: Record<CelebrationIcon, IconType> = {
  check: MdCheckCircle,
  flame: MdLocalFireDepartment,
  flag: MdFlag,
  medal: MdMilitaryTech,
  stars: MdStars,
  trophy: MdEmojiEvents,
}

const GREENS = ['#16a34a', '#22c55e', '#4ade80', '#86efac']
const GOLDS = ['#fbbf24', '#f59e0b', '#fde68a']

type TierStyle = {
  durationMs: number
  particles: number
  colors: string[]
  vibrate: number | number[] | null
}

const TIERS: Record<CelebrationTier, TierStyle> = {
  small: { durationMs: 2200, particles: 16, colors: GREENS, vibrate: null },
  medium: { durationMs: 2800, particles: 28, colors: [...GREENS, '#f5f5f5'], vibrate: 30 },
  large: { durationMs: 3400, particles: 46, colors: [...GREENS, '#f5f5f5'], vibrate: [40, 40, 40] },
  epic: {
    durationMs: 4400,
    particles: 80,
    colors: [...GOLDS, ...GREENS, '#ffffff'],
    vibrate: [60, 40, 60, 40, 140],
  },
}

/**
 * Celebration animation whose energy scales with the tier.
 *
 * Only the quietest tier is a floating toast — a nudge that shouldn't interrupt
 * what you're doing. Everything worth actually celebrating (a weekly goal, a
 * record, a PR, the end of a session) takes the WHOLE screen: a card floating
 * over the app reads as a notification, not an achievement.
 *
 * Auto-dismisses after the tier's duration, and a tap dismisses early — except
 * for an `ack` celebration (the end of a workout or stretch), which waits for the
 * "nice" button, since pressing it is what drops you back to the app.
 */
export function CelebrationOverlay({ celebration, onDone }: { celebration: Celebration; onDone: () => void }) {
  const style = TIERS[celebration.tier]
  const Icon = ICONS[celebration.icon]
  const isAck = celebration.ack === true
  const isSmall = celebration.tier === 'small' && !isAck
  const isEpic = celebration.tier === 'epic'
  /** Full screen for anything louder than the quiet toast tier. */
  const fullScreen = !isSmall
  const done = useRef(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    onDone()
  }

  useEffect(() => {
    // A quiet tier still earns a buzz when it's taking over the whole screen.
    const pattern = style.vibrate ?? (isAck ? 30 : null)
    if (pattern && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern)
      } catch {
        /* vibration is a nice-to-have */
      }
    }
    if (isAck) return
    const t = setTimeout(finish, style.durationMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Full screen has room for a big mark; the toast needs to stay small.
  const iconSize = isSmall ? 'text-3xl' : isEpic ? 'text-7xl' : 'text-6xl'
  const iconColor = isEpic ? 'text-amber-400' : 'text-accent-2'
  const iconClass = isEpic ? 'celebrate-shake celebrate-pop' : ''

  if (fullScreen) {
    return (
      <div
        role="status"
        aria-live="polite"
        // A non-ack full-screen cheer still dismisses on tap; an ack one waits for
        // the button, so a stray tap can't skip the moment it exists to mark.
        onClick={isAck ? undefined : finish}
        className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-black/95 px-6 py-8"
      >
        {isEpic && (
          <div
            className="celebrate-flash pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-300/40 via-accent/10 to-transparent"
            aria-hidden
          />
        )}

        <Confetti count={Math.max(style.particles, 40)} colors={style.colors} />

        <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="celebrate-pop flex flex-1 flex-col items-center justify-center text-center">
            <Icon className={`${iconSize} ${iconColor} ${iconClass}`} aria-hidden />
            <h1
              className={`mt-4 font-black leading-tight ${
                isEpic
                  ? 'bg-gradient-to-r from-amber-300 to-accent-2 bg-clip-text text-4xl text-transparent'
                  : 'text-3xl'
              }`}
            >
              {celebration.title}
            </h1>
            {celebration.subtitle && <p className="mt-2 text-neutral-300">{celebration.subtitle}</p>}
            {celebration.details && celebration.details.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {celebration.details.map((d) => (
                  <span key={d} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm text-neutral-300">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isAck && (
            <button
              onClick={finish}
              className="mt-8 min-h-[52px] w-full rounded-2xl bg-accent text-lg font-bold text-black active:bg-accent-2"
            >
              nice
            </button>
          )}
        </div>
      </div>
    )
  }

  // The quiet tier: a toast that floats above the UI without blocking it.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center px-6 pb-24"
    >
      <Confetti count={style.particles} colors={style.colors} />

      <div
        onClick={finish}
        className="celebrate-slide-up pointer-events-auto flex max-w-xs items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-xl"
      >
        <Icon className={`${iconSize} shrink-0 ${iconColor}`} aria-hidden />
        <div className="min-w-0">
          <p className="font-bold leading-tight">{celebration.title}</p>
          {celebration.subtitle && <p className="text-sm text-neutral-400">{celebration.subtitle}</p>}
        </div>
      </div>
    </div>
  )
}
