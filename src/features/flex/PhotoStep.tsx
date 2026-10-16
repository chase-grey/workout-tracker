import { useState } from 'react'
import { CameraMeasure } from './CameraMeasure'
import { useData } from '../../store/DataContext'
import { PHOTO_SHOT, type PhotoGate, type PhotoKind } from '../../lib/photoSteps'
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
 */
export function PhotoStep({
  gate,
  onCapture,
  onDone,
}: {
  gate: PhotoGate
  onCapture: (kind: PhotoKind, result: MeasureResult) => void
  onDone: (tookAny: boolean) => void
}) {
  const { flexEntries } = useData()
  const [at, setAt] = useState(0)
  const [tookAny, setTookAny] = useState(false)
  const kind = gate.shots[at]
  const shot = PHOTO_SHOT[kind]
  const temp = shot.cold ? 'cold' : 'warm'
  const left = gate.shots.length - at

  const next = (took: boolean) => {
    const any = tookAny || took
    if (left <= 1) onDone(any)
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
        temp={temp}
        title={shot.label}
        // Read the history before the capture is logged, so the reading is
        // compared against the sessions before it rather than itself.
        contextFor={(result) => angleTrends(flexEntries, result, temp, toISODate(new Date()))}
        onDone={(result) => {
          onCapture(kind, result)
          next(true)
        }}
        onSkip={() => next(false)}
        onSkipAll={left > 1 ? () => onDone(tookAny) : undefined}
      />
    </div>
  )
}
