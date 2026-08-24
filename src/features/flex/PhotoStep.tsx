import { useState } from 'react'
import { MdCheckCircle, MdChevronRight, MdPhotoCamera } from 'react-icons/md'
import { CameraMeasure } from './CameraMeasure'
import { AngleContextCard } from './AngleContextCard'
import { useData } from '../../store/DataContext'
import { PHOTO_SHOT, type PhotoGate, type PhotoKind } from '../../lib/photoSteps'
import { summarizeResult, type MeasureResult } from '../../lib/measure'
import { angleTrends, type AngleTrend } from '../../lib/angleContext'
import { toISODate } from '../../lib/dates'

/**
 * A photo screen in the stretch flow: one row per shot the moment calls for,
 * each opening the camera. It owns the screen while it's up — the routine's
 * rhythm and rest clock are both held — and every shot is optional, so the
 * footer button moves on whether or not any were taken. `onDone` is told whether
 * any shot was actually taken, so the routine can allow for the time it takes to
 * put the phone down and get back into position.
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
  const [open, setOpen] = useState<PhotoKind | null>(null)
  // Summary of each shot taken on this screen, e.g. "92°" — retaking replaces it.
  const [taken, setTaken] = useState<Partial<Record<PhotoKind, string>>>({})
  const anyTaken = Object.keys(taken).length > 0
  // The reading just taken, held on its own card until it's been read. `last`
  // says whether dismissing it also finishes the screen.
  const [context, setContext] = useState<{ trends: AngleTrend[]; last: boolean } | null>(null)

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
          onClick={() => onDone(anyTaken)}
          className="flex min-h-[56px] w-full items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          {anyTaken ? 'continue' : 'skip'}
          <MdChevronRight className="text-2xl" aria-hidden />
        </button>
      </div>

      {open && (
        <CameraMeasure
          mode={PHOTO_SHOT[open].mode}
          temp={PHOTO_SHOT[open].cold ? 'cold' : 'warm'}
          onClose={() => setOpen(null)}
          onDone={(result) => {
            const shot = PHOTO_SHOT[open]
            // Read the history before the capture is logged, so the reading is
            // compared against the sessions before it rather than itself.
            const trends = angleTrends(
              flexEntries,
              result,
              shot.cold ? 'cold' : 'warm',
              toISODate(new Date()),
            )
            onCapture(open, result)
            const next = { ...taken, [open]: summarizeResult(shot.mode, result) }
            setTaken(next)
            setOpen(null)
            const last = gate.shots.every((k) => next[k])
            // The measurement gets its own card first; only then does the screen
            // move on — automatically, once every shot it asked for is in.
            if (trends.length > 0) setContext({ trends, last })
            else if (last) onDone(true)
          }}
        />
      )}

      {context && (
        <AngleContextCard
          trends={context.trends}
          onDismiss={() => {
            setContext(null)
            if (context.last) onDone(true)
          }}
        />
      )}
    </div>
  )
}
