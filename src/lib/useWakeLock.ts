import { useEffect } from 'react'

/**
 * Give a lock back, swallowing the refusal a page on its way out can answer with
 * — by then the browser has taken the lock anyway, which is all this wanted.
 */
const release = (lock: WakeLockSentinel) => lock.release().catch(() => {})

/**
 * Hold the screen on while `active`, through the Screen Wake Lock API.
 *
 * For the hands-free modes: a session that advances itself is a session nobody
 * is tapping, and a phone with nothing to tap dims and locks on its own after
 * half a minute — right as the rest it's counting down runs out. The set logging
 * itself behind a dark screen is the whole feature undone, so while the clock is
 * driving the session the screen is held awake, and the moment it isn't the lock
 * goes back.
 *
 * The browser releases the lock itself whenever the page stops being visible and
 * never hands it back, so it's re-requested on the way back in. Requesting it
 * while hidden is refused outright, hence the check before asking.
 *
 * Every failure path is silent: no lock is granted without a secure context, and
 * the request is refused (or the whole API missing) often enough that a session
 * has to be able to run without one. Losing it costs a dimmed screen, not a
 * workout.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let held: WakeLockSentinel | null = null
    let done = false
    // A request in flight, so a second visibility change while the first is still
    // being answered doesn't take out two locks and lose track of one.
    let asking = false

    const acquire = async () => {
      if (done || held || asking || document.hidden) return
      asking = true
      try {
        const lock = await navigator.wakeLock.request('screen')
        // The await is long enough for this effect to have been torn down —
        // stepping the toggle twice — and a lock nobody is holding onto has to be
        // let go rather than left on until the tab closes.
        if (done) {
          void release(lock)
          return
        }
        held = lock
        // Released out from under us — page hidden, or the system reclaiming it —
        // so stop treating it as ours and let the next arrival ask again.
        lock.addEventListener('release', () => {
          if (held === lock) held = null
        })
      } catch {
        // Refused. Nothing to fall back to, and nothing worth saying.
      } finally {
        asking = false
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      done = true
      document.removeEventListener('visibilitychange', acquire)
      if (held) void release(held)
      held = null
    }
  }, [active])
}
