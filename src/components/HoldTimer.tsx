import { useEffect, useRef, useState } from 'react'
import { CountdownShape } from './RestTimer'

/** The prescribed seconds as a clock reads them. */
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * The clock for a timed hold — a plank rather than a set of reps (see
 * PlannedExercise.timed), or a static stretch with nothing for the rhythm guide
 * to animate (see FlexExercise.holdSec).
 *
 * It counts the prescribed hold DOWN to zero and then keeps going, into overtime.
 * Both directions matter: the countdown is what you hold to, and the overtime is
 * what makes a hold you kept going on worth logging.
 *
 * Nothing starts it and nothing stops it. The set being on screen is the whole of
 * the start signal (`running`), because the hold is prescribed: a press had
 * nothing to say that the get-into-position count leading in hadn't already, and
 * it asked for a tap in the one moment your hands aren't free. What gets logged is
 * either the number typed into the field beside it — a hold you come down out of
 * when you come out of it — or the seconds the clock ran when it closed the set
 * itself (`onTargetEnd`).
 *
 * Wall-clock based like the rest timer, so it stays honest through a phone that
 * throttles timers in the background: the elapsed time is derived from when the
 * run began rather than accumulated tick by tick. `running` going false — a rest
 * reopened over the set, the pause curtain, a sheet — stands the clock down with
 * its seconds banked, and it resumes the count from there: the time you spent
 * reading another screen wasn't time in the pose, and it isn't grounds for
 * starting ninety seconds over either.
 *
 * A buzz marks the prescribed time passing, since the one place you aren't looking
 * mid-plank is the screen. For the same reason the clock is drawn as well as
 * counted: one of the shapes rest tells its time with runs above the number, its
 * level draining as the hold does (see RestTimer's CountdownShape), so a plank or
 * a ninety-second calf stretch reads from the corner of an eye.
 */
export function HoldTimer({
  targetSec,
  running,
  onStart,
  onTargetEnd,
}: {
  /** The prescribed hold, counted down from. */
  targetSec: number
  /**
   * The set is on screen and the hold is being held. Set it once the set is
   * genuinely up — a hold shouldn't be counting down behind rest, a
   * get-into-position count or the pause curtain. False mid-hold stands the clock
   * down with what it has; true again resumes it.
   */
  running: boolean
  /** The clock started or resumed — for a caller that wants to stand its own clocks down. */
  onStart?: () => void
  /**
   * The prescribed time ran out, with the whole seconds the hold lasted. Given, it
   * is what closes the set; left off, the clock runs on into overtime and the set
   * is closed some other way.
   */
  onTargetEnd?: (heldSec: number) => void
}) {
  // When the current run of the clock began (null while it's standing down) and
  // the milliseconds banked from the runs before it. Refs, not state: the ticker
  // below reads them every tick, and a render is only worth doing for the display.
  const runSince = useRef<number | null>(null)
  const bankedMs = useRef(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const buzzed = useRef(false)
  const ended = useRef(false)
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart

  /** Seconds the hold has run, read from the clock rather than from the last tick. */
  const heldSec = () => {
    const live = runSince.current == null ? 0 : Date.now() - runSince.current
    return Math.round((bankedMs.current + live) / 1000)
  }

  useEffect(() => {
    if (!running) {
      // Standing down: bank this run so the count picks up where it stopped, and
      // leave the frozen number on screen — it says what's been held so far.
      if (runSince.current != null) {
        bankedMs.current += Date.now() - runSince.current
        runSince.current = null
        setElapsedMs(bankedMs.current)
      }
      return
    }
    const since = Date.now()
    runSince.current = since
    onStartRef.current?.()
    const tick = () => setElapsedMs(bankedMs.current + (Date.now() - since))
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
  }, [running])

  const remainingMs = targetSec * 1000 - elapsedMs
  const remaining = Math.round(remainingMs / 1000)
  const over = remaining < 0
  const abs = Math.abs(remaining)
  const label = `${over ? '+' : ''}${mmss(abs)}`
  // How much of the prescribed hold is left, for the shape that draws it: taken
  // from the millisecond value so its level moves every tick rather than once a
  // second. It bottoms out at zero and stays there through overtime, which the
  // number is left to say on its own.
  const fraction = targetSec > 0 ? clamp01(remainingMs / (targetSec * 1000)) : 0

  useEffect(() => {
    if (buzzed.current || remaining > 0) return
    buzzed.current = true
    navigator.vibrate?.(400)
  }, [remaining])

  // The prescribed time running out is the whole of what a self-closing hold waits
  // on. It can only run out while the clock is running, so a hold that stood down
  // at the buzzer closes when the set comes back rather than behind whatever screen
  // was over it.
  useEffect(() => {
    if (remaining > 0 || !onTargetEnd || ended.current) return
    ended.current = true
    onTargetEnd(heldSec())
    // `heldSec` is rebuilt every render; the latch above is what keeps this to one
    // firing, since the hold it reads is over the moment it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, onTargetEnd])

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The hold drawn as well as counted, in the bright green the rest shapes
          use: the level is the time left, so the shape is the clock. */}
      <CountdownShape fraction={fraction} />
      {/* Dark green for a timer readout, matching the rest screen's countdown — the
          brighter accent belongs to the animations that are calling for attention.
          Before the clock starts this is the hold you're about to do, since nothing
          has come off it yet. */}
      <div className={`font-mono text-6xl font-bold tabular-nums ${over ? 'text-accent-2' : 'text-accent'}`}>
        {label}
      </div>
    </div>
  )
}
