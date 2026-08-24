import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../lib/shell'

/**
 * Brief full-screen "get into position" countdown shown after rest, before the
 * set it leads into — time to settle in, or to walk back to the bar, before the
 * work starts. Used by the stretch routine ahead of a stretch's rhythm, and by
 * the workout when a hands-free rest ends itself.
 * Wall-clock based (tracks a target end time) so it stays accurate if the app is
 * backgrounded. Tap anywhere to start immediately.
 *
 * Like the rest screen it covers the whole viewport, and like the rest screen it
 * hands the top of it back to the session: `header` is the very node the screen
 * behind renders up there, laid out in the app shell's own content box (see
 * lib/shell), so the progress bar, the stretch named, the set coming and the
 * session's controls all stay put and stay reachable while you settle in. The
 * move is named up there, so this doesn't name it again.
 */
export function GetReady({
  seconds,
  header,
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
  onDone: () => void
}) {
  const endRef = useRef(Date.now() + seconds * 1000)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    const tick = () => {
      const r = Math.ceil((endRef.current - Date.now()) / 1000)
      setRemaining(r)
      if (r <= 0) doneRef.current()
    }
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-hidden bg-black px-6"
      onClick={() => doneRef.current()}
    >
      {/* The session's toolbar, in the shell's content box — hence the negative
          margin undoing the `px-6` the count below is padded by, so it lands on
          the pixels it already occupied and nothing above the fold moves. */}
      <div className={`relative z-10 -mx-6 self-stretch ${SHELL_PAD_TOP}`}>
        <div className={`${SHELL_WIDTH} ${SHELL_PAD_X}`}>{header}</div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">get ready</p>
        <div className="relative flex aspect-square w-[min(86vw,30rem)] items-center justify-center">
          <div className="absolute h-[62%] w-[62%] rounded-full bg-accent/15 ring-1 ring-accent/30" />
          <div className="relative font-mono text-8xl font-bold tabular-nums text-white">{Math.max(0, remaining)}</div>
        </div>
      </div>
    </div>
  )
}
