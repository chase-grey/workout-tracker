import { useEffect, useRef, useState } from 'react'

/**
 * Brief full-screen "get into position" countdown shown after rest, before the
 * next stretch's rhythm begins — time to settle in before the pace starts.
 * Wall-clock based (tracks a target end time) so it stays accurate if the app is
 * backgrounded. Tap anywhere to start immediately.
 */
export function GetReady({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const endRef = useRef(Date.now() + seconds * 1000)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    const tick = () => {
      const r = Math.ceil((endRef.current - Date.now()) / 1000)
      setRemaining(r)
      if (r <= 0) doneRef.current()
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black px-6"
      onClick={() => doneRef.current()}
    >
      <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
        <div className="absolute h-[62%] w-[62%] rounded-full bg-accent/15 ring-1 ring-accent/30" />
        <div className="relative font-mono text-8xl font-bold tabular-nums text-white">{Math.max(0, remaining)}</div>
      </div>
    </div>
  )
}
