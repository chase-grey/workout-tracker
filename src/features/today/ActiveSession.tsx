import { useEffect, useMemo, useRef, useState } from 'react'
import { MdBolt, MdCheckCircle, MdChevronRight, MdRadioButtonUnchecked, MdTrackChanges } from 'react-icons/md'
import type { WorkoutSession } from '../../types'
import { useData } from '../../store/DataContext'
import { repRangeLabel, type PlannedExercise } from '../../config/plan'
import { nextTarget, type Target } from '../../lib/progression'
import { isChallenge } from '../../lib/challenge'
import { canResumeRest, restBeforeNextSet } from '../../lib/rest'
import {
  formatDuration,
  remainingWorkoutSecs,
  WORK_PER_SET_SEC,
  type ExerciseTimeSample,
} from '../../lib/estimate'
import { toISODate } from '../../lib/dates'
import { storage, type ActiveRest } from '../../services/storage'
import { useActiveSession } from './useActiveSession'
import { RestTimer } from '../../components/RestTimer'
import { SessionProgress } from '../../components/SessionProgress'
import { PauseOverlay } from '../../components/PauseOverlay'
import { KebabMenu, type MenuItem } from '../../components/KebabMenu'

type Props = {
  session: WorkoutSession
  controls: ReturnType<typeof useActiveSession>
  onFinish: (s: WorkoutSession, duration: { totalSec: number; restSec: number }) => void
  onSkip: () => void
  /** Drop back to the rest of the app with the workout still running. */
  onMinimize: () => void
}

/** Reject per-set active times outside this range (app left open / mis-taps). */
const MIN_SET_ACTIVE_SEC = 3
const MAX_SET_ACTIVE_SEC = 20 * 60

/** One set of one exercise — the unit the guided workout flow steps through. */
type SetStep = {
  ex: PlannedExercise
  exIndex: number
  setIndex: number
  setCount: number
  stepKey: string
}

function toWeight(v: string): number | null {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function targetLabel(target: Target | undefined): string | null {
  if (!target) return null
  if (target.weightLbs == null) return `target ${target.reps} reps`
  return `target ${target.weightLbs} × ${target.reps}`
}

/** Guided, one-set-at-a-time workout flow with a built-in rest after each set. */
export function ActiveSession({ session, controls, onFinish, onSkip, onMinimize }: Props) {
  const { plan, workouts, exerciseAverages, logSessionDuration, logExerciseTimes } = useData()
  // A rest still running when the app closed resumes with its real remaining
  // time (it's wall-clock based, so the time away counts) unless it's long stale.
  const [rest, setRest] = useState<ActiveRest | null>(() => {
    const saved = storage.loadActiveRest()
    return saved && canResumeRest(saved.endsAt, Date.now()) ? saved : null
  })
  const [current, setCurrent] = useState(() => storage.loadActiveStep())
  const [showList, setShowList] = useState(false)
  const [paused, setPaused] = useState(false)
  // Accumulated time spent on the rest-timer screen (the "resting" slice of the
  // session). restStartRef marks when the current rest overlay opened — for a
  // resumed rest that's before the reload, so credit it from its real start.
  const restAccumSec = useRef(0)
  const restStartRef = useRef(rest ? rest.endsAt - rest.seconds * 1000 : 0)
  // Per-exercise active-time learning: activeStartRef marks when the current set
  // screen became active; accumulators sum active seconds + set counts per
  // exercise, and restCount tracks how many rest intervals were taken.
  const activeStartRef = useRef(Date.now())
  const activeAccum = useRef(new Map<string, number>())
  const activeSets = useRef(new Map<string, number>())
  const restCount = useRef(0)

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

  useEffect(() => {
    storage.saveActiveRest(rest)
  }, [rest])

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

  // A "challenge" set: the prefilled target is a genuine step up from last time.
  const challenging = useMemo(
    () => (target ? isChallenge(workouts, planned.key, target) : false),
    [target, workouts, planned.key],
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
    // Remaining sets from the current step onward, each priced by its exercise's
    // learned average active time + pooled rest (structural fallbacks day one).
    const remaining = steps.slice(safeCurrent).map((s) => ({
      exercise: s.ex.key,
      fallbackActiveSec: WORK_PER_SET_SEC,
      fallbackRestSec: s.ex.restSec,
    }))
    return remainingWorkoutSecs(exerciseAverages, remaining)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, safeCurrent, exerciseAverages])

  const setExerciseComplete = (key: string, complete: boolean) => {
    const l = logFor(key)
    if (!l) return
    l.sets.forEach((_, i) => controls.updateSet(key, i, { done: complete }))
  }

  // Attribute the time spent on the current set screen to its exercise, so the
  // per-exercise averages learn how long each move really takes. Rejects out-of-
  // range slices (app left open, instant mis-tap) so they can't skew the average.
  const recordActiveForCurrent = (exerciseKey: string) => {
    if (!activeStartRef.current) return
    const sec = (Date.now() - activeStartRef.current) / 1000
    activeStartRef.current = 0
    if (sec < MIN_SET_ACTIVE_SEC || sec > MAX_SET_ACTIVE_SEC) return
    activeAccum.current.set(exerciseKey, (activeAccum.current.get(exerciseKey) ?? 0) + sec)
    activeSets.current.set(exerciseKey, (activeSets.current.get(exerciseKey) ?? 0) + 1)
  }

  const finish = () => {
    const totalSec = session.startedAt
      ? (Date.now() - new Date(session.startedAt).getTime()) / 1000
      : 0
    const restSec = restAccumSec.current
    if (session.startedAt) {
      void logSessionDuration({
        date: toISODate(new Date()),
        kind: 'workout',
        dayType: session.dayType,
        totalSec,
        restSec,
      })
    }
    // Fold this session's per-exercise active times + rests into the estimator.
    const exercises: ExerciseTimeSample[] = []
    for (const [ex, totalActiveSec] of activeAccum.current) {
      const sets = activeSets.current.get(ex) ?? 0
      if (sets > 0) exercises.push({ exercise: ex, totalActiveSec, sets })
    }
    void logExerciseTimes({ exercises, restTotalSec: restSec, restCount: restCount.current })

    const cleaned: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((ex) => ex.sets.length > 0),
    }
    onFinish(cleaned, { totalSec, restSec })
  }

  // Accumulate the just-ended rest slice, then dismiss the overlay. The next set
  // screen is now active, so start its active-time clock.
  const closeRest = () => {
    if (restStartRef.current) restAccumSec.current += (Date.now() - restStartRef.current) / 1000
    restStartRef.current = 0
    activeStartRef.current = Date.now()
    setRest(null)
  }

  // Mark the current set done and either rest into the next set or finish.
  const completeSetAndAdvance = () => {
    recordActiveForCurrent(planned.key)
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
    restCount.current += 1
    // Full inter-set rest within an exercise, but a shorter transition rest
    // (sized to the next exercise, capped) when moving to a different move.
    const restSec = restBeforeNextSet({
      currentRestSec: planned.restSec,
      sameExercise: !nextIsNewExercise,
      nextRestSec: nextStep ? nextStep.ex.restSec : null,
    })
    setRest({
      seconds: restSec,
      endsAt: Date.now() + restSec * 1000,
      exKey: planned.key,
      isLastSetOfExercise: step.setIndex === step.setCount - 1,
      upNext: nextIsNewExercise ? `up next: ${nextStep!.ex.name}` : null,
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
  const challengeLabel =
    target && (target.weightLbs == null ? `${target.reps} reps` : `${target.weightLbs} × ${target.reps}`)
  const restLabel = planned.restSec >= 60 ? `${planned.restSec / 60} min` : `${planned.restSec}s`

  // Shared by the header and the rest screen, so the same actions stay reachable
  // while resting instead of forcing you to end rest to get at them.
  const menuItems: MenuItem[] = [
    { label: 'back to app (keep going)', onClick: onMinimize },
    { label: 'pause workout', onClick: () => setPaused(true) },
    { label: 'workout checklist', onClick: () => setShowList(true) },
    { label: 'skip logging details (mark done)', onClick: onSkip },
    { label: 'finish workout now', onClick: finish },
    {
      label: 'discard workout',
      danger: true,
      onClick: () => {
        if (confirm('discard this in-progress workout?')) controls.clear()
      },
    },
  ]

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{planned.name}</h2>
        </div>
        <KebabMenu items={menuItems} />
      </header>

      <SessionProgress done={totals.done} total={totals.all} />

      <p className="px-1 text-xs font-semibold tracking-wider text-neutral-500">
        {planned.group} · {planned.sets}×{repRangeLabel(planned)} · rest {restLabel}
      </p>

      {step.setIndex === step.setCount - 1 && (
        <p className="px-1 text-xs text-neutral-500">
          {exercises[step.exIndex + 1]
            ? `up next: ${exercises[step.exIndex + 1].name}`
            : 'last exercise — almost done'}
        </p>
      )}

      {set && (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          {challenging && challengeLabel ? (
            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-sm font-bold text-accent">
              <MdBolt aria-hidden />
              challenge · push for {challengeLabel}
            </p>
          ) : (
            hint && (
              <p className="flex items-center justify-center gap-1 text-sm font-medium text-accent">
                <MdTrackChanges aria-hidden />
                {hint}
              </p>
            )
          )}
          <div className="flex items-end justify-center gap-3">
            <label className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs tracking-wide text-neutral-500">
                {planned.bodyweight ? 'added lbs' : 'weight'}
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder={planned.bodyweight ? 'bw' : 'lbs'}
                value={set.weightLbs ?? ''}
                onChange={(e) => controls.updateSet(planned.key, step.setIndex, { weightLbs: toWeight(e.target.value) })}
                className="min-h-[64px] w-full rounded-xl bg-surface-2 px-2 text-center text-3xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <span className="pb-5 text-2xl text-neutral-600">×</span>
            <label className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs tracking-wide text-neutral-500">reps</span>
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
          'finish workout'
        ) : (
          <>
            done <MdChevronRight className="text-2xl" aria-hidden />
          </>
        )}
      </button>

      {rest != null && (
        <RestTimer
          seconds={rest.seconds}
          endsAt={rest.endsAt}
          upNext={rest.upNext}
          menu={menuItems}
          progress={{ done: totals.done, total: totals.all, unit: 'sets' }}
          timeLeftLabel={`${formatDuration(timeLeft)} left`}
          onAddSet={rest.isLastSetOfExercise ? addSetFromRest : undefined}
          onClose={closeRest}
        />
      )}

      {paused && <PauseOverlay label="workout paused" onResume={() => setPaused(false)} />}

      {showList && (
        // Above the rest overlay (z-50) — reachable from the rest screen's menu.
        <div className="fixed inset-0 z-60 flex items-end bg-black/60" onClick={() => setShowList(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-1 text-lg font-bold">workout checklist</h3>
            <p className="mb-3 text-xs text-neutral-500">tap a name to jump; tap the circle to mark done.</p>
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
                        // Jumping is a decision to start that exercise now, so an
                        // in-flight rest ends rather than covering it back up.
                        if (rest) closeRest()
                        setShowList(false)
                      }}
                      className="flex-1 py-3 text-left active:opacity-70"
                    >
                      <span className="text-[10px] tracking-wide text-neutral-500">{e.group}</span>
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
