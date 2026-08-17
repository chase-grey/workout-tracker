import { useEffect, useRef } from 'react'

/**
 * Call `onHidden` whenever the page stops being on screen while `active` —
 * switching to another app, locking the phone, or closing the tab.
 *
 * Anything that runs itself forward on a timer wants this: the timers are wall
 * clock, so they keep counting in the dark, and coming back to a session that
 * advanced through several sets nobody did is worse than coming back to one
 * waiting for a tap.
 *
 * `pagehide` alongside `visibilitychange` because a backgrounded phone browser
 * can go straight to teardown without ever reporting itself hidden, and the
 * current visibility is checked on arm too: a screen restored from storage can
 * come back mid-mode with the page already away.
 */
export function useOnHidden(active: boolean, onHidden: () => void) {
  const onHiddenRef = useRef(onHidden)
  onHiddenRef.current = onHidden

  useEffect(() => {
    if (!active) return
    const fire = () => onHiddenRef.current()
    const check = () => {
      if (document.hidden) fire()
    }
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pagehide', fire)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pagehide', fire)
    }
  }, [active])
}
