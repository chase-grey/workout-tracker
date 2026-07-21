import { useEffect, useMemo, useState } from 'react'
import { MdCheckCircle, MdChevronRight, MdPhotoCamera, MdRadioButtonUnchecked } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { RestTimer } from '../../components/RestTimer'
import { PauseOverlay } from '../../components/PauseOverlay'
import { RhythmGuide } from '../../components/RhythmGuide'
import { KebabMenu } from '../../components/KebabMenu'
import { MeasureSheet } from './MeasureSheet'
import { CameraMeasure } from './CameraMeasure'
import { estimateSecs, formatDuration } from '../../lib/estimate'
import { buildFlexSteps } from '../../lib/flexSteps'
import { type MeasureMode } from '../../lib/measure'
import { storage } from '../../services/storage'

const SEC_PER_REP = 5

/** Which angle a stretch's photo measurement defaults to (user can switch). */
const measureModeFor = (exKey: string): MeasureMode =>
  exKey.toLowerCase().includes('tailor') ? 'tailors' : 'split'

/** Guided, one-set-at-a-time stretch flow with a tempo rhythm animation. */
export function StretchSession({ onClose }: { onClose: () => void }) {
  const { flexPlan, logFlex } = useData()
  const [current, setCurrent] = useState(() => storage.loadStretch()?.step ?? 0)
  const [done, setDone] = useState<Set<string>>(() => new Set(storage.loadStretch()?.done ?? []))
  const [rest, setRest] = useState<number | null>(null)
  const [showList, setShowList] = useState(false)
  const [showMeasure, setShowMeasure] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [paused, setPaused] = useState(false)

  const steps = useMemo(() => buildFlexSteps(flexPlan), [flexPlan])
  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0

  useEffect(() => {
    storage.saveStretch({ step: safeCurrent, done: [...done] })
  }, [safeCurrent, done])

  const completed = useMemo(() => steps.filter((s) => done.has(s.stepKey)).length, [steps, done])

  const timeLeft = useMemo(() => {
    const items = steps
      .filter((s) => !done.has(s.stepKey))
      .map((s) => ({ remainingSets: 1, workSec: s.reps * SEC_PER_REP, restSec: s.restSec }))
    return estimateSecs(items)
  }, [steps, done])

  if (N === 0) {
    return (
      <div className="flex flex-col gap-4 pb-24 pt-16 text-center">
        <p className="text-neutral-500">No stretches in your routine. Add some in Settings → Edit stretch routine.</p>
        <button onClick={onClose} className="min-h-[44px] rounded-xl bg-surface font-medium">
          Back
        </button>
      </div>
    )
  }

  const step = steps[safeCurrent]
  const atLast = safeCurrent >= N - 1

  const toggleDone = (key: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const completeSetAndAdvance = () => {
    setDone((prev) => new Set(prev).add(step.stepKey))
    if (atLast) {
      void logFlex({ note: 'Stretch routine' })
      onClose()
    } else {
      setRest(step.restSec)
      setCurrent(safeCurrent + 1)
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{step.exName}</h2>
          <p className="text-sm text-neutral-500">
            Set {step.round + 1} of {step.maxSets} · {formatDuration(timeLeft)} left
          </p>
        </div>
        <KebabMenu
          items={[
            { label: 'Pause routine', onClick: () => setPaused(true) },
            { label: 'Log measurement', onClick: () => setShowMeasure(true) },
            { label: 'Routine checklist', onClick: () => setShowList(true) },
            {
              label: 'Skip logging details (mark done)',
              onClick: () => {
                void logFlex({ note: 'Stretch session' })
                onClose()
              },
            },
            {
              label: 'Finish & log session',
              onClick: () => {
                void logFlex({ note: 'Stretch routine' })
                onClose()
              },
            },
            { label: 'Exit without logging', danger: true, onClick: onClose },
          ]}
        />
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${(completed / N) * 100}%` }} />
      </div>

      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {step.blockLabel} · {step.reps} reps
      </p>

      <RhythmGuide key={step.stepKey} tempo={step.tempo} reps={step.reps} />

      <button
        onClick={completeSetAndAdvance}
        className="mt-1 flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
      >
        {atLast ? (
          'Finish & log session'
        ) : (
          <>
            Set done — rest <MdChevronRight className="text-2xl" aria-hidden />
          </>
        )}
      </button>

      <button
        onClick={() => setShowCamera(true)}
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-border bg-surface font-semibold text-neutral-200 active:opacity-80"
      >
        <MdPhotoCamera aria-hidden /> Measure with camera
      </button>

      {rest != null && <RestTimer seconds={rest} onClose={() => setRest(null)} />}
      {paused && <PauseOverlay label="Routine paused" onResume={() => setPaused(false)} />}
      {showMeasure && <MeasureSheet onClose={() => setShowMeasure(false)} />}
      {showCamera && (
        <CameraMeasure
          mode={measureModeFor(step.exKey)}
          onClose={() => setShowCamera(false)}
          onDone={(result) => {
            void logFlex({ ...result, note: 'measurement' })
            setShowCamera(false)
          }}
        />
      )}

      {showList && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setShowList(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-1 text-lg font-bold">Routine checklist</h3>
            <p className="mb-3 text-xs text-neutral-500">Tap a set to jump; tap the circle to mark it done.</p>
            <div className="flex flex-col gap-1">
              {steps.map((s, i) => {
                const isDone = done.has(s.stepKey)
                return (
                  <div
                    key={s.stepKey}
                    className={`flex items-center gap-2 rounded-xl px-2 ${i === safeCurrent ? 'bg-surface-2' : ''}`}
                  >
                    <button
                      onClick={() => {
                        setCurrent(i)
                        setShowList(false)
                      }}
                      className="flex-1 py-3 text-left active:opacity-70"
                    >
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{s.blockLabel}</span>
                      <span className="block font-medium">
                        {s.exName} · set {s.round + 1}
                      </span>
                    </button>
                    <button
                      onClick={() => toggleDone(s.stepKey)}
                      aria-label={isDone ? 'mark incomplete' : 'mark complete'}
                      className="p-2 text-2xl"
                    >
                      {isDone ? (
                        <MdCheckCircle className="text-accent-2" aria-hidden />
                      ) : (
                        <MdRadioButtonUnchecked className="text-neutral-600" aria-hidden />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
