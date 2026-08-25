import { useEffect, useRef, useState } from 'react'

/**
 * The clock for a timed hold — a plank rather than a set of reps (see
 * PlannedExercise.timed).
 *
 * It counts the prescribed hold DOWN to zero and then keeps going, into overtime.
 * Both directions matter: the countdown is what you hold to, and the overtime is
 * what makes a hold you kept going on worth logging.
 *
 * Wall-clock based like the rest timer, so it stays honest through a phone that
 * throttles timers in the background: the elapsed time is derived from when the
 * hold started rather than accumulated tick by tick.
 *
 * A buzz marks the prescribed time passing, since the one place you aren't looking
 * mid-plank is the screen.
 *
 * There are two ways to run it. Pressed — the default, and what the stretch
 * routine uses — it waits to be started, and the 'done' press is what ends it:
 * that hands back the seconds actually held, short or long, which is what gets
 * written to the set, since the target is a prescription and not what happened.
 *
 * `autoRun` drops both presses. The clock starts as soon as the set is on screen
 * and then simply keeps running; the seconds that get logged are the ones typed
 * into the field beside it. For a hold you come down out of, the press was only
 * ever a worse way of saying a number you have to read off the screen anyway —
 * and it cost a tap in the one moment your hands are busy. It starts once, so a
 * screen that goes away and comes back (a pause, a sheet) doesn't restart the
 * hold it interrupted.
 *
 * Hands-free (`onTargetEnd`) the hold doesn't wait on anything: the prescribed
 * time being up is what ends it, and a hold already past that when hands-free
 * comes on ends the moment it does — with the overtime it really ran, since
 * that's what the clock says was held.
 */
export function HoldTimer({
  targetSec,
  onStop,
  onStart,
  onTargetEnd,
  autoRun,
}: {
  /** The prescribed hold, counted down from. */
  targetSec: number
  /** The hold ended on the 'done' press, with the whole seconds it lasted. */
  onStop?: (heldSec: number) => void
  /** The hold began — for a caller that wants to stand its own clocks down. */
  onStart?: () => void
  /**
   * Given, the hold ends itself once the prescribed time is up rather than waiting
   * on the 'done' press, and hands over the seconds it lasted here instead of to
   * `onStop` — so the caller can tell a hold the clock closed from one you closed.
   */
  onTargetEnd?: (heldSec: number) => void
  /**
   * Run the clock unattended: no start press, no 'done' press, and no button at
   * all. Set it once the set is genuinely on screen — a hold shouldn't be counting
   * down behind rest, a get-into-position count or the pause curtain.
   */
  autoRun?: boolean
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const buzzed = useRef(false)

  useEffect(() => {
    if (startedAt == null) return
    const tick = () => setElapsedMs(Date.now() - startedAt)
    tick()
    const id = setInterval(tick, 250)
    // Timers throttle while the tab is hidden, so recompute on the way back in
    // rather than trusting the interval to have kept count.
    const onWake = () => tick()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [startedAt])

  const remaining = Math.round((targetSec * 1000 - elapsedMs) / 1000)
  const over = remaining < 0
  const abs = Math.abs(remaining)
  const label = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`

  useEffect(() => {
    if (startedAt == null || buzzed.current || remaining > 0) return
    buzzed.current = true
    navigator.vibrate?.(400)
  }, [startedAt, remaining])

  const start = () => {
    buzzed.current = false
    setElapsedMs(0)
    setStartedAt(Date.now())
    onStart?.()
  }

  // Unattended, the set arriving on screen is the whole of the start signal. The
  // latch is a ref rather than the clock itself, so a hands-free hold that ended
  // on its own in the same beat can't be started again on the way out.
  const autoStarted = useRef(false)
  const startRef = useRef(start)
  startRef.current = start
  useEffect(() => {
    if (!autoRun || autoStarted.current) return
    autoStarted.current = true
    startRef.current()
  }, [autoRun])

  const end = (hand: (heldSec: number) => void) => {
    // Read from the clock rather than from the last tick, so a hold ended between
    // ticks is logged to the second it really was.
    const held = startedAt == null ? 0 : Math.round((Date.now() - startedAt) / 1000)
    setStartedAt(null)
    setElapsedMs(0)
    hand(held)
  }

  // Hands-free, the clock closes the hold: the prescribed time running out is the
  // whole of what the set was waiting on. Switched on mid-hold this fires on the
  // spot, since a hold in overtime is one that's already done.
  useEffect(() => {
    if (startedAt == null || remaining > 0 || !onTargetEnd) return
    end(onTargetEnd)
    // `end` is rebuilt every render; the guard above is what keeps this to one
    // firing, since the hold it reads is over the moment it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, remaining, onTargetEnd])

  /** The 'done' press, in the pressed mode that has one. */
  const stop = () => {
    if (onStop) end(onStop)
  }

  const running = startedAt != null

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Dark green for a timer readout, matching the rest screen's countdown — the
          brighter accent belongs to the animations that are calling for attention.
          Idle it shows the hold you're about to do, so the number is on screen
          before the clock is running. */}
      <div className={`font-mono text-6xl font-bold tabular-nums ${over ? 'text-accent-2' : 'text-accent'}`}>
        {running ? label : `0:${String(targetSec % 60).padStart(2, '0')}`}
      </div>
      {!autoRun && (
        <button
          onClick={running ? stop : start}
          className="min-h-[56px] w-full rounded-2xl bg-surface-2 text-lg font-bold text-accent active:opacity-80"
        >
          {running ? 'done' : 'start hold'}
        </button>
      )}
    </div>
  )
}
