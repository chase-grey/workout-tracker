import { useEffect, useRef, useState } from 'react'

/** Active time only: sheets, rests and pauses stop the clock. */
export function useStepElapsed(key: string, running: boolean, initialSec = 0) {
  const clock = useRef({ key, sec: initialSec, since: 0 })
  if (clock.current.key !== key) clock.current = { key, sec: 0, since: 0 }
  const [, tick] = useState(0)
  const read = () => clock.current.sec + (clock.current.since ? (Date.now() - clock.current.since) / 1000 : 0)
  useEffect(() => {
    const current = clock.current
    if (!running) return
    current.since = Date.now()
    const timer = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => {
      current.sec += (Date.now() - current.since) / 1000
      current.since = 0
      window.clearInterval(timer)
    }
  }, [key, running])
  return read
}
