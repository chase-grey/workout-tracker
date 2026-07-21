import { useEffect, useRef, useState } from 'react'

const RING_R = 112
const RING_C = 2 * Math.PI * RING_R

/**
 * Full-screen rest countdown. Wall-clock based: it tracks a target end time and
 * derives the remaining seconds from `Date.now()`, so it stays accurate even
 * when the browser throttles/pauses timers in the background — switch apps and
 * come back and it reflects the real elapsed time. Counts into overtime until
 * dismissed. No system notifications by design.
 *
 * Alongside the numeric clock, a large ring drains over the rest period and a
 * slow breathing orb pulses behind it — a calm, glanceable cue for how much
 * rest is left that reads from across the room.
 */
export function RestTimer({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  const endRef = useRef<number>(Date.now() + seconds * 1000)
  const [remaining, setRemaining] = useState(seconds)
  const [breatheIn, setBreatheIn] = useState(true)
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

  // Slow ~4s in / 4s out breathe for the orb behind the clock.
  useEffect(() => {
    const id = setInterval(() => setBreatheIn((b) => !b), 4000)
    return () => clearInterval(id)
  }, [])

  const over = remaining < 0
  const abs = Math.abs(remaining)
  const label = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  // Fraction of rest still remaining (drains the ring from full to empty).
  const fraction = seconds > 0 ? Math.max(0, Math.min(1, remaining / seconds)) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/95 px-6"
      onClick={onClose}
    >
      <p className="text-sm uppercase tracking-widest text-neutral-500">Rest</p>

      <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
        {/* Breathing orb — a calm pace cue behind the clock. */}
        <div
          className={`absolute h-[62%] w-[62%] rounded-full ring-1 ${over ? 'bg-accent-2/15 ring-accent-2/30' : 'bg-accent/15 ring-accent/30'}`}
          style={{ transition: 'transform 4s ease-in-out', transform: `scale(${breatheIn ? 1.06 : 0.86})` }}
        />

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
            className={over ? 'stroke-accent-2' : 'stroke-accent'}
            style={{
              strokeDasharray: RING_C,
              strokeDashoffset: RING_C * (1 - (over ? 1 : fraction)),
              transition: 'stroke-dashoffset 250ms linear',
            }}
          />
        </svg>

        <div
          className={`relative font-mono text-7xl font-bold tabular-nums ${over ? 'text-accent-2' : 'text-white'}`}
        >
          {label}
        </div>
      </div>

      <p className="text-sm text-neutral-500">Tap anywhere when you're ready</p>
    </div>
  )
}
