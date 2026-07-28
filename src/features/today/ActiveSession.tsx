import { useEffect, useMemo, useRef, useState } from 'react'
import { MdCheckCircle, MdChevronRight, MdRadioButtonUnchecked, MdTrackChanges } from 'react-icons/md'
import type { WorkoutSession } from '../../types'
import { useData } from '../../store/DataContext'
import { repRangeLabel, type PlannedExercise } from '../../config/plan'
import { nextTarget, type Target } from '../../lib/progression'
import { restBeforeNextSet } from '../../lib/rest'
import { formatDuration, remainingSecs, WORK_PER_SET_SEC } from '../../lib/estimate'
import { toISODate } from '../../lib/dates'
import { storage } from '../../services/storage'
import { useActiveSession } from './useActiveSession'
import { RestTimer } from '../../components/RestTimer'
import { PauseOverlay } from '../../components/PauseOverlay'
import { KebabMenu } from '../../components/KebabMenu'

type Props = {
  session: WorkoutSession
  controls: ReturnType<typeof useActiveSession>
  onFinish: (s: WorkoutSession) => void
  onSkip: () => void
}

/** One set of one exercise — the unit the guided workout flow steps through. */
type SetStep = {
  ex: PlannedExercise
  exIndex: number
  setIndex: number
  setCount: number
  stepKey: string
}

/** The active rest overlay's context: how long, what's next, and whether this is
 * the exercise's final rest (so we can offer "Add another set"). */
type RestInfo = {
  seconds: number
  exKey: string
  isLastSetOfExercise: boolean
  upNext: string | null
}

function toWeight(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function targetLabel(target: Target | undefined): string | null {
  if (!target) return null
  if (target.weightLbs == null) return `Target ${target.reps} reps`
  return `Target ${target.weightLbs} × ${target.reps}`
}

/** Guided, one-set-at-a-time workout flow with a built-in rest after each set. */
export function ActiveSession({ session, controls, onFinish, onSkip }: Props) {
  const { plan, workouts, durations, logSessionDuration } = useData()
  const [rest, setRest] = useState<RestInfo | null>(null)
  const [current, setCurrent] = useState(() => storage.loadActiveStep())
  const [showList, setShowList] = useState(false)
  const [paused, setPaused] = useState(false)
  // Accumulated time spent on the rest-timer screen (the "resting" slice of the
  // session). restStartRef marks when the current rest overlay opened.
  const restAccumSec = useRef(0)
  const restStartRef = useRef(0)

  const day = plan[session.dayType]
  const exercises = day.exercises

  const logFor = (key: string) => session.exercises.find((e) => e.exercise === key)
  const doneCount = (key: string) => logFor(key)?.sets.filter((s) => s.done && s.reps > 0).length ?? 0
  const isComplete = (key: string) => {
    const log = logFor(key)
    return !!log && log.sets.length > 0 && log.sets.every((s) => s.done && s.reps > 0)
  }

  // Flatten the workout into individual set-steps, one screen each. Driven by the
  // live log's set counts so an added/removed set reshapes the flow immediately.
  const steps = useMemo(() => {
    const out: SetStep[] = []
    exercises.forEach((ex, exIndex) => {
      const count = logFor(ex.key)?.sets.length ?? ex.sets
      for (let s = 0; s < count; s++) {
        out.push({ ex, exIndex, setIndex: s, setCount: count, stepKey: `${ex.key}:${s}` })
      }
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, session])

  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0
  const step = steps[safeCurrent]
  const planned = step.ex
  const log = logFor(planned.key)
  const set = log?.sets[step.setIndex]
  const atLast = safeCurrent >= N - 1

  useEffect(() => {
    storage.saveActiveStep(safeCurrent)
  }, [safeCurrent])

  const target: Target | undefined = useMemo(
    () =>
      nextTarget(workouts, planned.key, {
        repMin: planned.repMin,
        repMax: planned.repMax,
        bodyweight: planned.bodyweight,
        increment: planned.increment,
      }),
    [planned, workouts],
  )

  const totals = useMemo(() => {
    let done = 0
    let all = 0
    for (const e of exercises) {
      done += doneCount(e.key)
      all += logFor(e.key)?.sets.length ?? e.sets
    }
    return { done, all }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, session])

  const timeLeft = useMemo(() => {
    const fallbackItems = steps.slice(safeCurrent).map((s) => ({
      remainingSets: 1,
      workSec: WORK_PER_SET_SEC,
      restSec: s.ex.restSec,
    }))
    return remainingSecs({
      history: durations,
      sel: { kind: 'workout', dayType: session.dayType },
      doneSteps: totals.done,
      totalSteps: totals.all,
      fallbackItems,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, safeCurrent, session, durations, totals])

  const setExerciseComplete = (key: string, complete: boolean) => {
    const l = logFor(key)
    if (!l) return
    l.sets.forEach((_, i) => controls.updateSet(key, i, { done: complete }))
  }

  const finish = () => {
    if (session.startedAt) {
      void logSessionDuration({
        date: toISODate(new Date()),
        kind: 'workout',
        dayType: session.dayType,
        totalSec: (Date.now() - new Date(session.startedAt).getTime()) / 1000,
        restSec: restAccumSec.current,
      })
    }
    const cleaned: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((ex) => ex.sets.length > 0),
    }
    onFinish(cleaned)
  }

  // Accumulate the just-ended rest slice, then dismiss the overlay.
  const closeRest = () => {
    if (restStartRef.current) restAccumSec.current += (Date.now() - restStartRef.current) / 1000
    restStartRef.current = 0
    setRest(null)
  }

  // Mark the current set done and either rest into the next set or finish.
  const completeSetAndAdvance = () => {
    controls.updateSet(planned.key, step.setIndex, { done: true })
    if (atLast) {
      finish()
      return
    }
    // Carry this set's actual weight/reps forward to the next set of the same
    // exercise, so subsequent sets prefill what you just did (not the target).
    const nextStep = steps[safeCurrent + 1]
    if (nextStep && nextStep.ex.key === planned.key && set) {
      controls.updateSet(planned.key, nextStep.setIndex, { weightLbs: set.weightLbs ?? null, reps: set.reps })
    }
    const nextIsNewExercise = !!nextStep && nextStep.ex.key !== planned.key
    restStartRef.current = Date.now()
    setRest({
      // Full inter-set rest within an exercise, but a shorter transition rest
      // (sized to the next exercise, capped) when moving to a different move.
      seconds: restBeforeNextSet({
        currentRestSec: planned.restSec,
        sameExercise: !nextIsNewExercise,
        nextRestSec: nextStep ? nextStep.ex.restSec : null,
      }),
      exKey: planned.key,
      isLastSetOfExercise: step.setIndex === step.setCount - 1,
      upNext: nextIsNewExercise ? `Up next: ${nextStep!.ex.name}` : null,
    })
    setCurrent(safeCurrent + 1)
  }

  // Append a set to the exercise whose final rest is showing, then drop back to
  // logging. `current` already points at the slot the new set lands in.
  const addSetFromRest = () => {
    if (rest) controls.addSet(rest.exKey)
    closeRest()
  }

  const hint = targetLabel(target)
  const restLabel = planned.restSec >= 60 ? `${planned.restSec / 60} min` : `${planned.restSec}s`

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{planned.name}</h2>
        </div>
        <KebabMenu
          items={[
            { label: 'Pause workout', onClick: () => setPaused(true) },
            { label: 'Workout checklist', onClick: () => setShowList(true) },
            { label: 'Skip logging details (mark done)', onClick: onSkip },
            { label: 'Finish workout now', onClick: finish },
            {
              label: 'Discard workout',
              danger: true,
              onClick: () => {
                if (confirm('Discard this in-progress workout?')) controls.clear()
              },
            },
          ]}
        />
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${totals.all ? (totals.done / totals.all) * 100 : 0}%` }}
        />
      </div>

      <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {planned.group} · {planned.sets}×{repRangeLabel(planned)} · rest {restLabel}
      </p>

      {step.setIndex === step.setCount - 1 && (
        <p className="px-1 text-xs text-neutral-500">
          {exercises[step.exIndex + 1]
            ? `Up next: ${exercises[step.exIndex + 1].name}`
            : 'Last exercise — almost done'}
        </p>
      )}

      {set && (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          {hint && (
            <p className="flex items-center justify-center gap-1 text-sm font-medium text-accent">
              <MdTrackChanges aria-hidden />
              {hint}
            </p>
          )}
          <div className="flex items-end justify-center gap-3">
            <label className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {planned.bodyweight ? 'Added lbs' : 'Weight'}
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder={planned.bodyweight ? 'BW' : 'lbs'}
                value={set.weightLbs ?? ''}
                onChange={(e) => controls.updateSet(planned.key, step.setIndex, { weightLbs: toWeight(e.target.value) })}
                className="min-h-[64px] w-full rounded-xl bg-surface-2 px-2 text-center text-3xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <span className="pb-5 text-2xl text-neutral-600">×</span>
            <label className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Reps</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="reps"
                value={set.reps || ''}
                onChange={(e) => controls.updateSet(planned.key, step.setIndex, { reps: Number(e.target.value) || 0 })}
                className="min-h-[64px] w-full rounded-xl bg-surface-2 px-2 text-center text-3xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>
        </div>
      )}

      <button
        onClick={completeSetAndAdvance}
        className="mt-1 flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
      >
        {atLast ? (
          'Finish workout'
        ) : (
          <>
            Set done — rest <MdChevronRight className="text-2xl" aria-hidden />
          </>
        )}
      </button>

      {rest != null && (
        <RestTimer
          seconds={rest.seconds}
          upNext={rest.upNext}
          timeLeftLabel={formatDuration(timeLeft)}
          onAddSet={rest.isLastSetOfExercise ? addSetFromRest : undefined}
          onClose={closeRest}
        />
      )}

      {paused && <PauseOverlay label="Workout paused" onResume={() => setPaused(false)} />}

      {showList && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setShowList(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-1 text-lg font-bold">Workout checklist</h3>
            <p className="mb-3 text-xs text-neutral-500">Tap a name to jump; tap the circle to mark done.</p>
            <div className="flex flex-col gap-1">
              {exercises.map((e, i) => {
                const complete = isComplete(e.key)
                const firstStep = steps.findIndex((s) => s.exIndex === i)
                return (
                  <div
                    key={e.key}
                    className={`flex items-center gap-2 rounded-xl px-2 ${step.exIndex === i ? 'bg-surface-2' : ''}`}
                  >
                    <button
                      onClick={() => {
                        if (firstStep >= 0) setCurrent(firstStep)
                        setShowList(false)
                      }}
                      className="flex-1 py-3 text-left active:opacity-70"
                    >
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{e.group}</span>
                      <span className="block font-medium">{e.name}</span>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {doneCount(e.key)}/{logFor(e.key)?.sets.length ?? e.sets} sets
                      </span>
                    </button>
                    <button
                      onClick={() => setExerciseComplete(e.key, !complete)}
                      aria-label={complete ? 'mark incomplete' : 'mark complete'}
                      className="p-2 text-2xl"
                    >
                      {complete ? (
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
