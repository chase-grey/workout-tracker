import { useLayoutEffect, useRef } from 'react'
import { usePrefersReducedMotion } from './useReducedMotion'

/** Fade each new session screen without remounting or delaying its clocks. */
export function useSessionFade(screen: string) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  useLayoutEffect(() => {
    if (reducedMotion) return
    const animation = ref.current?.animate?.(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 400, easing: 'ease-out' },
    )
    // Rapid taps cancel the previous fade instead of stacking animations.
    return () => animation?.cancel()
  }, [screen, reducedMotion])

  return ref
}
