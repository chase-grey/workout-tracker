import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MdBolt,
  MdCheckCircle,
  MdChevronRight,
  MdFlag,
  MdRadioButtonUnchecked,
  MdShowChart,
  MdTrackChanges,
} from 'react-icons/md'
import type { WorkoutSession } from '../../types'
import { useData } from '../../store/DataContext'
import {
  repRangeLabel,
  sideOrderedExercises,
  variantExercises,
  type PlannedExercise,
} from '../../config/plan'
import { nextTargets, type Target } from '../../lib/progression'
import { buildGoals } from '../../lib/goals'
import { goalCueForExercise } from '../../lib/goalCue'
import { isChallenge } from '../../lib/challenge'
import { progressionVariant } from '../../lib/pushVariant'
import { buildSetOrder } from '../../lib/circuit'
import { canResumeRest, restBeforeNextSet, upNextTargetLabel } from '../../lib/rest'
import { ExerciseHistorySheet } from '../../components/ExerciseHistorySheet'
import {
  formatDuration,
  remainingWorkoutSecs,
  WORK_PER_SET_SEC,
  type ExerciseTimeSample,
} from '../../lib/estimate'
import { toISODate } from '../../lib/dates'
import { usePressAction } from '../../lib/usePressAction'
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
  const {
    plan,
    workouts,
    bodyWeights,
    measurements,
    settings,
    exerciseAverages,
    logSessionDuration,
    logExerciseTimes,
    updatePlan,
  } = useData()
  // A rest still running when the app closed resumes with its real remaining
  // time (it's wall-clock based, so the time away counts) unless it's long stale.
  const [rest, setRest] = useState<ActiveRest | null>(() => {
    const saved = storage.loadActiveRest()
    return saved && canResumeRest(saved.endsAt, Date.now()) ? saved : null
  })
  const [current, setCurrent] = useState(() => storage.loadActiveStep())
  const [showList, setShowList] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  // The first set of a workout waits on a start press (see `awaitingStart`).
  const [started, setStarted] = useState(false)
  // Per-exercise auto-advance for this session only, keyed by exercise. An entry
  // overrides the saved `autoAdvance` default either way, so "auto just for now"
  // and "not this time" are both possible without editing the plan.
  const [autoOverride, setAutoOverride] = useState<Map<string, boolean>>(new Map())
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
  // Total rest this session was *prescribed*, alongside how much was actually
  // taken: the estimator learns the ratio between the two, not a flat average (see
  // lib/estimate — one pooled average can't span a 150s bench rest and a 30s
  // circuit station change).
  const restPrescribedSec = useRef(0)

  const day = plan[session.dayType]
  // The day as this session is actually performing it: the A/B variant's set
  // counts and press order, and which arm leads the one-arm-at-a-time work —
  // both pinned when the session started.
  const exercises = useMemo(
    () => sideOrderedExercises(variantExercises(day, session.variant ?? null), session.startSide),
    [day, session.variant, session.startSide],
  )

  const logFor = (key: string) => session.exercises.find((e) => e.exercise === key)
  const doneCount = (key: string) => logFor(key)?.sets.filter((s) => s.done && s.reps > 0).length ?? 0
  const isComplete = (key: string) => {
    const log = logFor(key)
    return !!log && log.sets.length > 0 && log.sets.every((s) => s.done && s.reps > 0)
  }

  // Flatten the workout into individual set-steps, one screen each. Driven by the
  // live log's set counts so an added/removed set reshapes the flow immediately.
  // buildSetOrder rotates through a circuit's stations instead of finishing one
  // station at a time (see lib/circuit).
  const steps = useMemo(() => {
    const counts = exercises.map((ex) => logFor(ex.key)?.sets.length ?? ex.sets)
    return buildSetOrder(exercises, counts).map(({ exIndex, setIndex }) => ({
      ex: exercises[exIndex],
      exIndex,
      setIndex,
      setCount: counts[exIndex],
      stepKey: `${exercises[exIndex].key}:${setIndex}`,
    })) satisfies SetStep[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, session])

  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0
  const step = steps[safeCurrent]
  const planned = step.ex
  const log = logFor(planned.key)
  const set = log?.sets[step.setIndex]
  const atLast = safeCurrent >= N - 1

  // Resume by step key when the saved one still exists: a plan change can reshape
  // the step list under a session that was already in progress, and the bare index
  // would then land on a different set.
  useEffect(() => {
    const savedKey = storage.loadActiveStepKey()
    if (!savedKey) return
    const idx = steps.findIndex((s) => s.stepKey === savedKey)
    if (idx >= 0 && idx !== safeCurrent) setCurrent(idx)
    // Only on mount: afterwards `current` is the source of truth, not storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    storage.saveActiveStep(safeCurrent)
    storage.saveActiveStepKey(step?.stepKey ?? null)
  }, [safeCurrent, step?.stepKey])

  useEffect(() => {
    storage.saveActiveRest(rest)
  }, [rest])

  // The slot this lift is being trained in, for every read of its history: the
  // press that leads today is compared against the days it led, not against the
  // ones it followed four other exercises (see progressionVariant).
  const slot = useMemo(
    () => progressionVariant(planned.key, session.variant),
    [planned.key, session.variant],
  )

  // The whole day's targets in one read, so the exercises that share a load (the
  // tricep pair) show the one weight between them that the prefill computed.
  const targets = useMemo(
    () =>
      nextTargets(workouts, exercises, {
        variantFor: (key) => progressionVariant(key, session.variant),
      }),
    [workouts, exercises, session.variant],
  )

  const target: Target | undefined = targets.get(planned.key)

  // A "challenge" set: the prefilled target is a genuine step up from last time.
  const challenging = useMemo(
    () => (target ? isChallenge(workouts, planned.key, target, planned.repMin, slot) : false),
    [target, workouts, planned.key, planned.repMin, slot],
  )

  // The nudge from a locked goal riding on this lift: the weight to hit at the
  // reps you're about to do so this set lands on the goal's line. Only surfaced
  // when you're not already ahead of it — hitting a lower number isn't the ask.
  const goalCue = useMemo(() => {
    const goals = buildGoals({ workouts, bodyWeights, measurements, heightIn: settings.heightIn ?? 0 })
    const reps = target?.reps ?? planned.repMin
    return goalCueForExercise(settings.lockedGoals ?? {}, goals, planned.key, reps)
  }, [workouts, bodyWeights, measurements, settings.heightIn, settings.lockedGoals, target?.reps, planned.key, planned.repMin])

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

  // A moment to get set up before anything is on the clock: the very first set of a
  // workout waits for a start press, so walking over and loading the bar isn't
  // charged to that exercise's active-time average. The target is already on screen
  // while you wait, which is the point — you can see what to load before starting.
  const awaitingStart = !started && safeCurrent === 0 && totals.done === 0

  const start = () => {
    activeStartRef.current = Date.now()
    setStarted(true)
  }

  const timeLeft = useMemo(() => {
    // Remaining sets from the current step onward, each priced by its exercise's
    // learned average active time plus its own prescribed rest scaled by the
    // learned rest ratio (structural fallbacks day one). The prescribed rest comes
    // from restBeforeNextSet — the same source the ratio was measured against — so
    // a circuit station change isn't priced as a full inter-set rest.
    const remaining = steps.slice(safeCurrent).map((s, i, arr) => {
      const next = arr[i + 1]
      const sameCircuit = !!next && !!s.ex.circuit && next.ex.circuit === s.ex.circuit
      return {
        exercise: s.ex.key,
        fallbackActiveSec: WORK_PER_SET_SEC,
        prescribedRestSec: restBeforeNextSet({
          currentRestSec: s.ex.restSec,
          sameExercise: !!next && next.ex.key === s.ex.key,
          nextRestSec: next ? next.ex.restSec : null,
          sameCircuit,
          newCircuitRound: sameCircuit && next.setIndex > s.setIndex,
          circuitRestSec: s.ex.circuitRestSec,
        }),
      }
    })
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
    void logExerciseTimes({
      exercises,
      restTotalSec: restSec,
      restPrescribedSec: restPrescribedSec.current,
      restCount: restCount.current,
    })

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
    // Rotating to another station of the same circuit, vs. coming back around to
    // start a fresh round of it (the set number goes up).
    const sameCircuit = !!nextStep && !!planned.circuit && nextStep.ex.circuit === planned.circuit
    const newCircuitRound = sameCircuit && nextStep!.setIndex > step.setIndex
    // Full inter-set rest within an exercise, a brief station change inside a
    // circuit (or whatever that station prescribes), and a shorter transition
    // rest (sized to the next exercise, capped) when moving to a different move.
    const restSec = restBeforeNextSet({
      currentRestSec: planned.restSec,
      sameExercise: !nextIsNewExercise,
      nextRestSec: nextStep ? nextStep.ex.restSec : null,
      sameCircuit,
      newCircuitRound,
      circuitRestSec: planned.circuitRestSec,
    })
    setCurrent(safeCurrent + 1)
    // A station set to no rest goes straight on to the next move: a zero-second
    // timer would open already in overtime, and it isn't a rest to be counted.
    if (restSec <= 0) {
      activeStartRef.current = Date.now()
      return
    }
    restStartRef.current = Date.now()
    restCount.current += 1
    restPrescribedSec.current += restSec
    setRest({
      seconds: restSec,
      endsAt: Date.now() + restSec * 1000,
      exKey: planned.key,
      isLastSetOfExercise: step.setIndex === step.setCount - 1,
      upNext: nextIsNewExercise ? `up next: ${nextStep!.ex.name}` : null,
    })
  }

  // Add a set to whichever exercise is in play. During an exercise's *final* rest
  // the new set lands in the slot `current` already points at, so drop out of rest
  // and go log it; anywhere else it just extends the exercise further down the flow.
  const addSet = () => {
    if (rest) {
      controls.addSet(rest.exKey)
      if (rest.isLastSetOfExercise) closeRest()
      return
    }
    controls.addSet(planned.key)
  }

  const advancePress = usePressAction(completeSetAndAdvance)

  // Whether rest rolls straight into this exercise's next set. During rest `planned`
  // is already the exercise the rest is leading into, so this reads the same from
  // the exercise screen and from the rest screen before it.
  const autoNow = autoOverride.get(planned.key) ?? !!planned.autoAdvance
  const setAutoNow = (on: boolean) =>
    setAutoOverride((prev) => new Map(prev).set(planned.key, on))

  // Saving the default writes to the day's stored exercise list (not the
  // variant-resolved copy), and takes effect for the rest of this session too.
  const setAutoDefault = (on: boolean) => {
    void updatePlan({
      ...plan,
      [session.dayType]: {
        ...day,
        exercises: day.exercises.map((e) =>
          e.key === planned.key ? { ...e, autoAdvance: on } : e,
        ),
      },
    })
    setAutoNow(on)
  }

  const hint = targetLabel(target)
  const targetNumbers = target
    ? target.weightLbs == null
      ? `${target.reps} reps`
      : `${target.weightLbs} × ${target.reps}`
    : null
  // A circuit station never runs two of its sets back to back, so what follows one
  // of its sets is the rest that station prescribes — not its inter-set number.
  const restShownSec =
    planned.circuit && planned.circuitRestSec != null ? planned.circuitRestSec : planned.restSec
  const restLabel =
    restShownSec === 0 ? 'none' : restShownSec >= 60 ? `${restShownSec / 60} min` : `${restShownSec}s`

  // Shared by the header and the rest screen, so the same actions stay reachable
  // while resting instead of forcing you to end rest to get at them.
  const menuItems: MenuItem[] = [
    {
      label: autoNow ? 'wait for my tap after rest' : 'auto-advance out of rest',
      onClick: () => setAutoNow(!autoNow),
    },
    {
      label: planned.autoAdvance
        ? `stop auto-advancing ${planned.name}`
        : `always auto-advance ${planned.name}`,
      onClick: () => setAutoDefault(!planned.autoAdvance),
    },
    { label: 'add a set', onClick: addSet },
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
      {/* Same bar, same place, as the rest screen's: how much of the whole
          workout is still ahead of you, at the top of the screen either way. */}
      <SessionProgress
        done={totals.done}
        total={totals.all}
        unit="sets"
        timeLeftLabel={`${formatDuration(timeLeft)} left`}
      />

      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{planned.name}</h2>
        </div>
        <KebabMenu items={menuItems} />
      </header>

      <p className="px-1 text-xs font-semibold tracking-wider text-neutral-500">
        {planned.group} · set <span className="tabular-nums">{step.setIndex + 1}/{step.setCount}</span> ·{' '}
        {repRangeLabel(planned)} reps · rest {restLabel}
      </p>

      {set && (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          {/* The target line, and a chart button that puts this set in the
              context of the whole history for the lift. */}
          <div className="flex items-center gap-2">
            {challenging && targetNumbers ? (
              <p className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-sm font-bold text-accent">
                <MdBolt aria-hidden />
                {targetNumbers}
              </p>
            ) : (
              <p className="flex flex-1 items-center justify-center gap-1 text-sm font-medium text-accent">
                {hint && (
                  <>
                    <MdTrackChanges aria-hidden />
                    {hint}
                  </>
                )}
              </p>
            )}
            <button
              onClick={() => setShowHistory(true)}
              aria-label={`recent sessions for ${planned.name}`}
              className="shrink-0 rounded-xl bg-surface-2 p-2 text-xl text-neutral-300 active:opacity-70"
            >
              <MdShowChart aria-hidden />
            </button>
          </div>
          {goalCue && goalCue.standing !== 'ahead' && (
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-accent-2">
              <MdFlag aria-hidden />
              {goalCue.goalTitle}: {goalCue.weightLbs} × {goalCue.reps}
            </p>
          )}
          <div className="flex items-end justify-center gap-3">
            {/* A move that's never loaded (hanging raises, dead bugs) gets no
                weight field at all rather than an empty "added lbs" box. */}
            {!planned.repsOnly && (
              <>
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
              </>
            )}
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
        {...(awaitingStart ? { onClick: start } : advancePress)}
        aria-label={awaitingStart || atLast ? undefined : 'next set'}
        className="mt-1 flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
      >
        {awaitingStart ? (
          'start'
        ) : atLast ? (
          'finish workout'
        ) : (
          <MdChevronRight className="text-3xl" aria-hidden />
        )}
      </button>

      {rest != null && (
        <RestTimer
          seconds={rest.seconds}
          endsAt={rest.endsAt}
          upNext={rest.upNext}
          // The flow advances before resting, so `step` is already the set this
          // rest leads into and `targetNumbers` is its target — the numbers to
          // walk back to the bar with, on the rests that should carry them.
          upNextTarget={upNextTargetLabel(step.setIndex, targetNumbers)}
          autoAdvance={autoNow}
          menu={menuItems}
          progress={{ done: totals.done, total: totals.all, unit: 'sets' }}
          timeLeftLabel={`${formatDuration(timeLeft)} left`}
          onClose={closeRest}
        />
      )}

      {paused && <PauseOverlay label="workout paused" onResume={() => setPaused(false)} />}

      {showHistory && (
        <ExerciseHistorySheet
          exerciseKey={planned.key}
          name={planned.name}
          target={target}
          slot={slot ?? undefined}
          // Only a genuinely unloadable move charts as reps: weighted pull-ups are
          // flagged `bodyweight` but do take added weight, so they keep the
          // weight-based metrics.
          repsOnly={!!planned.repsOnly}
          onClose={() => setShowHistory(false)}
        />
      )}

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
