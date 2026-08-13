import { useEffect, useRef } from 'react'

/**
 * Stamped into each guard entry this page load pushes, so a guard of ours can be
 * told from one restored by the browser.
 *
 * History state outlives the document: the service worker updates itself with a
 * reload (registerType: 'autoUpdate'), and Android discards and restores a
 * backgrounded app the same way. Either one hands the next load a current entry
 * that still claims `backGuard` — but with no same-document entry left beneath
 * it, so popping it re-navigates the document (or leaves the app) instead of
 * firing popstate. An unrecognized stamp means "not mine": the stale marker is
 * cleared and a live guard pushed over it.
 */
const PAGE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** Whether the entry on top of the stack is a guard this page load pushed. */
function ownGuard(): boolean {
  return window.history.state?.backGuard === PAGE_ID
}

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

  // A guard restored from a previous document can't be popped in place, so drop
  // its marker rather than trust it — nothing else keeps history state.
  useEffect(() => {
    if (window.history.state?.backGuard && !ownGuard()) window.history.replaceState(null, '')
  }, [])

  useEffect(() => {
    if (active) {
      if (!ownGuard()) window.history.pushState({ backGuard: PAGE_ID }, '')
    } else if (ownGuard()) {
      window.history.back()
    }
  }, [active])
}
