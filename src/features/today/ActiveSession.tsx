import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  MdBlock,
  MdBolt,
  MdCheckCircle,
  MdFlag,
  MdRadioButtonUnchecked,
  MdShowChart,
  MdTrackChanges,
} from 'react-icons/md'
import type { SetLog, WorkoutSession } from '../../types'
import { useData, type SessionDurationInput } from '../../store/DataContext'
import {
  repRangeLabel,
  sideOrderedExercises,
  variantExercises,
  withCircuitRest,
  withCircuitRoundRest,
  type PlannedExercise,
} from '../../config/plan'
import { nextTargets, targetLabel, type Target } from '../../lib/progression'
import { buildGoals } from '../../lib/goals'
import { goalCueForExercise } from '../../lib/goalCue'
import { isChallenge } from '../../lib/challenge'
import { gradeSet, type SetGrade } from '../../lib/setGrade'
import { progressionVariant } from '../../lib/pushVariant'
import { buildSetOrder, circuitStations } from '../../lib/circuit'
import { nextUnfinishedStep, remainingFlow } from '../../lib/setFlow'
import { nextFastMode, rollsThroughRest, turboSetMs, type FastMode } from '../../lib/fastMode'
import { canSkip, resumeSkipped, toSkippedRecord, withSkipped } from '../../lib/skipped'
import {
  bankRest,
  canResumeRest,
  circuitRestLabel,
  CIRCUIT_REST_CHOICES,
  CIRCUIT_ROUND_REST_CHOICES,
  openRest,
  restBeforeNextSet,
  restLabel,
  restScreenSec,
  resumeRestTally,
  staleRestSec,
  upNextTargetLabel,
  type RestTally,
} from '../../lib/rest'
import { ExerciseHistorySheet } from '../../components/ExerciseHistorySheet'
import {
  formatDuration,
  remainingWorkoutSecs,
  workoutSplit,
  WORK_PER_SET_SEC,
  type ExerciseTimeSample,
  type RemainingStep,
} from '../../lib/estimate'
import { toISODate } from '../../lib/dates'
import { toWeight } from '../../lib/weightField'
import { usePressAction } from '../../lib/usePressAction'
import { useIdleTimeout } from '../../lib/useIdleTimeout'
import { useOnHidden } from '../../lib/useOnHidden'
import { useBackGuard } from '../../lib/useBackGuard'
import { useWakeLock } from '../../lib/useWakeLock'
import { storage, type ActiveRest } from '../../services/storage'
import { useActiveSession } from './useActiveSession'
import { RestTimer } from '../../components/RestTimer'
import { GetReady } from '../../components/GetReady'
import { HoldTimer } from '../../components/HoldTimer'
import { SessionProgress } from '../../components/SessionProgress'
import { PauseOverlay } from '../../components/PauseOverlay'
import { KebabMenu, type MenuItem } from '../../components/KebabMenu'
import { FastForwardToggle } from '../../components/FastForwardToggle'
import { SetCheer } from '../../components/SetCheer'

type Props = {
  session: WorkoutSession
  controls: ReturnType<typeof useActiveSession>
  onFinish: (s: WorkoutSession, duration: SessionDurationInput) => void
}

/** Reject per-set active times outside this range (app left open / mis-taps). */
const MIN_SET_ACTIVE_SEC = 3
const MAX_SET_ACTIVE_SEC = 20 * 60

/**
 * A set screen left untouched this long pauses the workout itself.
 *
 * Short of turbo the set you're on waits for a tap — hands-free rolls out of
 * *rest* on its own — so a workout walked away from mid-set otherwise just sits
 * there live: the next set one stray pocket-tap from being logged, and every
 * minute you were gone charged to the exercise you stopped on. Rest is
 * deliberately exempt; a rest that's running is meant to run down untouched.
 *
 * It outlasts any turbo wait by a wide margin (see TURBO_MAX_SEC), so a workout
 * running itself forward is never pausing over its own sets — this only catches
 * turbo once it stops on the last set, which it leaves for you to finish.
 */
const IDLE_PAUSE_MS = 5 * 60 * 1000

/**
 * How long the get-into-position count runs between rest and the set it leads
 * into.
 *
 * Every rest ends on it — tapped short or run out, hold or not. The moment rest
 * is up is the moment you're still walking back to the bar, so instead of the
 * live set appearing under your hands a short count covers the walk (the same
 * screen the stretch routine settles in on, see components/GetReady). A timed
 * hold needs it most: its clock starts the instant the set is on screen (see the
 * HoldTimer's `running`), so without a beat first the countdown would be running
 * while you were still getting your hands down.
 *
 * The seconds come out of the rest rather than after it (see lib/rest's
 * restScreenSec), so a workout is no longer for having them.
 */
const GET_READY_SEC = 5

/** One set of one exercise — the unit the guided workout flow steps through. */
type SetStep = {
  ex: PlannedExercise
  exIndex: number
  setIndex: number
  setCount: number
  stepKey: string
}

/**
 * Price a run of steps for the estimator: each set costs its exercise's learned
 * average active time plus its own prescribed rest scaled by the learned rest
 * ratio (structural fallbacks day one). The prescribed rest comes from
 * restBeforeNextSet — the same source the ratio was measured against — so a
 * circuit station change isn't priced as a full inter-set rest, and the run has
 * to be in the order the flow will walk it, since every step's rest depends on
 * which step follows it.
 */
function priceFlow(flow: SetStep[]): RemainingStep[] {
  return flow.map((s, i, arr) => {
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
        circuitRoundRestSec: s.ex.circuitRoundRestSec,
      }),
    }
  })
}

/** Guided, one-set-at-a-time workout flow with a built-in rest after each set. */
export function ActiveSession({ session, controls, onFinish }: Props) {
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
  // A step to jump to as soon as it exists — a set added mid-rest, which only
  // appears in the flow once the log it's counted from has updated (see addSet).
  const [pendingStepKey, setPendingStepKey] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const [paused, setPaused] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCircuitRest, setShowCircuitRest] = useState(false)
  // The first set of a workout waits on a tap to begin (see `awaitingStart`).
  const [started, setStarted] = useState(false)
  // Whether the get-into-position count is up: the beat every rest ends on,
  // between it and the set it leads into (see closeRest).
  const [preparing, setPreparing] = useState(false)
  // Whether a timed hold's clock is running (see HoldTimer). While it is, the
  // clock is what says when the set is over, so turbo's own wait stands down.
  const [holdRunning, setHoldRunning] = useState(false)
  // The flourish for a set that hit its target, keyed by a counter so consecutive
  // on-target sets each get their own play rather than reusing a mid-flight one.
  const [cheer, setCheer] = useState<{ id: number; grade: SetGrade } | null>(null)
  const cheerId = useRef(0)
  // Hands-free: on, every rest from here rolls into the next set on its own; on
  // turbo the sets go with them, logging the numbers on screen after however long
  // the exercise usually takes (see lib/fastMode). A property of this workout
  // rather than of the plan, but mirrored to storage so a reload mid-workout
  // doesn't quietly start waiting for taps again.
  const [fastMode, setFastMode] = useState<FastMode>(() => storage.loadFastMode())
  const stepFast = () => setFastMode(nextFastMode(fastMode))
  // The exercises today isn't doing after all (see lib/skipped). Mirrored to
  // storage like the rest of the in-progress state, and keyed to this session so
  // it can't follow you into the next workout.
  const [skipped, setSkipped] = useState<Set<string>>(() =>
    resumeSkipped(storage.loadSkipped(), session.sessionId),
  )
  // Bumped by anything you do to the set on screen, to give turbo's clock the full
  // wait again: typing a weight is the one moment when the numbers about to be
  // logged are provably mid-edit.
  const [edits, setEdits] = useState(0)
  // Time spent on the rest-timer screen (the "resting" slice of the session),
  // alongside the rest that was prescribed and how many intervals were taken —
  // the estimator learns the ratio between taken and prescribed, not a flat
  // average (see lib/estimate: one pooled average can't span a 150s bench rest
  // and a 30s circuit station change).
  //
  // Mirrored to storage on every change, because the session's *total* length is
  // derived from its persisted `startedAt`: an hour-long workout outlives more
  // than one page load on a phone (a tab discard, a service-worker update), and a
  // tally that restarted at zero left all the rest before it counted as work.
  //
  // A rest that was running when the app went away and is too stale to reopen is
  // settled into the tally on the way past: it never reaches the rest screen, so
  // nothing else would ever bank it, and its seconds are already in the total.
  const [savedTally] = useState(() => {
    const resumed = resumeRestTally(storage.loadRestTally(), session.sessionId)
    const stale = staleRestSec(storage.loadActiveRest(), Date.now())
    return stale > 0 ? { ...resumed, takenSec: resumed.takenSec + stale } : resumed
  })
  const tally = useRef(savedTally)
  // When the rest on screen opened — for a resumed one that's before the reload,
  // so it's credited from its real start.
  const restStartRef = useRef(rest ? rest.endsAt - rest.seconds * 1000 : 0)
  // Per-exercise active-time learning: activeStartRef marks when the current set
  // screen became active; the accumulators sum active seconds + set counts per
  // exercise.
  const activeStartRef = useRef(Date.now())
  const activeAccum = useRef(new Map<string, number>())
  const activeSets = useRef(new Map<string, number>())

  const day = plan[session.dayType]
  // The day as this session is actually performing it: the A/B variant's set
  // counts and press order, and which arm leads the one-arm-at-a-time work —
  // both pinned when the session started.
  const exercises = useMemo(
    () => sideOrderedExercises(variantExercises(day, session.variant ?? null), session.startSide),
    [day, session.variant, session.startSide],
  )

  // The exercises actually being performed. Everything the workout is measured
  // against downstream — the step flow, the set count, the time left — is built
  // from this rather than from the day as written, so a skipped move stops being
  // owed the moment it's skipped instead of sitting in the estimate to the end.
  const inPlay = useMemo(() => exercises.filter((e) => !skipped.has(e.key)), [exercises, skipped])
  /** Whether this exercise can be skipped — something has to be left to perform. */
  const skippable = (key: string) => canSkip(skipped, exercises.map((e) => e.key), key)

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
    const counts = inPlay.map((ex) => logFor(ex.key)?.sets.length ?? ex.sets)
    return buildSetOrder(inPlay, counts).map(({ exIndex, setIndex }) => ({
      ex: inPlay[exIndex],
      exIndex,
      setIndex,
      setCount: counts[exIndex],
      stepKey: `${inPlay[exIndex].key}:${setIndex}`,
    })) satisfies SetStep[]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPlay, session])

  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0
  const step = steps[safeCurrent]
  const planned = step.ex
  const log = logFor(planned.key)
  const set = log?.sets[step.setIndex]

  // Which steps are already logged, in step order. `done` alone rather than
  // doneCount's `done && reps > 0`: the checklist and the advance button both mark
  // sets done outright, and a step the flow can't get past is one it would keep
  // handing back (see lib/setFlow).
  const stepDone = useMemo(
    () => steps.map((s) => !!logFor(s.ex.key)?.sets[s.setIndex]?.done),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, session],
  )
  // Where "next" goes from here — the nearest set still owed, skipping the ones
  // already logged, rather than the step one along. Null once this is the last one
  // left, which is what makes the button say finish.
  const upcoming = useMemo(() => nextUnfinishedStep(stepDone, safeCurrent), [stepDone, safeCurrent])
  const nextStep = upcoming == null ? null : steps[upcoming]
  const atLast = nextStep == null

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
    if (!pendingStepKey) return
    const idx = steps.findIndex((s) => s.stepKey === pendingStepKey)
    if (idx < 0) return
    setCurrent(idx)
    setPendingStepKey(null)
  }, [pendingStepKey, steps])

  useEffect(() => {
    storage.saveActiveStep(safeCurrent)
    storage.saveActiveStepKey(step?.stepKey ?? null)
  }, [safeCurrent, step?.stepKey])

  useEffect(() => {
    storage.saveActiveRest(rest)
  }, [rest])

  useEffect(() => {
    storage.saveFastMode(fastMode)
  }, [fastMode])

  useEffect(() => {
    storage.saveSkipped(toSkippedRecord(session.sessionId, skipped))
  }, [session.sessionId, skipped])

  // Mirror the tally the session resumed with. Ordinarily that's a no-op rewrite
  // of what's already stored, but a stale rest settled into it above is banked
  // nowhere else — and the effect above has just cleared the rest it came from,
  // so without this the seconds are lost to the next reload.
  useEffect(() => {
    storage.saveRestTally(savedTally)
  }, [savedTally])

  // Step away mid-set and the curtain comes down on its own (see IDLE_PAUSE_MS),
  // hands-free or not. Not armed over the rest screen, which is supposed to be
  // left alone, nor under an open sheet: a sheet sits above the pause curtain, and
  // reading one isn't being away.
  useIdleTimeout(
    rest == null && !preparing && !paused && !showList && !showHistory && !showCircuitRest,
    IDLE_PAUSE_MS,
    () => {
      // Drop this set's active-time slice rather than carry it into the pause: it
      // already spans five minutes of nobody being here, and the exercise's
      // average has nothing to learn from a set that was walked away from.
      activeStartRef.current = 0
      setPaused(true)
    },
  )

  // Android back (the button or the edge swipe) closes the checklist and leaves you
  // in the workout: a press meant for the sheet on top doesn't reach past it to set
  // the whole session aside, which is what the guard underneath does (see App).
  useBackGuard(showList, () => setShowList(false))

  // Leave the app — another app, or the screen going dark — and hands-free
  // switches off. Its clocks are wall-clock, so they'd otherwise keep advancing
  // in the dark and you'd come back to a run of sets logged at their targets that
  // nobody did. Coming back to a set waiting on a tap is the recoverable one.
  useOnHidden(fastMode !== 'off', () => setFastMode('off'))

  // And while it's on, the screen stays lit: hands-free means nothing is being
  // tapped, and a phone left untouched dims and locks in less time than a rest
  // takes. A timed hold gets the same, hands-free or not — its clock started
  // itself and nobody is touching the screen through a plank either. Not under the
  // pause curtain, which is the state of nobody being here — there's nothing to
  // watch, so the phone can sleep as it normally would.
  useWakeLock((fastMode !== 'off' || holdRunning) && !paused)

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

  // The nudge from a goal riding on this lift: the weight to hit at the reps
  // you're about to do so this set lands on the goal's line. Only surfaced when
  // you're not already ahead of it — hitting a lower number isn't the ask — with
  // the exception of a goal waiting on a single, which is surfaced precisely
  // because the readings are already there (see goalCue's `ready`).
  const goalCue = useMemo(() => {
    const goals = buildGoals({ workouts, bodyWeights, measurements, heightIn: settings.heightIn ?? 0 })
    const reps = target?.reps ?? planned.repMin
    return goalCueForExercise(settings.lockedGoals ?? {}, goals, planned.key, reps)
  }, [workouts, bodyWeights, measurements, settings.heightIn, settings.lockedGoals, target?.reps, planned.key, planned.repMin])

  const totals = useMemo(() => {
    let done = 0
    let all = 0
    for (const e of exercises) {
      const logged = doneCount(e.key)
      done += logged
      // A skipped exercise still counts whatever you'd already logged of it —
      // those sets happened — but stops owing the ones you're not going to do.
      all += skipped.has(e.key) ? logged : logFor(e.key)?.sets.length ?? e.sets
    }
    return { done, all }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, skipped, session])

  // A moment to get set up before anything is on the clock: the very first set of a
  // workout waits for a tap, so walking over and loading the bar isn't charged to
  // that exercise's active-time average. The target is already on screen while you
  // wait, which is the point — you can see what to load before starting. The tap
  // that starts it is a tap anywhere, like every other tap in the flow (see
  // onScreenTap): it takes one to begin and the next one logs the set.
  const awaitingStart = !started && safeCurrent === 0 && totals.done === 0

  const start = () => {
    activeStartRef.current = Date.now()
    setStarted(true)
  }

  const timeLeft = useMemo(() => {
    // The sets still owed, in the order the flow will reach them — not everything
    // from here to the end of the list, which after a jump counts sets already
    // logged and misses the ones left behind.
    const remaining = remainingFlow(stepDone, safeCurrent).map((idx) => steps[idx])
    return remainingWorkoutSecs(exerciseAverages, priceFlow(remaining))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, stepDone, safeCurrent, exerciseAverages])

  // Type into the set on screen. Counted as an edit as well as stored, so turbo's
  // clock starts the wait over instead of logging a half-typed number.
  const editSet = (patch: Partial<SetLog>) => {
    controls.updateSet(planned.key, step.setIndex, patch)
    setEdits((n) => n + 1)
  }

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

  /** Update the rest tally and mirror it, so a reload resumes it rather than restarting. */
  const commitTally = (next: RestTally) => {
    tally.current = next
    storage.saveRestTally(next)
  }

  const finish = () => {
    const totalSec = session.startedAt
      ? (Date.now() - new Date(session.startedAt).getTime()) / 1000
      : 0
    // The rest screen's own menu can finish the workout, so bank whatever rest is
    // still on the clock before reading the total off the tally.
    const rested = bankRest(tally.current, restStartRef.current, Date.now())
    commitTally(rested)
    restStartRef.current = 0
    const restSec = rested.takenSec
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
      restPrescribedSec: rested.prescribedSec,
      restCount: rested.count,
    })

    const cleaned: WorkoutSession = {
      ...session,
      exercises: session.exercises
        .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done && s.reps > 0) }))
        .filter((ex) => ex.sets.length > 0),
    }
    // What the estimator said this workout would cost, so the recap can set the
    // clock beside the projection. Priced over the whole flow rather than what's
    // left, and read here at the end rather than frozen at the start: a workout
    // with two exercises skipped out of it was never going to take what the full
    // one would, and a recap comparing against that number would read as time
    // saved instead of work dropped.
    const projected = workoutSplit(exerciseAverages, priceFlow(steps))
    onFinish(cleaned, { totalSec, restSec, projected })
  }

  // Accumulate the just-ended rest slice, then hand the screen to the
  // get-into-position count.
  //
  // Every rest ends on that count, however it ended and whatever set it leads
  // into: the rest already gave the seconds up for it (see GET_READY_SEC), and a
  // rest tapped short is a decision to get on with the next set rather than a
  // claim to be standing at the bar already.
  //
  // The count's seconds are charged to neither side of the session: rest has just
  // been banked, and the exercise's active average is what turbo's own wait is
  // priced from (see turboSetMs), so folding the count into it would push every
  // later wait out by the length of the count, workout after workout. The active
  // clock starts when the count ends instead.
  const closeRest = () => {
    commitTally(bankRest(tally.current, restStartRef.current, Date.now()))
    restStartRef.current = 0
    setPreparing(true)
    activeStartRef.current = 0
    setRest(null)
  }

  /**
   * Drop an exercise from today's workout, or bring one back.
   *
   * Either way the flattened step list is rebuilt around the exercises still in
   * play, so the set on screen is held by key rather than by index — the bare
   * index means a different set in the reshaped list. Skipping the exercise on
   * screen has no set to hold, so it moves on to the next one still owed (any set
   * of anything still in play, when nothing is owed) and ends the rest that was
   * counting down to the set just left.
   */
  const setExerciseSkipped = (key: string, skip: boolean) => {
    if (skip && !skippable(key)) return
    const leaving = skip && planned.key === key
    const ahead = leaving
      ? remainingFlow(stepDone, safeCurrent).slice(1).find((i) => steps[i].ex.key !== key)
      : undefined
    const landing = leaving
      ? (ahead != null ? steps[ahead] : steps.find((s) => s.ex.key !== key))
      : step
    const held = leaving ? (landing?.stepKey ?? null) : step.stepKey
    setSkipped(withSkipped(skipped, key, skip))
    setPendingStepKey(held)
    if (leaving) {
      // Start the active-time clock over on the set we're landing on. The seconds
      // spent on the one we're skipping away from are dropped rather than charged
      // to it — it wasn't performed — and charging them to the next exercise would
      // inflate the very averages the time left is priced from.
      activeStartRef.current = Date.now()
      if (rest) closeRest()
    }
  }

  /** Tapping a skipped exercise in the checklist is deciding to do it after all. */
  const unskipAndJump = (key: string) => {
    setSkipped(withSkipped(skipped, key, false))
    // Its steps don't exist yet, so land on it by key once they do — on the first
    // set still owed, as jumping to any other exercise does.
    const owed = logFor(key)?.sets.findIndex((s) => !s.done) ?? -1
    setPendingStepKey(`${key}:${owed >= 0 ? owed : 0}`)
    activeStartRef.current = Date.now()
    if (rest) closeRest()
  }

  // Rest again before the set on screen — for the rest that was cut short, or the
  // one hands-free rolled straight through. The seconds count like any other rest,
  // and the time already spent on this set screen is dropped rather than carried
  // through the rest: an exercise's average has nothing to learn from a set that
  // was stood down from halfway.
  const reopenRest = (sec: number) => {
    activeStartRef.current = 0
    // Less the count it ends on, like any other rest (see GET_READY_SEC). A break
    // with nothing left over for a rest screen is all count.
    const restSec = restScreenSec(sec, GET_READY_SEC)
    if (restSec <= 0) {
      setPreparing(true)
      return
    }
    restStartRef.current = Date.now()
    commitTally(openRest(tally.current, restSec))
    setRest({
      seconds: restSec,
      endsAt: Date.now() + restSec * 1000,
      exKey: planned.key,
      // This rest leads *into* the set on screen rather than away from one, so
      // adding a set is the ordinary extend-this-exercise case rather than a jump.
      isLastSetOfExercise: false,
    })
  }

  /**
   * The rest that actually follows the set on screen: a full inter-set rest within
   * an exercise, whatever a circuit station prescribes for the change to the next
   * one, the round rest when this station wraps the circuit, and a transition rest
   * sized to the coming exercise otherwise (see lib/rest.restBeforeNextSet).
   *
   * Derived from the step the flow will actually reach rather than from the
   * exercise's own number, because inside a circuit the two differ by design: the
   * Copenhagen pair gives ten seconds to turn over onto the other side between its
   * two stations and a full rest on the wrap into the next round, and a header
   * reading either of those for the other would be naming a break you don't get.
   *
   * On the last set of all there's no transition to price, so it falls back to the
   * exercise's own rest — the number "back to rest" reopens.
   */
  const restShownSec = useMemo(() => {
    if (!nextStep) return planned.restSec
    const sameCircuit = !!planned.circuit && nextStep.ex.circuit === planned.circuit
    return restBeforeNextSet({
      currentRestSec: planned.restSec,
      sameExercise: nextStep.ex.key === planned.key,
      nextRestSec: nextStep.ex.restSec,
      sameCircuit,
      // Coming back around to a station starts a fresh round (the set number goes up)
      // rather than continuing the current one.
      newCircuitRound: sameCircuit && nextStep.setIndex > step.setIndex,
      circuitRestSec: planned.circuitRestSec,
      circuitRoundRestSec: planned.circuitRoundRestSec,
    })
  }, [planned, nextStep, step.setIndex])

  // Mark the current set done and either rest into the next set or finish.
  //
  // `finalReps` is a set whose number was measured rather than typed: a timed hold
  // that ended itself hands over the seconds the clock really ran, which go into
  // the same field the reps do. Written with the set rather than before it, so the
  // cheer and the carry-forward below read what's being logged instead of the
  // prefilled prescription it replaced.
  const completeSetAndAdvance = (finalReps?: number) => {
    const reps = finalReps ?? set?.reps ?? 0
    recordActiveForCurrent(planned.key)
    controls.updateSet(planned.key, step.setIndex, { done: true, ...(finalReps != null && { reps: finalReps }) })
    if (!nextStep || upcoming == null) {
      // No cheer on the last set: finishing hands the screen straight to the
      // recap, which has its own (louder) celebration to give.
      finish()
      return
    }
    // Cheer what the numbers on screen actually were — the flourish plays over the
    // rest that's about to open, so nothing waits on it (see SetCheer).
    const grade = gradeSet(set?.weightLbs ?? null, reps, target)
    if (grade) {
      cheerId.current += 1
      setCheer({ id: cheerId.current, grade })
    }
    // Carry this set's actual weight/reps forward to the sets of this exercise
    // still to come, so after the first one they prefill what you just did rather
    // than the target (see carryLoggedSet). Every one of them, not only the next
    // screen: a circuit station's own next set is two stations away, and the
    // checklist can jump you to any of them.
    if (set) controls.carrySet(planned.key, { weightLbs: set.weightLbs ?? null, reps })
    // The rest the header has been naming all along (see restShownSec) — one
    // computation for both, so the break you get is the one you were shown. It's
    // the whole break that was named, and the count that closes it comes out of
    // it rather than after it, so the rest screen runs for what's left.
    const restSec = restScreenSec(restShownSec, GET_READY_SEC)
    setCurrent(upcoming)
    if (restSec <= 0) {
      // A station set to no rest goes straight on to the next move: a zero-second
      // timer would open already in overtime, and it isn't a rest to be counted.
      // A break too short to hold both is all count, and still gets it.
      setPreparing(restShownSec > 0)
      activeStartRef.current = restShownSec > 0 ? 0 : Date.now()
      return
    }
    restStartRef.current = Date.now()
    // Banked as the rest opens, not when it closes: a reload mid-rest recovers the
    // seconds from the saved `endsAt`, but not that the interval ever happened.
    commitTally(openRest(tally.current, restSec))
    setRest({
      seconds: restSec,
      endsAt: Date.now() + restSec * 1000,
      exKey: planned.key,
      isLastSetOfExercise: step.setIndex === step.setCount - 1,
    })
  }

  // Add a set to whichever exercise is in play. During an exercise's *final* rest
  // the new set is what the rest should lead into, so jump to it and drop out of
  // rest; anywhere else it just extends the exercise further down the flow.
  const addSet = () => {
    if (rest) {
      controls.addSet(rest.exKey)
      if (rest.isLastSetOfExercise) {
        // By key, not by index: the rest was leading somewhere else entirely once
        // sets can be done out of order, so where the new set lands in the reshaped
        // step list isn't the index `current` happens to sit at.
        setPendingStepKey(`${rest.exKey}:${logFor(rest.exKey)?.sets.length ?? 0}`)
        // The extra set is on the exercise the rest came *from*, not the one it was
        // counting down to, so that's the move the get-into-position count is for.
        closeRest()
      }
      return
    }
    controls.addSet(planned.key)
  }

  const advancePress = usePressAction(completeSetAndAdvance)

  // Turbo: the set on screen logs itself, so a workout of prefilled targets runs
  // end to end without a tap. The wait is this exercise's own learned average
  // active time — what a set of it normally takes you, the same measurement the
  // time-left estimate is priced from — not one flat number across every lift.
  //
  // Held off in the places where accepting the numbers wouldn't be right: the
  // opening start press (still yours, so loading the bar isn't on the clock), a
  // set with no reps in it yet (there'd be nothing to log), and the last set of
  // all, which finishes the workout — that stays a deliberate press. Rest and any
  // overlay disarm it too: rest already advances itself, and reading the checklist
  // isn't standing at the bar. The get-into-position count holds it off for the
  // same reason: the wait on a set starts when you're on the set.
  //
  // A hold with its clock running is the last of them, and the one place an
  // average would be wrong outright: the plank is over when its own prescribed
  // time is up, not when a set of it usually takes, so the clock closes that set
  // instead (see `holdEndsItself`).
  const advanceRef = useRef(completeSetAndAdvance)
  advanceRef.current = completeSetAndAdvance
  // Nothing between you and the set: no rest, no count, no sheet, no pause. What
  // both the turbo wait and a self-ending hold need to be true before they can
  // close a set on their own.
  const setScreenLive =
    rest == null && !preparing && !paused && !showList && !showHistory && !showCircuitRest
  const turboMs = turboSetMs(exerciseAverages, planned.key)
  const turboArmed =
    fastMode === 'turbo' &&
    !awaitingStart &&
    !atLast &&
    (set?.reps ?? 0) > 0 &&
    !holdRunning &&
    setScreenLive
  useEffect(() => {
    if (!turboArmed) return
    const id = window.setTimeout(() => {
      // Mid-set you're rarely looking at the screen, so a set logging itself would
      // otherwise be silent (rest running out buzzes for the same reason).
      navigator.vibrate?.(200)
      advanceRef.current()
    }, turboMs)
    return () => window.clearTimeout(id)
    // Re-armed per set, and again whenever you touch this one's numbers — the wait
    // starts over rather than logging a weight you're halfway through typing.
  }, [turboArmed, turboMs, step.stepKey, edits])

  // Hands-free, a timed hold rolls into its rest the moment the prescribed time is
  // up: the clock, not you, is what says a plank is done, so there's nothing left
  // to tap for. Switched on partway through a hold that's already in overtime, it
  // ends there and then — being past the time is exactly the state it was waiting
  // for — and the seconds actually held are what get logged.
  //
  // Held off on the last set of all, like turbo: finishing the workout stays a
  // deliberate press.
  const holdEndsItself = rollsThroughRest(fastMode) && !atLast && setScreenLive

  // Each set gets its own clock (see the HoldTimer's key below), so a hold left
  // running when the flow moves on doesn't leave the next set believing one is
  // under way.
  useEffect(() => {
    setHoldRunning(false)
  }, [step.stepKey])

  // Tapping the screen ends the set — the same target the stretch routine gives a
  // set, and for the same reason: a button is a small thing to hit for hands that
  // have just come off a bar, and the whole page is the one target you can't miss.
  // Controls (the trend button, the kebab, the weight and reps fields) keep their
  // own job, an overlay that owns the screen swallows the tap rather than logging a
  // set behind it, and the last set of all still waits on its explicit finish
  // button — ending the workout is not something to trigger with a stray tap.
  //
  // Before the first set is under way the tap starts the workout instead, which is
  // all the old start press ever did (see `awaitingStart`): loading the bar stays
  // off that exercise's active-time average, without asking for a press to say so.
  const onScreenTap = (e: MouseEvent) => {
    if (atLast || !setScreenLive) return
    if ((e.target as HTMLElement).closest('button, input, label, a')) return
    if (awaitingStart) {
      start()
      return
    }
    completeSetAndAdvance()
  }

  // The stations of the circuit in play, in the order they're rotated through —
  // the whole circuit rather than just the station on screen, because "rest only
  // after the lateral raise" is a statement about all of them.
  const stations = useMemo(
    () => circuitStations(inPlay, step.exIndex).map((i) => inPlay[i]),
    [inPlay, step.exIndex],
  )

  // Per-station rest, saved to the plan like auto-advance: it's a property of how
  // this circuit is run, not of today's session, so it holds for future ones too.
  const setCircuitRest = (key: string, sec: number | null) => {
    void updatePlan({ ...plan, [session.dayType]: withCircuitRest(day, key, sec) })
  }

  // The break after a full round of the circuit, set for the circuit rather than for
  // a station: whichever one runs last is the one that wraps, and for a pair of
  // sides that's a different station every session (see withCircuitRoundRest).
  const setCircuitRoundRest = (sec: number | null) => {
    if (!planned.circuit) return
    void updatePlan({
      ...plan,
      [session.dayType]: withCircuitRoundRest(day, planned.circuit, sec),
    })
  }

  const hint = targetLabel(target, planned.timed)
  const targetNumbers = target
    ? planned.timed
      ? `${target.reps}s`
      : target.weightLbs == null
        ? `${target.reps} reps`
        : `${target.weightLbs} × ${target.reps}`
    : null

  // Shared by the header and the rest screen, so the same actions stay reachable
  // while resting instead of forcing you to end rest to get at them.
  const menuItems: MenuItem[] = [
    // Off the rest screen only — there's nothing to go back to while it's up, and
    // nothing to rest before if the workout hasn't started.
    ...(rest == null && !awaitingStart && restShownSec > 0
      ? [{ label: 'back to rest', onClick: () => reopenRest(restShownSec) }]
      : []),
    // Only inside a circuit: everywhere else the rest after a set is simply the
    // exercise's own, and there's nothing per-station to choose between.
    ...(stations.length > 0
      ? [{ label: 'rest between these moves', onClick: () => setShowCircuitRest(true) }]
      : []),
    { label: 'add a set', onClick: addSet },
    // Not for the last exercise left in play: a workout with nothing in it has no
    // set to show (see lib/skipped).
    ...(skippable(planned.key)
      ? [{ label: `skip ${planned.name}`, onClick: () => setExerciseSkipped(planned.key, true) }]
      : []),
    { label: 'pause workout', onClick: () => setPaused(true) },
    { label: 'workout checklist', onClick: () => setShowList(true) },
    { label: 'finish workout now', onClick: finish },
    {
      label: 'discard workout',
      danger: true,
      onClick: () => {
        if (confirm('discard this in-progress workout?')) controls.clear()
      },
    },
  ]

  // The top of the screen, built once and rendered on both the set screen and the
  // rest screen over it, so resting changes nothing above the fold: the same
  // progress bar, the same lift named, the same set of it coming, and the same
  // trend button — the history for the move is as readable while you sit down as
  // it is while you're standing at it.
  //
  // Which set it names is right either way: the flow advances *before* resting, so
  // through a rest `step` is already the set the rest leads into.
  const topBar = (
    <div className="flex flex-col gap-3">
      {/* How much of the whole workout is still ahead of you. */}
      <SessionProgress
        done={totals.done}
        total={totals.all}
        unit="sets"
        timeLeftLabel={`${formatDuration(timeLeft)} left`}
      />

      <header className="flex items-start justify-between gap-2">
        {/* The controls beside it are 44px tap targets with their glyphs centred, so
            the name takes the same band: its first line lands on their centreline
            instead of riding above it, and a name long enough to wrap still starts
            level with them. */}
        <h2 className="min-w-0 py-2 text-xl font-bold">{planned.name}</h2>
        {/* A tap on the rest screen ends rest, so these keep theirs to themselves. */}
        <div className="flex shrink-0 items-start" onClick={(e) => e.stopPropagation()}>
          {/* Puts the set in the context of the whole history for the lift. */}
          <button
            onClick={() => setShowHistory(true)}
            aria-label={`recent sessions for ${planned.name}`}
            className="flex min-h-[44px] w-11 items-center justify-center rounded-xl text-neutral-400 active:bg-surface-2"
          >
            <MdShowChart className="text-2xl" aria-hidden />
          </button>
          <FastForwardToggle mode={fastMode} onPress={stepFast} />
          <KebabMenu items={menuItems} />
        </div>
      </header>

      <p className="px-1 text-xs font-semibold tracking-wider text-neutral-500">
        {planned.group} · set <span className="tabular-nums">{step.setIndex + 1}/{step.setCount}</span> ·{' '}
        {repRangeLabel(planned)} {planned.timed ? 'sec' : 'reps'} · rest {restLabel(restShownSec)}
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 pb-6" onClick={onScreenTap}>
      {topBar}

      {set && (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          {/* What to go for on this set. */}
          {challenging && targetNumbers ? (
            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-sm font-bold text-accent">
              <MdBolt aria-hidden />
              {targetNumbers}
            </p>
          ) : (
            hint && (
              <p className="flex items-center justify-center gap-1 text-sm font-medium text-accent">
                <MdTrackChanges aria-hidden />
                {hint}
              </p>
            )
          )}
          {/* A goal that's ready shows through even when the reading is past the
              line — being ahead is exactly what makes the attempt the ask. */}
          {goalCue && (goalCue.ready || goalCue.standing !== 'ahead') && (
            <p
              className={`flex items-center justify-center gap-1.5 text-xs font-medium ${
                goalCue.ready ? 'text-accent-bright' : 'text-accent-2'
              }`}
            >
              <MdFlag aria-hidden />
              {goalCue.goalTitle}
              {goalCue.ready ? ' — ready: ' : ': '}
              {goalCue.weightLbs} × {goalCue.reps}
            </p>
          )}
          {/* A hold rather than a count of reps: the clock is the set, and the field
              under it is the seconds it actually lasted — prefilled with the hold
              prescribed, and typed over with what the clock read when you came out
              of it. The clock runs itself from the moment the set is on screen and
              is never stopped by hand (see the HoldTimer's `running`): the number
              has to be read off the screen regardless, so a press to freeze it was
              only ever an extra tap in the moment your hands are least free. */}
          {planned.timed ? (
            <div className="flex flex-col items-center gap-4">
              <HoldTimer
                // A clock per set: a hold still running when the flow moves on is
                // this set's, and carrying it into the next one would hand that set
                // a hold that's already run past its time.
                key={step.stepKey}
                targetSec={target?.reps ?? planned.repMin}
                // Started by the set being up rather than by a press, and stood
                // back down the moment it isn't: rest, the get-into-position count,
                // the pause curtain and any open sheet all hold the clock with its
                // seconds banked, since a hold counting down behind them is counting
                // time you weren't holding anything.
                running={setScreenLive && !awaitingStart}
                // The seconds on the clock aren't seconds spent standing at the set
                // screen deciding anything, so the exercise's active-time average
                // has nothing to learn from them (see recordActiveForCurrent).
                onStart={() => {
                  activeStartRef.current = 0
                  setHoldRunning(true)
                }}
                // Hands-free the hold logs itself and rests (see holdEndsItself).
                // Both in one call, so what's written is the time the clock ran
                // rather than the prescription the field was prefilled with.
                onTargetEnd={
                  holdEndsItself
                    ? (held) => {
                        setHoldRunning(false)
                        completeSetAndAdvance(held)
                      }
                    : undefined
                }
              />
              <label className="flex w-full flex-col items-center gap-1">
                <span className="text-xs tracking-wide text-neutral-500">seconds held</span>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="sec"
                  value={set.reps || ''}
                  onChange={(e) => editSet({ reps: Number(e.target.value) || 0 })}
                  className="min-h-[64px] w-full rounded-xl bg-surface-2 px-2 text-center text-3xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            </div>
          ) : (
            <div className="flex items-end justify-center gap-3">
              {/* A move that's never loaded (hanging raises) gets no weight field
                  at all rather than an empty "added lbs" box. */}
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
                      onChange={(e) => editSet({ weightLbs: toWeight(e.target.value) })}
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
                  onChange={(e) => editSet({ reps: Number(e.target.value) || 0 })}
                  className="min-h-[64px] w-full rounded-xl bg-surface-2 px-2 text-center text-3xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Every other set advances on a tap anywhere (see onScreenTap); ending the
          whole workout is worth an explicit button. It fires on pointerup rather
          than on click, because it's pressed straight out of the reps field and the
          keyboard closing under the finger would otherwise swallow the tap (see
          usePressAction). */}
      {atLast && (
        <button
          {...advancePress}
          className="mt-1 flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          finish workout
        </button>
      )}

      {rest != null && (
        <RestTimer
          seconds={rest.seconds}
          endsAt={rest.endsAt}
          // The same top of the screen the set behind it has — the bar, the lift,
          // the set coming, the trend button and this session's own controls all
          // included, so nothing up there moves when rest opens.
          header={topBar}
          // `targetNumbers` is the coming set's target: the numbers to walk back to
          // the bar with, on the rests that should carry them (see lib/rest).
          upNextTarget={upNextTargetLabel(step.setIndex, targetNumbers)}
          fastMode={fastMode}
          onClose={closeRest}
        />
      )}

      {/* The beat every rest ends on (see closeRest). The same top of the screen
          once more, so the bar, the lift and the set coming don't move between
          rest, count and set. A tap gets on with it. */}
      {preparing && (
        <GetReady
          seconds={GET_READY_SEC}
          header={topBar}
          onDone={() => {
            setPreparing(false)
            activeStartRef.current = Date.now()
          }}
        />
      )}

      {/* Above the rest screen it plays over, and below the full-screen celebrations
          (z-60), which own the moment when one of them is up. */}
      {cheer && <SetCheer key={cheer.id} grade={cheer.grade} onDone={() => setCheer(null)} />}

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
          // A hold logs its seconds in the reps field, so its sets read as seconds
          // rather than as a count of something (see PlannedExercise.timed).
          unit={planned.timed ? 'sec' : 'rep'}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showCircuitRest && stations.length > 0 && (
        // Above the rest overlay (z-50) — reachable from the rest screen's menu.
        <div
          className="fixed inset-0 z-60 flex items-end bg-black/60"
          onClick={() => setShowCircuitRest(false)}
        >
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-3 text-lg font-bold">rest between these moves</h3>
            <div className="flex flex-col gap-1">
              {/* One row per station, so a circuit that rests after only one of
                  them is set in one place instead of a move at a time. */}
              {stations.map((e) => (
                <label key={e.key} className="flex items-center gap-3 rounded-xl px-2 py-1">
                  <span className="min-w-0 flex-1 truncate font-medium">after {e.name}</span>
                  <select
                    value={e.circuitRestSec ?? ''}
                    onChange={(ev) =>
                      setCircuitRest(e.key, ev.target.value === '' ? null : Number(ev.target.value))
                    }
                    className="min-h-[44px] shrink-0 rounded-xl bg-surface-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {CIRCUIT_REST_CHOICES.map((sec) => (
                      <option key={sec ?? 'default'} value={sec ?? ''}>
                        {circuitRestLabel(sec)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {/* And the break after the whole round, which belongs to the circuit
                  rather than to any one station of it. Only where a round rest is
                  actually part of how the circuit is programmed — elsewhere the wrap
                  is sized to the coming exercise and there's nothing here to set. */}
              {stations.some((e) => e.circuitRoundRestSec != null) && (
                <label className="flex items-center gap-3 rounded-xl px-2 py-1">
                  <span className="min-w-0 flex-1 truncate font-medium">after the round</span>
                  <select
                    value={planned.circuitRoundRestSec ?? ''}
                    onChange={(ev) =>
                      setCircuitRoundRest(ev.target.value === '' ? null : Number(ev.target.value))
                    }
                    className="min-h-[44px] shrink-0 rounded-xl bg-surface-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {CIRCUIT_ROUND_REST_CHOICES.map((sec) => (
                      <option key={sec ?? 'default'} value={sec ?? ''}>
                        {circuitRestLabel(sec)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </div>
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
              {exercises.map((e) => {
                const isSkipped = skipped.has(e.key)
                const complete = isComplete(e.key)
                // Land on the first set of it still owed — picking an exercise you
                // half finished means carrying on with it, not redoing set one.
                // Falls back to its first set when they're all logged. By key
                // rather than by list position: the step list is built from the
                // exercises still in play, so the two only line up until a skip.
                const firstStep = steps.findIndex((s, si) => s.ex.key === e.key && !stepDone[si])
                const jumpStep = firstStep >= 0 ? firstStep : steps.findIndex((s) => s.ex.key === e.key)
                return (
                  <div
                    key={e.key}
                    className={`flex items-center gap-2 rounded-xl px-2 ${planned.key === e.key ? 'bg-surface-2' : ''}`}
                  >
                    <button
                      onClick={() => {
                        // A skipped exercise has no step to jump to until it's
                        // back in the flow, so choosing it puts it back.
                        if (isSkipped) unskipAndJump(e.key)
                        else {
                          if (jumpStep >= 0) setCurrent(jumpStep)
                          // Jumping is a decision to start that exercise now, so an
                          // in-flight rest ends rather than covering it back up.
                          // The set we're landing on is the one the count is for,
                          // not the one the rest was counting down to.
                          if (rest) closeRest()
                        }
                        setShowList(false)
                      }}
                      className={`flex-1 py-3 text-left active:opacity-70 ${isSkipped ? 'opacity-50' : ''}`}
                    >
                      <span className="text-[10px] tracking-wide text-neutral-500">{e.group}</span>
                      <span className={`block font-medium ${isSkipped ? 'line-through' : ''}`}>{e.name}</span>
                      <span className="text-xs text-neutral-500 tabular-nums">
                        {doneCount(e.key)}/{logFor(e.key)?.sets.length ?? e.sets} sets
                      </span>
                    </button>
                    {(isSkipped || skippable(e.key)) && (
                      <button
                        onClick={() => setExerciseSkipped(e.key, !isSkipped)}
                        aria-label={isSkipped ? `unskip ${e.name}` : `skip ${e.name}`}
                        className="p-2 text-2xl"
                      >
                        <MdBlock className={isSkipped ? 'text-neutral-200' : 'text-neutral-600'} aria-hidden />
                      </button>
                    )}
                    {/* Nothing to mark done on an exercise that isn't being done. */}
                    {!isSkipped && (
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
                    )}
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
