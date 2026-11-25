import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../lib/shell'

/**
 * Brief full-screen "get into position" countdown shown after rest, before the
 * set it leads into — time to settle in, or to walk back to the bar, before the
 * work starts. Used by the stretch routine ahead of a stretch's rhythm, and by
 * the workout between the tap that brings a hold up and the hold's clock.
 * Wall-clock based (tracks a target end time) so it stays accurate if the app is
 * backgrounded. Tap anywhere to start immediately.
 *
 * Like the rest screen it covers the whole viewport, and like the rest screen it
 * hands the top of it back to the session: `header` is the very node the screen
 * behind renders up there, laid out in the app shell's own content box (see
 * lib/shell), so the progress bar, the stretch named, the set coming and the
 * session's controls all stay put and stay reachable while you settle in. The
 * move is named up there, so this doesn't name it again.
 *
 * `untilTap` holds the screen on "ready?" until you tap it, for a setup that takes
 * as long as it takes. It is not asked of someone who just tapped to get here
 * (see lib/settleIn's holdsOnReady). By default that tap starts the set; with
 * `tapStartsCount` it starts the count instead, as it does for every set that
 * runs on a clock: the hand that tapped still has to get into the pose. `onHold` says when that wait begins and
 * when it ends, however it ends, so the session can stand its clock still
 * through it (see lib/offClock).
 */
export function GetReady({
  seconds,
  header,
  untilTap = false,
  tapStartsCount = false,
  onHold,
  onDone,
}: {
  seconds: number
  /**
   * The session's own top-of-screen block. Required: the count always interrupts
   * a session, and that session's toolbar is the only one there is. Controls
   * inside it must stop their own clicks, since a tap on the overlay skips the
   * count.
   */
  header: ReactNode
  untilTap?: boolean
  /** The tap that ends `untilTap` starts the `seconds` count rather than the set. */
  tapStartsCount?: boolean
  /**
   * True as the wait on "ready?" begins, false as it ends: the tap, or the screen
   * being taken away. Required, because that wait is off the session's clock and
   * only the session can stop it.
   */
  onHold: (holding: boolean) => void
  onDone: () => void
}) {
  const endRef = useRef(Date.now() + seconds * 1000)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const [remaining, setRemaining] = useState(seconds)
  // Still on "ready?", waiting for the tap.
  const [holding, setHolding] = useState(untilTap)
  const holdRef = useRef(onHold)
  holdRef.current = onHold

  useEffect(() => {
    if (!holding) return
    holdRef.current(true)
    return () => holdRef.current(false)
  }, [holding])

  useEffect(() => {
    if (holding) return
    const tick = () => {
      const r = Math.ceil((endRef.current - Date.now()) / 1000)
      setRemaining(r)
      if (r <= 0) doneRef.current()
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [holding])

  // The tap off "ready?" either starts the set or, for a two-part setup, starts the
  // count from that moment. A tap during the count starts the set early.
  const tap = () => {
    if (holding && tapStartsCount && seconds > 0) {
      endRef.current = Date.now() + seconds * 1000
      setRemaining(seconds)
      setHolding(false)
      return
    }
    doneRef.current()
  }

  return (
    <div
      className="keep-dark fixed inset-0 z-50 flex flex-col items-center overflow-hidden bg-black px-6"
      onClick={tap}
    >
      {/* The session's toolbar, in the shell's content box — hence the negative
          margin undoing the `px-6` the count below is padded by, so it lands on
          the pixels it already occupied and nothing above the fold moves. */}
      <div className={`relative z-10 -mx-6 self-stretch ${SHELL_PAD_TOP}`}>
        <div className={`${SHELL_WIDTH} ${SHELL_PAD_X}`}>{header}</div>
      </div>

      <div className="rest-stage flex min-h-0 w-full flex-1 basis-0 flex-col items-center justify-center gap-6">
        <div className="rest-stage-box relative flex aspect-square items-center justify-center">
          <div className="absolute h-[62%] w-[62%] rounded-full bg-accent/15 ring-1 ring-accent/30" />
          {holding ? (
            <div className="relative text-6xl font-bold text-white">ready?</div>
          ) : (
            <div className="relative font-mono text-8xl font-bold tabular-nums text-white">{Math.max(0, remaining)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
