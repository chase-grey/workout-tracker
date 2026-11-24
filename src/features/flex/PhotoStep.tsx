import { useState } from 'react'
import { CameraMeasure } from './CameraMeasure'
import { BurstCapture } from './BurstCapture'
import type { BurstFrame } from './camera'
import { useData } from '../../store/DataContext'
import {
  BURST_FIRST_SEC,
  BURST_NEXT_SEC,
  PHOTO_SHOT,
  type PhotoGate,
  type PhotoKind,
} from '../../lib/photoSteps'
import { firstBurst } from '../../lib/photoCadence'
import type { MeasureResult } from '../../lib/measure'
import { angleTrends } from '../../lib/angleContext'
import { toISODate } from '../../lib/dates'

/**
 * A photo moment in the stretch flow: the camera, opened straight onto each shot
 * the moment calls for, one after another in the gate's order. It owns the
 * screen while it's up — the routine's rhythm and rest clock are both held — and
 * every shot is optional, so skipping moves on to the next. `onDone` is told
 * whether any shot was actually taken, so the routine can allow for the time it
 * takes to put the phone down and get back into position.
 *
 * A burst gate takes every photo first, back to back off one timer, and then
 * measures each of the shots it got in the same order. The first time anyone
 * meets one it's taken like any other gate instead — a shot, its reading, the
 * next shot — and closes on a word about the run it'll be from then on.
 */
export function PhotoStep({
  gate,
  onCapture,
  onDone,
  offerNever = true,
}: {
  gate: PhotoGate
  onCapture: (kind: PhotoKind, result: MeasureResult) => void
  onDone: (tookAny: boolean) => void
  /**
   * Whether the screen offers to stop asking for photos. A routine's photo
   * moments do; a photo that was asked for (a goal tapped on the progress tab)
   * has nothing to stop.
   */
  offerNever?: boolean
}) {
  const { flexEntries, settings, updateSettings } = useData()
  const never = offerNever
    ? () => {
        updateSettings({ ...settings, photosOff: true })
        onDone(false)
      }
    : undefined
  // Settled once, on the way in: the first shot logged would otherwise end the
  // walkthrough it's part of.
  const [walkthrough] = useState(() => firstBurst(gate, flexEntries))
  // The shots to measure, each with its frame if a burst already took it. A
  // burst's are unknown until it's done.
  const [queue, setQueue] = useState<{ kind: PhotoKind; frame?: BurstFrame }[] | null>(() =>
    gate.burst && !walkthrough ? null : gate.shots.map((kind) => ({ kind })),
  )
  const [at, setAt] = useState(0)
  const [tookAny, setTookAny] = useState(false)
  const [outro, setOutro] = useState(false)

  if (!queue) {
    return (
      <div className="fixed inset-0 z-70">
        <BurstCapture
          shots={gate.shots}
          onNever={never}
          onDone={(frames) => {
            const taken = gate.shots.flatMap((kind, i) => {
              const frame = frames[i]
              return frame ? [{ kind, frame }] : []
            })
            if (taken.length === 0) onDone(false)
            else setQueue(taken)
          }}
        />
      </div>
    )
  }

  if (outro) {
    return (
      <div className="fixed inset-0 z-70 flex flex-col bg-bg px-4 pt-8">
        <h2 className="text-xl font-bold">{gate.title}</h2>
        <p className="mt-4 text-lg">
          Next time these get taken back to back. One timer: {BURST_FIRST_SEC} seconds to get
          into the first pose, then {BURST_NEXT_SEC} to move to each one after. The screen
          flashes white when it's time to switch.
        </p>
        <div className="flex-1" />
        <button
          onClick={() => onDone(true)}
          className="min-h-[56px] rounded-2xl bg-accent text-lg font-bold text-on-accent active:opacity-80"
          style={{ marginBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          ok
        </button>
      </div>
    )
  }

  const { kind, frame } = queue[at]
  const shot = PHOTO_SHOT[kind]
  const temp = shot.cold ? 'cold' : 'warm'
  // Posture is neither: nothing on the photo or its file says cold.
  const shown = shot.plain ? undefined : temp
  const left = queue.length - at

  // A walkthrough that took a photo is the last one there'll be, so it says what
  // comes next on the way out. Skipped throughout, there's been nothing to learn
  // from, and the next time is still the first.
  const finish = (any: boolean) => {
    if (walkthrough && any && queue.length > 1) setOutro(true)
    else onDone(any)
  }

  const next = (took: boolean) => {
    const any = tookAny || took
    if (left <= 1) finish(any)
    else {
      setTookAny(any)
      setAt(at + 1)
    }
  }

  return (
    // Above the rest overlay (z-50).
    <div className="fixed inset-0 z-70">
      <CameraMeasure
        // A fresh camera per shot, so nothing from the last one carries over.
        key={kind}
        mode={shot.mode}
        temp={shown}
        // Says what the camera is up for: the pose's name alone, over a black
        // screen, didn't.
        title={`measure ${shot.label}`}
        frame={frame}
        // Read the history before the capture is logged, so the reading is
        // compared against the sessions before it rather than itself.
        contextFor={(result) => angleTrends(flexEntries, result, temp, toISODate(new Date()))}
        onDone={(result) => {
          onCapture(kind, result)
          next(true)
        }}
        onSkip={() => next(false)}
        onSkipAll={left > 1 ? () => finish(tookAny) : undefined}
        onNever={never}
      />
    </div>
  )
}
