import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { SetGrade } from '../lib/setGrade'

/**
 * The quiet cheer for a set that landed on its target.
 *
 * Deliberately not a CelebrationOverlay: that one takes the screen and waits to
 * be read, which is right for a PR and wrong for something that happens a dozen
 * times a workout. This is decorative only — a glow rising off the bottom edge
 * with a few motes drifting up through it. It never blocks a tap and it plays
 * over the rest screen that opens underneath it, so the flow doesn't pause to
 * congratulate you.
 *
 * Both grades share one vocabulary and differ only in energy: beating the target
 * is the same animation, brighter, wider, a beat longer, and with a ring thrown
 * off the middle. Green stays green so the two never read as different events.
 */

type Style = {
  durationMs: number
  color: string
  /** Peak opacity of the bottom glow — the brightness difference between grades. */
  glow: number
  motes: number
  /** An expanding ring, kept for the brighter grade so `met` stays understated. */
  ring: boolean
  vibrate: number | null
}

const STYLES: Record<SetGrade, Style> = {
  // accent-2, the app's success green, at an opacity that reads as a soft wash.
  met: { durationMs: 1200, color: '#22c55e', glow: 0.5, motes: 5, ring: false, vibrate: null },
  // accent-bright, and pushed well up in opacity: this green goes muddy over
  // black if it's used faintly, which would read as *less* than the quiet tier.
  beat: { durationMs: 1600, color: '#4ade80', glow: 0.85, motes: 11, ring: true, vibrate: 20 },
}

export function SetCheer({ grade, onDone }: { grade: SetGrade; onDone: () => void }) {
  const style = STYLES[grade]
  const done = useRef(false)

  const motes = useMemo(
    () =>
      Array.from({ length: style.motes }, () => ({
        // Clustered toward the middle, where the button you just pressed sits.
        left: 20 + Math.random() * 60,
        size: 4 + Math.random() * 5,
        dx: `${(Math.random() * 2 - 1) * 12}vw`,
        dy: `${-(30 + Math.random() * 34)}vh`,
        duration: `${0.9 + Math.random() * 0.6}s`,
        delay: `${Math.random() * 0.3}s`,
      })),
    // Regenerating on a re-render would restart the drift mid-flight; one set gets
    // one cheer, and the caller remounts by key for the next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grade],
  )

  useEffect(() => {
    if (style.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(style.vibrate)
      } catch {
        /* vibration is a nice-to-have */
      }
    }
    const t = setTimeout(() => {
      if (done.current) return
      done.current = true
      onDone()
    }, style.durationMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden" aria-hidden>
      <div
        className="set-cheer-glow absolute inset-x-0 bottom-0 h-[45vh]"
        style={
          {
            background: `radial-gradient(120% 100% at 50% 100%, ${style.color} 0%, transparent 72%)`,
            '--glow': style.glow,
            animationDuration: `${style.durationMs}ms`,
          } as CSSProperties
        }
      />

      {style.ring && (
        <div
          className="set-cheer-ring absolute bottom-0 left-1/2 h-[70vw] w-[70vw] rounded-full border-2"
          style={{ borderColor: style.color }}
        />
      )}

      {motes.map((m, i) => (
        <span
          key={i}
          className="set-cheer-mote absolute bottom-[6vh] rounded-full"
          style={
            {
              left: `${m.left}vw`,
              width: m.size,
              height: m.size,
              background: style.color,
              animationDuration: m.duration,
              animationDelay: m.delay,
              '--dx': m.dx,
              '--dy': m.dy,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
