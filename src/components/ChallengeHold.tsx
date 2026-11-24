import { useEffect, useRef, useState } from 'react'
import { holdClock, holdDial } from '../lib/holdChallenge'

const R = 74
const C = 2 * Math.PI * R
const OVER_R = 91
const OVER_C = 2 * Math.PI * OVER_R

/** A point on a circle of radius `r` about the dial's centre, `turn` of the way round from the top. */
const at = (turn: number, r: number) => {
  const a = turn * 2 * Math.PI - Math.PI / 2
  return { x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a) }
}

/**
 * The clock for an open hold: one with nothing prescribed, held until a tap
 * ends it and logged at what it read (see lib/holdChallenge — the RKC plank).
 *
 * It counts UP, on the clock at the foot of the screen, and the dial over it is
 * the challenge time: one lap is the time to beat, so the hold can be watched
 * closing on it. The ring thickens and brightens as it comes round — most of
 * that in the last stretch — a tick marks where the last hold ended, and a buzz
 * marks the target going by. Then it keeps going: the ring holds full and
 * breathes, and every further lap of the same length is drawn outside it, so a
 * hold that runs on is still moving at the pace it built at.
 *
 * Nothing here ends the set. Wall-clock based, banking its seconds when
 * `running` drops, exactly as HoldTimer does and for the same reasons.
 */
export function ChallengeHold({
  targetSec,
  lastSec,
  running,
  onTick,
}: {
  /** The challenge time: one lap of the dial. */
  targetSec: number
  /** Where the last hold ended, marked on the lap; null with none to mark. */
  lastSec: number | null
  /** The set is on screen and the hold is being held. */
  running: boolean
  /** The seconds held so far, every frame — what the caller logs when the set ends. */
  onTick: (heldSec: number) => void
}) {
  const runSince = useRef<number | null>(null)
  const bankedMs = useRef(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const buzzed = useRef(false)
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    if (!running) {
      if (runSince.current != null) {
        bankedMs.current += Date.now() - runSince.current
        runSince.current = null
        setElapsedMs(bankedMs.current)
        onTickRef.current(bankedMs.current / 1000)
      }
      return
    }
    const since = Date.now()
    runSince.current = since
    let frame = 0
    const tick = () => {
      const ms = bankedMs.current + (Date.now() - since)
      setElapsedMs(ms)
      onTickRef.current(ms / 1000)
      frame = requestAnimationFrame(tick)
    }
    tick()
    // Frames stop while the tab is hidden; the clock is read off the wall, so the
    // first frame back is right without help.
    return () => cancelAnimationFrame(frame)
  }, [running])

  const elapsed = elapsedMs / 1000
  const dial = holdDial(elapsed, targetSec)

  useEffect(() => {
    if (buzzed.current || !dial.hit) return
    buzzed.current = true
    navigator.vibrate?.([200, 80, 200])
  }, [dial.hit])

  const tip = at(dial.fill, R)
  const overTip = at(dial.overFill, OVER_R)
  const mark = lastSec != null && lastSec > 0 && lastSec < targetSec ? lastSec / targetSec : null
  const width = 7 + 6 * dial.heat

  return (
    <div className="hold-timer challenge-hold flex flex-col items-center">
      <div className="hold-visual">
        <svg viewBox="0 0 200 200" className="challenge-dial text-accent" aria-hidden>
          {/* The lap still to come. */}
          <circle cx="100" cy="100" r={R} fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="7" />
          {/* Where the last hold ended: the first thing to get past. */}
          {mark != null && (
            <line
              x1={at(mark, R - 12).x}
              y1={at(mark, R - 12).y}
              x2={at(mark, R + 12).x}
              y2={at(mark, R + 12).y}
              stroke="#ffffff"
              strokeOpacity={elapsed >= (lastSec ?? 0) ? 0.35 : 0.9}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}
          {/* The hold so far, gathering as it closes on the target. */}
          <g className={dial.hit ? 'challenge-dial-hit' : undefined}>
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.55 + 0.45 * dial.heat}
              strokeWidth={width}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - dial.fill)}
              transform="rotate(-90 100 100)"
            />
          </g>
          {!dial.hit && elapsed > 0 && <circle cx={tip.x} cy={tip.y} r={width / 2 + 2} className="fill-accent-bright" />}
          {/* Past the target: laps of the same length, outside the first. */}
          {dial.overLaps > 0 && (
            <circle cx="100" cy="100" r={OVER_R} fill="none" className="stroke-accent-bright" strokeOpacity="0.4" strokeWidth="4" />
          )}
          {dial.hit && (
            <>
              <circle
                cx="100"
                cy="100"
                r={OVER_R}
                fill="none"
                className="stroke-accent-bright"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={OVER_C}
                strokeDashoffset={OVER_C * (1 - dial.overFill)}
                transform="rotate(-90 100 100)"
              />
              <circle cx={overTip.x} cy={overTip.y} r="4.5" className="fill-accent-bright" />
            </>
          )}
          {/* The time to beat, and once beaten, by how much. */}
          <text x="100" y="92" textAnchor="middle" className="fill-neutral-400" fontSize="13" fontWeight="600">
            {dial.hit ? 'past' : 'beat'}
          </text>
          <text
            x="100"
            y="124"
            textAnchor="middle"
            className={dial.hit ? 'fill-accent-bright' : 'fill-neutral-50'}
            fontSize="34"
            fontWeight="700"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {dial.hit ? `+${holdClock(dial.overSec)}` : holdClock(targetSec)}
          </text>
        </svg>
      </div>
      <div
        role="timer"
        className="pb-[calc(1rem+env(safe-area-inset-bottom))] font-mono text-7xl font-bold tabular-nums text-accent"
      >
        {holdClock(elapsed)}
      </div>
    </div>
  )
}
