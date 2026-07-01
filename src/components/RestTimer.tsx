import { useEffect, useRef, useState } from 'react'

/**
 * Full-screen rest countdown. Counts down from `seconds`, then keeps counting
 * up as "overtime" until dismissed. No system notifications by design — it's
 * meant to stay visible on screen between sets.
 */
export function RestTimer({ seconds, onClose }: { seconds: number; onClose: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  const buzzed = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => r - 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (remaining <= 0 && !buzzed.current) {
      buzzed.current = true
      navigator.vibrate?.(400)
    }
  }, [remaining])

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
          onClick={() => setRemaining((r) => r + 15)}
        >
          +15s
        </button>
        <button
          className="min-h-[44px] rounded-full bg-neutral-800 px-6 text-lg font-medium active:bg-neutral-700"
          onClick={() => setRemaining((r) => r - 15)}
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
