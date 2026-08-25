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

type Guard = { onBack: () => void }

/**
 * Every guard currently asking for the back press, oldest claim first — a screen
 * and then whatever it opened over itself. One back press answers to the newest
 * claim only, so closing the checklist leaves the workout underneath it standing.
 */
const claims: Guard[] = []

/** Set while a `history.back()` of our own is in flight, so its pop isn't read as a press. */
let dropping = false

/** Whether the entry on top of the stack is a guard this page load pushed. */
function ownGuard(): boolean {
  return window.history.state?.backGuard === PAGE_ID
}

/**
 * Keeps exactly one guard entry on the history stack for as long as anything is
 * claiming back, and none once nothing is.
 */
function sync() {
  if (claims.length > 0) {
    if (!ownGuard()) window.history.pushState({ backGuard: PAGE_ID }, '')
  } else if (ownGuard()) {
    dropping = true
    window.history.back()
  }
}

// One listener for the app's lifetime: the guard can be popped at any moment, and
// who should answer depends on what's claiming back right then.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (dropping) {
      dropping = false
    } else {
      claims[claims.length - 1]?.onBack()
    }
    // The pop spent the guard entry. A claim that outlives the press — the
    // session behind the checklist that just closed — gets a fresh one; a screen
    // the press dismissed drops its claim in an effect, which syncs again.
    sync()
  })
}

/**
 * Turns the hardware/browser back button into an "leave this screen" gesture
 * instead of a "leave the app" one. While `active`, a guard entry sits on top of
 * the history stack; popping it (Android back, browser back, edge swipe) calls
 * `onBack` and the app stays put.
 *
 * Guards nest: a screen layered over another one claims the press while it's up,
 * and the press it answers goes no further than closing it.
 *
 * The guard entry is pushed at most once — never as a push/pop pair per mount —
 * so React's StrictMode double-invoke can't leave the stack with a stray entry
 * or a phantom back navigation in flight. A guard that goes inactive by other
 * means drops its claim, so it can't swallow a later back press.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const guard = useRef<Guard | null>(null)
  if (!guard.current) guard.current = { onBack }
  guard.current.onBack = onBack

  // A guard restored from a previous document can't be popped in place, so drop
  // its marker rather than trust it — nothing else keeps history state.
  useEffect(() => {
    if (window.history.state?.backGuard && !ownGuard()) window.history.replaceState(null, '')
  }, [])

  useEffect(() => {
    const g = guard.current!
    if (!active) return
    claims.push(g)
    sync()
    return () => {
      claims.splice(claims.indexOf(g), 1)
      sync()
    }
  }, [active])
}
