import { useState } from 'react'
import { MdCheckCircle, MdChevronRight, MdPhotoCamera } from 'react-icons/md'
import { CameraMeasure } from './CameraMeasure'
import { PHOTO_SHOT, type PhotoGate, type PhotoKind } from '../../lib/photoSteps'
import { summarizeResult, type MeasureResult } from '../../lib/measure'

/**
 * A photo screen in the stretch flow: one row per shot the moment calls for,
 * each opening the camera. It owns the screen while it's up — the routine's
 * rhythm and rest clock are both held — and every shot is optional, so the
 * footer button moves on whether or not any were taken.
 */
export function PhotoStep({
  gate,
  onCapture,
  onDone,
}: {
  gate: PhotoGate
  onCapture: (kind: PhotoKind, result: MeasureResult) => void
  onDone: () => void
}) {
  const [open, setOpen] = useState<PhotoKind | null>(null)
  // Summary of each shot taken on this screen, e.g. "92°" — retaking replaces it.
  const [taken, setTaken] = useState<Partial<Record<PhotoKind, string>>>({})
  const anyTaken = Object.keys(taken).length > 0

  return (
    // Above the rest overlay (z-50) and the measure sheet (z-60).
    <div className="fixed inset-0 z-70 flex flex-col bg-bg px-4 pt-8">
      <h2 className="text-xl font-bold">{gate.title}</h2>

      <div className="mt-5 flex flex-col gap-2">
        {gate.shots.map((kind) => {
          const shot = PHOTO_SHOT[kind]
          const summary = taken[kind]
          return (
            <button
              key={kind}
              onClick={() => setOpen(kind)}
              className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left active:opacity-80"
            >
              {summary ? (
                <MdCheckCircle className="text-2xl text-accent-2" aria-hidden />
              ) : (
                <MdPhotoCamera className="text-2xl text-neutral-400" aria-hidden />
              )}
              <span className="flex-1 font-semibold">{shot.label}</span>
              {summary && <span className="tabular-nums text-accent-2">{summary}</span>}
            </button>
          )
        })}
      </div>

      <div
        className="mt-auto pt-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={onDone}
          className="flex min-h-[56px] w-full items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          {anyTaken ? 'continue' : 'skip'}
          <MdChevronRight className="text-2xl" aria-hidden />
        </button>
      </div>

      {open && (
        <CameraMeasure
          mode={PHOTO_SHOT[open].mode}
          onClose={() => setOpen(null)}
          onDone={(result) => {
            onCapture(open, result)
            const next = { ...taken, [open]: summarizeResult(PHOTO_SHOT[open].mode, result) }
            setTaken(next)
            setOpen(null)
            // Every shot this screen asked for is in — move on without a tap.
            if (gate.shots.every((k) => next[k])) onDone()
          }}
        />
      )}
    </div>
  )
}
