import { useEffect, useMemo, useRef, useState } from 'react'
import { MdCheckCircle, MdChevronRight, MdPhotoCamera, MdRadioButtonUnchecked, MdTrackChanges } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { RestTimer } from '../../components/RestTimer'
import { GetReady } from '../../components/GetReady'
import { PauseOverlay } from '../../components/PauseOverlay'
import { RhythmGuide } from '../../components/RhythmGuide'
import { KebabMenu } from '../../components/KebabMenu'
import { MeasureSheet } from './MeasureSheet'
import { CameraMeasure } from './CameraMeasure'
import { formatDuration, remainingSecs } from '../../lib/estimate'
import { buildSessionSteps, type CoreSetStep } from '../../lib/flexSteps'
import { type MeasureMode } from '../../lib/measure'
import { canResumeRest } from '../../lib/rest'
import { storage, type RestState } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { DEAD_BUG, repRangeLabel } from '../../config/plan'
import { nextTarget } from '../../lib/progression'

const SEC_PER_REP = 5

/** Seconds to get into position at the start and after each rest, before the pace starts. */
const GET_READY_SEC = 5

/** Which angle a stretch's photo measurement defaults to (user can switch). */
const measureModeFor = (exKey: string): MeasureMode =>
  exKey.toLowerCase().includes('tailor') ? 'tailors' : 'split'

/**
 * Only tailor's pose and horse squats have a meaningful camera-measurable angle
 * (tailor's angle / straddle split). The pancake hang has none, so we hide the
 * "Measure with camera" button there.
 */
const canMeasureFor = (exKey: string): boolean => {
  const k = exKey.toLowerCase()
  return k.includes('tailor') || k.includes('horse')
}

/**
 * Guided, one-set-at-a-time Stretch + Core flow: the mobility routine (with a
 * tempo rhythm animation) followed by a dead-bug core block whose reps are
 * logged as workout rows. Finishing counts as a stretch/flex day.
 */
export function StretchSession({ onClose }: { onClose: () => void }) {
  const { flexPlan, workouts, logFlex, logCore, durations, logSessionDuration } = useData()
  // The whole flow resumes from this snapshot, read once on mount: an app switch
  // or accidental refresh drops you back where you were, not at the top.
  const [saved] = useState(() => storage.loadStretch())
  const [current, setCurrent] = useState(saved?.step ?? 0)
  const [done, setDone] = useState<Set<string>>(() => new Set(saved?.done ?? []))
  const [coreReps, setCoreReps] = useState<Record<number, number>>(() => saved?.coreReps ?? {})
  // Rep the current stretch set has reached, persisted so a refresh mid-set
  // resumes the count instead of restarting at rep 1.
  const [rep, setRep] = useState(saved?.rep ?? 1)
  // A rest still running when the app closed picks up its real remaining time
  // (it's wall-clock based, so the time away counts) unless it's long stale.
  const [rest, setRest] = useState<RestState | null>(() =>
    saved?.rest && canResumeRest(saved.rest.endsAt, Date.now()) ? saved.rest : null,
  )
  // True so the routine opens with the same "get into position" countdown that
  // follows each rest — but not over a resumed rest, which owns the screen first.
  const [preparing, setPreparing] = useState(rest == null)
  const [showList, setShowList] = useState(false)
  const [showMeasure, setShowMeasure] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [paused, setPaused] = useState(false)
  // When the routine began (persisted so a resumed session still measures its
  // full length) and accumulated time spent on the rest screen.
  const [startedAt] = useState(saved?.startedAt)
  const restAccumSec = useRef(0)
  // Initial value only: a resumed rest began before the reload, so credit it from
  // its real start rather than from now.
  const restStartRef = useRef(rest ? rest.endsAt - rest.seconds * 1000 : 0)

  const steps = useMemo(() => buildSessionSteps(flexPlan), [flexPlan])
  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0

  // Progression target reps for the dead-bug sets (prefilled, editable).
  const coreTarget = useMemo(
    () =>
      nextTarget(workouts, DEAD_BUG.key, {
        repMin: DEAD_BUG.repMin,
        repMax: DEAD_BUG.repMax,
        bodyweight: DEAD_BUG.bodyweight,
        increment: DEAD_BUG.increment,
      }).reps,
    [workouts],
  )
  const coreRepsFor = (round: number) => coreReps[round] ?? coreTarget

  useEffect(() => {
    storage.saveStretch({ step: safeCurrent, done: [...done], startedAt, coreReps, rep, rest })
  }, [safeCurrent, done, startedAt, coreReps, rep, rest])

  const completed = useMemo(() => steps.filter((s) => done.has(s.stepKey)).length, [steps, done])

  const timeLeft = useMemo(() => {
    const fallbackItems = steps
      .filter((s) => !done.has(s.stepKey))
      .map((s) => ({
        remainingSets: 1,
        workSec: (s.kind === 'flex' ? s.reps : coreTarget) * SEC_PER_REP,
        restSec: s.restSec,
      }))
    return remainingSecs({
      history: durations,
      sel: { kind: 'stretch' },
      doneSteps: completed,
      totalSteps: N,
      fallbackItems,
    })
  }, [steps, done, durations, completed, N, coreTarget])

  // Record the finished routine's length once, for time-left learning + reporting.
  const recordDuration = () => {
    if (!startedAt) return
    void logSessionDuration({
      date: toISODate(new Date()),
      kind: 'stretch',
      totalSec: (Date.now() - new Date(startedAt).getTime()) / 1000,
      restSec: restAccumSec.current,
    })
  }

  // Finish the session: log the completed dead-bug sets as workout rows (reps)
  // and record the stretch/flex day. `doneSet` is passed explicitly so the set
  // just completed is included without waiting for the state update.
  const finishWith = (doneSet: Set<string>) => {
    recordDuration()
    const reps = steps
      .filter((s): s is CoreSetStep => s.kind === 'core' && doneSet.has(s.stepKey))
      .map((s) => coreRepsFor(s.round))
    void logCore(reps)
    void logFlex({ note: 'Stretch + Core' })
    onClose()
  }

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

  /** Move to a different set — each one starts its rep count over. */
  const goToStep = (i: number) => {
    setCurrent(i)
    setRep(1)
  }

  const completeSetAndAdvance = () => {
    const nextDone = new Set(done).add(step.stepKey)
    setDone(nextDone)
    if (atLast) {
      finishWith(nextDone)
    } else {
      restStartRef.current = Date.now()
      setRest({ seconds: step.restSec, endsAt: Date.now() + step.restSec * 1000 })
      goToStep(safeCurrent + 1)
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{step.exName}</h2>
          <p className="text-sm text-neutral-500">
            set {step.round + 1} of {step.maxSets}
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
                recordDuration()
                void logFlex({ note: 'Stretch + Core' })
                onClose()
              },
            },
            {
              label: 'Finish & log session',
              onClick: () => finishWith(done),
            },
            { label: 'Exit without logging', danger: true, onClick: onClose },
          ]}
        />
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${(completed / N) * 100}%` }} />
      </div>

      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {step.kind === 'flex' ? `${step.reps} reps` : `${repRangeLabel(step)} reps`}
      </p>

      {step.kind === 'flex' ? (
        <RhythmGuide
          key={step.stepKey}
          tempo={step.tempo}
          reps={step.reps}
          running={rest == null && !preparing && !paused}
          startRep={rep}
          onRep={setRep}
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          <p className="flex items-center justify-center gap-1 text-sm font-medium text-accent">
            <MdTrackChanges aria-hidden />
            Target {coreTarget} reps
          </p>
          <label className="mx-auto flex flex-col items-center gap-1">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Reps</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="reps"
              value={coreRepsFor(step.round) || ''}
              onChange={(e) =>
                setCoreReps((prev) => ({ ...prev, [step.round]: Number(e.target.value) || 0 }))
              }
              className="min-h-[64px] w-40 rounded-xl bg-surface-2 px-2 text-center text-3xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        </div>
      )}

      <button
        onClick={completeSetAndAdvance}
        className="mt-1 flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
      >
        {atLast ? (
          'Finish & log session'
        ) : (
          <>
            done <MdChevronRight className="text-2xl" aria-hidden />
          </>
        )}
      </button>

      {step.kind === 'flex' && canMeasureFor(step.exKey) && (
        <button
          onClick={() => setShowCamera(true)}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-border bg-surface font-semibold text-neutral-200 active:opacity-80"
        >
          <MdPhotoCamera aria-hidden /> Measure with camera
        </button>
      )}

      {rest != null && (
        <RestTimer
          seconds={rest.seconds}
          endsAt={rest.endsAt}
          timeLeftLabel={`${formatDuration(timeLeft)} left`}
          onClose={() => {
            if (restStartRef.current) restAccumSec.current += (Date.now() - restStartRef.current) / 1000
            restStartRef.current = 0
            setRest(null)
            setPreparing(true)
          }}
        />
      )}
      {preparing && <GetReady seconds={GET_READY_SEC} onDone={() => setPreparing(false)} />}
      {paused && <PauseOverlay label="Routine paused" onResume={() => setPaused(false)} />}
      {showMeasure && <MeasureSheet onClose={() => setShowMeasure(false)} />}
      {showCamera && step.kind === 'flex' && (
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
                        goToStep(i)
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
