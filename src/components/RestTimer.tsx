import { useEffect, useRef, useState } from 'react'

/**
 * Full-screen rest countdown. Wall-clock based: it tracks a target end time and
 * derives the remaining seconds from `Date.now()`, so it stays accurate even
 * when the browser throttles/pauses timers in the background — switch apps and
 * come back and it reflects the real elapsed time. Counts into overtime until
 * dismissed. No system notifications by design.
 */
export function RestTimer({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  const endRef = useRef<number>(Date.now() + seconds * 1000)
  const [remaining, setRemaining] = useState(seconds)
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

  const adjust = (delta: number) => {
    endRef.current += delta * 1000
    if (endRef.current - Date.now() > 0) buzzed.current = false
    setRemaining(Math.round((endRef.current - Date.now()) / 1000))
  }

  const over = remaining < 0
  const abs = Math.abs(remaining)
  const label = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-black/95 px-6"
      onClick={onClose}
    >
      <p className="text-sm uppercase tracking-widest text-neutral-500">
        {over ? 'Rest over — tap to continue' : 'Rest'}
      </p>
      <div
        className={`font-mono text-8xl font-bold tabular-nums ${over ? 'text-accent-2' : 'text-white'}`}
      >
        {label}
      </div>
      <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          className="min-h-[44px] rounded-full bg-neutral-800 px-6 text-lg font-medium active:bg-neutral-700"
          onClick={() => adjust(15)}
        >
          +15s
        </button>
        <button
          className="min-h-[44px] rounded-full bg-neutral-800 px-6 text-lg font-medium active:bg-neutral-700"
          onClick={() => adjust(-15)}
        >
          −15s
        </button>
        <button
          className="min-h-[44px] rounded-full bg-accent px-8 text-lg font-semibold text-black active:opacity-80"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  )
}
