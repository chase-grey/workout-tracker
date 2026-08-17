import { useEffect, useRef } from 'react'

/**
 * What counts as "still here". Listened for app-wide rather than on one screen:
 * the thing being detected is the absence of a person, so any input anywhere
 * answers it.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const

/** How often the idle check runs. Coarse on purpose — it's measuring minutes. */
const CHECK_MS = 5000

/**
 * Call `onIdle` once nothing has been touched for `ms`, while `active`. Fires at
 * most once per idle stretch; any input restarts the clock and re-arms it.
 *
 * Measured against the wall clock rather than one long `setTimeout`, because a
 * phone freezes timers the moment the screen locks — a timer armed for five
 * minutes and frozen at four comes back believing it's owed another minute of
 * watching, having in fact been away for ten. The elapsed time is also
 * re-checked as soon as the page becomes visible again, so waking a phone onto
 * an already-idle screen fires straight away instead of at the next tick (and
 * before the first tap in the app can pass for someone having been there all
 * along).
 */
export function useIdleTimeout(active: boolean, ms: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!active) return
    let lastActivity = Date.now()
    let fired = false
    const bump = () => {
      lastActivity = Date.now()
      fired = false
    }
    const check = () => {
      if (fired || Date.now() - lastActivity < ms) return
      fired = true
      onIdleRef.current()
    }
    // Capture phase: a press a handler stops from propagating is still someone
    // pressing something.
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, bump, true)
    document.addEventListener('visibilitychange', check)
    const timer = window.setInterval(check, CHECK_MS)
    return () => {
      window.clearInterval(timer)
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, bump, true)
      document.removeEventListener('visibilitychange', check)
    }
  }, [active, ms])
}
