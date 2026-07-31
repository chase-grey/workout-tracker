import { useEffect, useRef } from 'react'

/**
 * Turns the hardware/browser back button into an "leave this screen" gesture
 * instead of a "leave the app" one. While `active`, a guard entry sits on top of
 * the history stack; popping it (Android back, browser back, edge swipe) calls
 * `onBack` and the app stays put.
 *
 * The guard entry is pushed at most once — never as a push/pop pair per mount —
 * so React's StrictMode double-invoke can't leave the stack with a stray entry
 * or a phantom back navigation in flight. When `active` goes false by other
 * means the entry is dropped, so it can't swallow a later back press.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const activeRef = useRef(active)
  activeRef.current = active

  // One listener for the app's lifetime: the guard can be popped at any moment,
  // and whether that should mean "go back" depends on the state right then.
  useEffect(() => {
    const onPop = () => {
      if (activeRef.current) onBackRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (active) {
      if (!window.history.state?.backGuard) window.history.pushState({ backGuard: true }, '')
    } else if (window.history.state?.backGuard) {
      window.history.back()
    }
  }, [active])
}
