import { useEffect, useState } from 'react'

/**
 * Whether the OS asks for less motion.
 *
 * The rest shapes' texture loops are switched off in CSS (see the
 * `prefers-reduced-motion` block in index.css), but the simulated ones — the
 * candle's flame, the tide's surface, the snow globe's flakes — have no keyframes
 * to disable: they are written to the DOM every frame from a `requestAnimationFrame`
 * loop. Those need to know in JS so the loop is never started, which leaves the
 * element with whatever resting look CSS gives it rather than freezing it
 * mid-flicker.
 */
export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}
