import { useEffect, useMemo, useRef, useState } from 'react'
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
import { buildSetOrder, circuitStations, roundSteps } from '../../lib/circuit'
import { nextUnfinishedStep, remainingFlow } from '../../lib/setFlow'
import { nextFastMode, rollsThroughRest, startsNewExercise, turboSetMs, type FastMode } from '../../lib/fastMode'
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
  resumeRestTally,
  staleRestSec,
  upNextTargetLabel,
  type RestTally,
} from '../../lib/rest'
import { ExerciseHistorySheet } from '../../components/ExerciseHistorySheet'
import {
  formatDuration,
  WORK_PER_SET_SEC,
  type ExerciseTimeSample,
  type RemainingStep,
} from '../../lib/estimate'
import { toISODate } from '../../lib/dates'
import { toWeight } from '../../lib/weightField'
import { usePressAction } from '../../lib/usePressAction'
import { useScreenTap } from '../../lib/useScreenTap'
import { useIdleTimeout } from '../../lib/useIdleTimeout'
import { useOnHidden } from '../../lib/useOnHidden'
import { useBackGuard } from '../../lib/useBackGuard'
import { useWakeLock } from '../../lib/useWakeLock'
import { storage, type ActiveRest } from '../../services/storage'
import { useActiveSession } from './useActiveSession'
import { RestTimer } from '../../components/RestTimer'
import { HoldTimer } from '../../components/HoldTimer'
import { SessionProgress } from '../../components/SessionProgress'
import { ChecklistClock } from '../../components/ChecklistClock'
import { clockText, closeSet, endRest, restAfter, resumeSetClock, spentByExercise, type SetClock } from '../../lib/setClock'
import { remainingTiming, workoutTimingKey, sumTiming, timeLeftByExercise } from '../../lib/remainingTiming'
import { useStepElapsed } from '../../lib/useStepElapsed'
import { PauseOverlay } from '../../components/PauseOverlay'
import { KebabMenu, type MenuItem } from '../../components/KebabMenu'
import { FastForwardToggle } from '../../components/FastForwardToggle'
import { SetCheer } from '../../components/SetCheer'
import { useSessionFade } from '../../lib/useSessionFade'

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
  return flow.map((s, i, arr) => ({
    exercise: s.ex.key,
    fallbackActiveSec: WORK_PER_SET_SEC,
    prescribedRestSec: restBetweenSteps(s, arr[i + 1]),
  }))
}

/**
 * The rest between one step and the step the flow goes to after it (see
 * lib/rest.restBeforeNextSet). Coming back around to a circuit station starts a
 * fresh round — the set number goes up — rather than continuing the current one.
 */
function restBetweenSteps(s: SetStep, next: SetStep | null | undefined): number {
  const sameCircuit = !!next && !!s.ex.circuit && next.ex.circuit === s.ex.circuit
  return restBeforeNextSet({
    currentRestSec: s.ex.restSec,
    sameExercise: !!next && next.ex.key === s.ex.key,
    nextRestSec: next ? next.ex.restSec : null,
    sameCircuit,
    newCircuitRound: sameCircuit && next.setIndex > s.setIndex,
    circuitRestSec: s.ex.circuitRestSec,
    circuitRoundRestSec: s.ex.circuitRoundRestSec,
    roundScreen: s.ex.roundScreen,
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
  // Resuming halfway through a set cannot supply a complete timing sample.
  const [resumedPartialKey] = useState(() => rest == null ? storage.loadActiveStepKey() : null)
  // A step to jump to as soon as it exists — a set added mid-rest, which only
  // appears in the flow once the log it's counted from has updated (see addSet).
  const [pendingStepKey, setPendingStepKey] = useState<string | null>(null)
  const [showList, setShowList] = useState(false)
  const [showAddExercise, setShowAddExercise] = useState(false)
  const [newExerciseName, setNewExerciseName] = useState('')
  const [newExerciseSets, setNewExerciseSets] = useState('1')
  const [newExerciseReps, setNewExerciseReps] = useState('10')
  const [newExerciseWeight, setNewExerciseWeight] = useState('')
  const [paused, setPaused] = useState(false)
  // The exercise whose history sheet is open: the one on screen, or on a round
  // screen whichever station's trend button was pressed.
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const [showCircuitRest, setShowCircuitRest] = useState(false)
  // A first set that's a hold waits on a tap to begin (see `awaitingStart`).
  const [started, setStarted] = useState(false)
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
  // What each set has actually cost on the wall clock, its rest included — the
  // checklist's "took" beside each finished exercise. Mirrored like the tally.
  const setClock = useRef<SetClock>(resumeSetClock(storage.loadSetClock(), session.sessionId, session.startedAt, Date.now()))
  // When the rest on screen opened — for a resumed one that's before the reload,
  // so it's credited from its real start.
  const restStartRef = useRef(rest ? rest.endsAt - rest.seconds * 1000 : 0)
  // Existing flow handlers use this marker to disqualify interrupted samples.
  // The active clock below measures time, excluding overlays and rest; completed
  // observations are persisted by set so reloads do not discard the history.
  const activeStartRef = useRef(Date.now())
  const [savedExerciseTimes] = useState(() => storage.loadActiveExerciseTimes())
  const activeSamples = useRef<Record<string, ExerciseTimeSample[]>>(
    savedExerciseTimes?.sessionId === session.sessionId ? savedExerciseTimes.samples : {},
  )

  const day = plan[session.dayType]
  // The day as this session is actually performing it: the A/B variant's set
  // counts and press order, and which arm leads the one-arm-at-a-time work —
  // both pinned when the session started.
  const exercises = useMemo(
    () => [
      ...sideOrderedExercises(variantExercises(day, session.variant ?? null), session.startSide),
      ...(session.adHocExercises ?? []),
    ],
    [day, session.variant, session.startSide, session.adHocExercises],
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
  // The sets on screen: this one, or for a circuit run a round at a time every
  // station's set of the round, entered together and logged with one tap (see
  // lib/circuit.roundSteps).
  const round = useMemo(
    () => roundSteps(inPlay, steps, stepDone, safeCurrent),
    [inPlay, steps, stepDone, safeCurrent],
  )
  const roundMode = !!step.ex.roundScreen && !!step.ex.circuit
  const roundOnScreen = round.map((i) => steps[i])
  // The set the rest is timed from: the round's last station, which is the one
  // that wraps the circuit.
  const lastOnScreen = roundOnScreen[roundOnScreen.length - 1] ?? step

  // Where "next" goes from here — the nearest set still owed, skipping the ones
  // already logged and the rest of the round being logged with this one, rather
  // than the step one along. Null once this is the last one left, which is what
  // makes the button say finish.
  const upcoming = useMemo(() => {
    const done = stepDone.slice()
    for (const i of round) done[i] = true
    return nextUnfinishedStep(done, safeCurrent)
  }, [stepDone, safeCurrent, round])
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
    rest == null && !paused && !showList && !showAddExercise && historyKey == null && !showCircuitRest,
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
  useBackGuard(showAddExercise, () => setShowAddExercise(false))

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
  const goals = useMemo(
    () => buildGoals({ workouts, bodyWeights, measurements, heightIn: settings.heightIn ?? 0 }),
    [workouts, bodyWeights, measurements, settings.heightIn],
  )
  const goalCue = useMemo(() => {
    const reps = target?.reps ?? planned.repMin
    return goalCueForExercise(settings.lockedGoals ?? {}, goals, planned.key, reps)
  }, [goals, settings.lockedGoals, target?.reps, planned.key, planned.repMin])

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

  // The opening set of a workout, before anything is logged. Walking over and
  // loading the bar happen on this screen, so its seconds aren't a set's seconds:
  // the active-time average doesn't learn from it (see recordActiveForCurrent) and
  // turbo doesn't log it out from under you while you're still loading.
  const opening = !started && safeCurrent === 0 && totals.done === 0
  // Only a hold waits for a tap to begin, because only a hold has a clock on screen
  // that would otherwise run while you get down on the mat. A set of reps has
  // nothing to start — a start tap there changed nothing you could see, so it read
  // as a tap that didn't take — and its first tap logs it, like every other set's.
  const awaitingStart = opening && !!planned.timed

  const start = () => {
    activeStartRef.current = Date.now()
    setStarted(true)
  }

  const readActiveSec = useStepElapsed(step.stepKey, !opening && !set?.done &&
    rest == null && !paused && !showList && !showAddExercise && historyKey == null && !showCircuitRest)
  const [estimateNow, setEstimateNow] = useState(Date.now)
  useEffect(() => {
    if (!rest) return
    const timer = window.setInterval(() => setEstimateNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [rest])
  const remaining = remainingFlow(stepDone, safeCurrent).filter((i) => !stepDone[i]).map((i) => steps[i])
  const timingFor = (flow: SetStep[]) => priceFlow(flow).map((price, i) => ({
    ...price,
    exercise: workoutTimingKey(price.exercise, logFor(price.exercise)?.sets[flow[i].setIndex]?.reps ?? flow[i].ex.repMin),
    fallbackExercise: price.exercise,
    fixedActiveSec: flow[i].ex.timed ? logFor(price.exercise)?.sets[flow[i].setIndex]?.reps ?? flow[i].ex.repMin : undefined,
    key: flow[i].stepKey,
    label: `${flow[i].ex.name} · set ${flow[i].setIndex + 1}`,
  }))
  const remainingRows = remainingTiming(exerciseAverages, timingFor(remaining), remaining[0]?.stepKey === step.stepKey ? readActiveSec() : 0,
    rest ? Math.max(0, (rest.endsAt - Math.max(estimateNow, Date.now())) / 1000) : 0)
  const timeLeft = remainingRows.reduce((sum, row) => sum + row.totalSec, 0)
  const exerciseOf = (key: string) => steps.find((s) => s.stepKey === key)?.ex.key
  const exerciseTimeLeft = timeLeftByExercise(remainingRows, exerciseOf)
  // A finished exercise's time against what the whole flow priced it at. Read only
  // while the checklist is up; the rest screen's tick keeps a running rest live.
  const exerciseProjected = showList ? timeLeftByExercise(remainingTiming(exerciseAverages, timingFor(steps)), exerciseOf) : null
  const exerciseSpent = showList ? spentByExercise(setClock.current, Date.now(), exerciseOf) : null

  // Type into the set on screen. Counted as an edit as well as stored, so turbo's
  // clock starts the wait over instead of logging a half-typed number.
  const editSet = (patch: Partial<SetLog>, at: SetStep = step) => {
    controls.updateSet(at.ex.key, at.setIndex, patch)
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
  //
  // A round screen is one stretch of time for every station on it, so each is
  // charged an even share — the stations are priced a set at a time, and the
  // share is what a set of each cost.
  const recordActiveForCurrent = () => {
    if (!activeStartRef.current) return
    const sec = readActiveSec()
    activeStartRef.current = 0
    if (sec < MIN_SET_ACTIVE_SEC || sec > MAX_SET_ACTIVE_SEC) return
    if (opening || fastMode === 'turbo') return
    const share = sec / roundOnScreen.length
    for (const s of roundOnScreen) {
      const logged = logFor(s.ex.key)?.sets[s.setIndex]
      if (logged?.done || s.stepKey === resumedPartialKey) continue
      // Keep the broad average for old consumers, and learn matching rep counts separately.
      activeSamples.current[s.stepKey] = [s.ex.key, workoutTimingKey(s.ex.key, logged?.reps ?? s.ex.repMin)]
        .map((exercise) => ({ exercise, totalActiveSec: share, sets: 1 }))
    }
    storage.saveActiveExerciseTimes({ sessionId: session.sessionId, samples: activeSamples.current })
  }

  /** Update the rest tally and mirror it, so a reload resumes it rather than restarting. */
  const commitTally = (next: RestTally) => {
    tally.current = next
    storage.saveRestTally(next)
  }

  const commitSetClock = (next: SetClock) => {
    setClock.current = next
    storage.saveSetClock(next)
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
    const performed = new Set(steps.filter((_, i) => stepDone[i] || round.includes(i)).map((s) => s.stepKey))
    const exercises = Object.entries(activeSamples.current).filter(([key]) => performed.has(key)).flatMap(([, samples]) => samples)
    void logExerciseTimes({
      exercises,
      restTotalSec: restSec,
      restPrescribedSec: rested.prescribedSec,
      restCount: rested.count,
    })
    storage.saveActiveExerciseTimes(null)

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
    const projected = sumTiming(remainingTiming(exerciseAverages, timingFor(steps)))
    onFinish(cleaned, { totalSec, restSec, projected })
  }

  // Accumulate the just-ended rest slice and put the set it leads into on the
  // clock.
  const closeRest = () => {
    commitTally(bankRest(tally.current, restStartRef.current, Date.now()))
    commitSetClock(endRest(setClock.current, Date.now()))
    restStartRef.current = 0
    activeStartRef.current = Date.now()
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
    // closeRest also banks an in-flight rest.
    activeStartRef.current = Date.now()
    if (rest) closeRest()
  }

  // Rest again before the set on screen — for the rest that was cut short, or the
  // one hands-free rolled straight through. The seconds count like any other rest,
  // and the time already spent on this set screen is dropped rather than carried
  // through the rest: an exercise's average has nothing to learn from a set that
  // was stood down from halfway.
  const reopenRest = (sec: number) => {
    if (sec <= 0) {
      activeStartRef.current = Date.now()
      return
    }
    activeStartRef.current = 0
    restStartRef.current = Date.now()
    commitTally(openRest(tally.current, sec))
    setRest({
      seconds: sec,
      endsAt: Date.now() + sec * 1000,
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
   * On a round screen it's timed from the round's last station, which is the one
   * that wraps the circuit.
   *
   * On the last set of all there's no transition to price, so it falls back to the
   * exercise's own rest — the number "back to rest" reopens.
   */
  const restShownSec = useMemo(
    () => (nextStep ? restBetweenSteps(lastOnScreen, nextStep) : lastOnScreen.ex.restSec),
    [lastOnScreen, nextStep],
  )

  // Mark the current set done and either rest into the next set or finish.
  //
  // `finalReps` is a set whose number was measured rather than typed: a timed hold
  // that ended itself hands over the seconds the clock really ran, which go into
  // the same field the reps do. Written with the set rather than before it, so the
  // cheer and the carry-forward below read what's being logged instead of the
  // prefilled prescription it replaced.
  //
  // A round screen logs every station on it at once, the same way.
  const completeSetAndAdvance = (finalReps?: number) => {
    recordActiveForCurrent()
    const logged = roundOnScreen.map((s) => {
      const l = logFor(s.ex.key)?.sets[s.setIndex]
      // Only the set on screen can have been measured — a round is never timed.
      const measured = s === step ? finalReps : undefined
      const reps = measured ?? l?.reps ?? 0
      controls.updateSet(s.ex.key, s.setIndex, { done: true, ...(measured != null && { reps: measured }) })
      return { s, l, reps }
    })
    if (!nextStep || upcoming == null) {
      // No cheer on the last set: finishing hands the screen straight to the
      // recap, which has its own (louder) celebration to give.
      finish()
      return
    }
    // Cheer what the numbers on screen actually were — the flourish plays over the
    // rest that's about to open, so nothing waits on it (see SetCheer). A round is
    // cheered as a whole: only when every station of it met its target, and as a
    // beat when any of them went past.
    const grades = logged.map(({ s, l, reps }) => gradeSet(l?.weightLbs ?? null, reps, targets.get(s.ex.key)))
    const grade = grades.every((g) => g != null) ? (grades.includes('beat') ? 'beat' : grades[0]) : null
    if (grade) {
      cheerId.current += 1
      setCheer({ id: cheerId.current, grade })
    }
    // Carry this set's actual weight/reps forward to the sets of this exercise
    // still to come, so after the first one they prefill what you just did rather
    // than the target (see carryLoggedSet). Every one of them, not only the next
    // screen: a circuit station's own next set is two stations away, and the
    // checklist can jump you to any of them.
    for (const { s, l, reps } of logged) {
      if (l) controls.carrySet(s.ex.key, { weightLbs: l.weightLbs ?? null, reps })
    }
    // The rest the header has been naming all along (see restShownSec) — one
    // computation for both, so the break you get is the one you were shown.
    const restSec = restShownSec
    // What the set clock charges this screen's time to: the set, or every set of
    // the round, which share it.
    const clockKeys = roundOnScreen.length > 1 ? roundOnScreen.map((s) => s.stepKey) : step.stepKey
    setCurrent(upcoming)
    if (restSec <= 0) {
      // A station set to no rest goes straight on to the next move: a zero-second
      // timer would open already in overtime, and it isn't a rest to be counted.
      activeStartRef.current = Date.now()
      commitSetClock(closeSet(setClock.current, clockKeys, Date.now()))
      return
    }
    restStartRef.current = Date.now()
    commitSetClock(restAfter(setClock.current, clockKeys))
    // Banked as the rest opens, not when it closes: a reload mid-rest recovers the
    // seconds from the saved `endsAt`, but not that the interval ever happened.
    commitTally(openRest(tally.current, restSec))
    setRest({
      seconds: restSec,
      endsAt: Date.now() + restSec * 1000,
      exKey: lastOnScreen.ex.key,
      isLastSetOfExercise: lastOnScreen.setIndex === lastOnScreen.setCount - 1,
    })
  }

  // Add a set to whichever exercise is in play. During an exercise's *final* rest
  // the new set is what the rest should lead into, so jump to it and drop out of
  // rest; anywhere else it just extends the exercise further down the flow.
  //
  // A circuit run a round at a time grows by a round — a set at every station —
  // since a set added to one station alone would be a round of one.
  const addSet = () => {
    const key = rest ? rest.exKey : planned.key
    const at = inPlay.findIndex((e) => e.key === key)
    const keys = inPlay[at]?.roundScreen ? circuitStations(inPlay, at).map((i) => inPlay[i].key) : [key]
    for (const k of keys) controls.addSet(k)
    if (rest?.isLastSetOfExercise) {
      // By key, not by index: the rest was leading somewhere else entirely once
      // sets can be done out of order, so where the new set lands in the reshaped
      // step list isn't the index `current` happens to sit at.
      setPendingStepKey(`${keys[0]}:${logFor(keys[0])?.sets.length ?? 0}`)
      closeRest()
    }
  }

  const addAdHocExercise = () => {
    const name = newExerciseName.trim()
    const sets = Math.max(1, Math.min(20, Number(newExerciseSets) || 1))
    const reps = Math.max(1, Math.min(999, Number(newExerciseReps) || 1))
    if (!name) return
    const key = controls.addExercise({
      name,
      sets,
      reps,
      weightLbs: newExerciseWeight === '' ? null : toWeight(newExerciseWeight),
    })
    setPendingStepKey(`${key}:0`)
    activeStartRef.current = Date.now()
    if (rest) closeRest()
    setNewExerciseName('')
    setNewExerciseSets('1')
    setNewExerciseReps('10')
    setNewExerciseWeight('')
    setShowAddExercise(false)
    setShowList(false)
  }

  const advancePress = usePressAction(completeSetAndAdvance)

  // Turbo: the set on screen logs itself, so a workout of prefilled targets runs
  // end to end without a tap. The wait is this exercise's own learned average
  // active time — what a set of it normally takes you, the same measurement the
  // time-left estimate is priced from — not one flat number across every lift.
  //
  // Held off in the places where accepting the numbers wouldn't be right: the
  // opening set (still yours, since you may still be loading the bar), a
  // set with no reps in it yet (there'd be nothing to log), and the last set of
  // all, which finishes the workout — that stays a deliberate press. Rest and any
  // overlay disarm it too: rest already advances itself, and reading the checklist
  // isn't standing at the bar.
  //
  // A hold with its clock running is the last of them, and the one place an
  // average would be wrong outright: the plank is over when its own prescribed
  // time is up, not when a set of it usually takes, so the clock closes that set
  // instead (see `holdEndsItself`).
  const advanceRef = useRef(completeSetAndAdvance)
  advanceRef.current = completeSetAndAdvance
  // Nothing between you and the set: no rest, no sheet, no pause. What
  // both the turbo wait and a self-ending hold need to be true before they can
  // close a set on their own.
  const setScreenLive =
    rest == null && !paused && !showList && !showAddExercise && historyKey == null && !showCircuitRest
  // A round screen waits for every station on it, back to back.
  const turboMs = roundOnScreen.reduce((sum, s) => sum + turboSetMs(exerciseAverages, s.ex.key), 0)
  const turboArmed =
    fastMode === 'turbo' &&
    !opening &&
    !atLast &&
    roundOnScreen.every((s) => (logFor(s.ex.key)?.sets[s.setIndex]?.reps ?? 0) > 0) &&
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
  // A hold that opens the workout is the exception: there the first tap starts its
  // clock instead (see `awaitingStart`), so the plank isn't timed from the moment
  // the screen came up.
  const screenTap = useScreenTap(() => {
    if (atLast || !setScreenLive) return
    if (awaitingStart) {
      start()
      return
    }
    completeSetAndAdvance()
  }, !atLast && setScreenLive)

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

  // How many rounds the circuit runs: its longest station, since a station that
  // has run out of sets just drops out of the last rounds (see lib/circuit).
  const roundCount = Math.max(0, ...stations.map((e) => logFor(e.key)?.sets.length ?? e.sets))

  // What each station of a round screen is going for: its target, whether that's a
  // step up from last time, and the goal riding on it — the same three cues the
  // set screen gives a single set.
  const roundCues = useMemo(
    () =>
      roundOnScreen.map((s) => {
        const t = targets.get(s.ex.key)
        const reps = t?.reps ?? s.ex.repMin
        return {
          hint: targetLabel(t, s.ex.timed),
          challenging: !!t && isChallenge(workouts, s.ex.key, t, s.ex.repMin, progressionVariant(s.ex.key, session.variant)),
          goal: goalCueForExercise(settings.lockedGoals ?? {}, goals, s.ex.key, reps),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, steps, targets, workouts, goals, settings.lockedGoals, session.variant],
  )

  // The weight × reps entry for one set: the set on screen, or one station of a
  // round, which sits four to a screen and so takes a shorter field.
  const setFields = (at: SetStep, logged: SetLog, compact = false) => {
    const field = `${compact ? 'min-h-[52px] text-2xl' : 'min-h-[64px] text-3xl'} w-full rounded-xl bg-surface-2 px-2 text-center font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent`
    return (
      <div className="flex items-end justify-center gap-3">
        {/* A move that's never loaded (hanging raises) gets no weight field
            at all rather than an empty "added lbs" box. */}
        {!at.ex.repsOnly && (
          <>
            <label className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs tracking-wide text-neutral-500">
                {at.ex.bodyweight ? 'added lbs' : 'weight'}
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder={at.ex.bodyweight ? 'bw' : 'lbs'}
                value={logged.weightLbs ?? ''}
                onChange={(e) => editSet({ weightLbs: toWeight(e.target.value) }, at)}
                className={field}
              />
            </label>
            <span className={`${compact ? 'pb-4' : 'pb-5'} text-2xl text-neutral-600`}>×</span>
          </>
        )}
        <label className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs tracking-wide text-neutral-500">reps</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="reps"
            value={logged.reps || ''}
            onChange={(e) => editSet({ reps: Number(e.target.value) || 0 }, at)}
            className={field}
          />
        </label>
      </div>
    )
  }

  // Shared by the header and the rest screen, so the same actions stay reachable
  // while resting instead of forcing you to end rest to get at them.
  const menuItems: MenuItem[] = [
    // Off the rest screen only — there's nothing to go back to while it's up, and
    // nothing to rest before if the workout hasn't started.
    ...(rest == null && !opening && restShownSec > 0
      ? [{ label: 'back to rest', onClick: () => reopenRest(restShownSec) }]
      : []),
    // Only inside a circuit: everywhere else the rest after a set is simply the
    // exercise's own, and there's nothing per-station to choose between.
    ...(stations.length > 0
      ? [{ label: roundMode ? 'rest between rounds' : 'rest between these moves', onClick: () => setShowCircuitRest(true) }]
      : []),
    { label: roundMode ? 'add a round' : 'add a set', onClick: addSet },
    { label: 'pause workout', onClick: () => setPaused(true) },
    { label: 'finish and log', onClick: finish },
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
        onTimeClick={() => setShowList(true)}
      />

      <header className="flex items-start justify-between gap-2">
        {/* The controls beside it are 44px tap targets with their glyphs centred, so
            the name takes the same band: its first line lands on their centreline
            instead of riding above it, and a name long enough to wrap still starts
            level with them. */}
        <h2 className="min-w-0 py-1 text-3xl font-bold leading-9">{roundMode ? planned.group : planned.name}</h2>
        {/* A tap on the rest screen ends rest, so these keep theirs to themselves. */}
        <div className="flex shrink-0 items-start" onClick={(e) => e.stopPropagation()}>
          {/* Puts the set in the context of the whole history for the lift. A round
              screen has one of these per station instead. */}
          {!roundMode && (
            <button
              onClick={() => setHistoryKey(planned.key)}
              aria-label={`recent sessions for ${planned.name}`}
              className="flex min-h-[44px] w-11 items-center justify-center rounded-xl text-neutral-400 active:bg-surface-2"
            >
              <MdShowChart className="text-2xl" aria-hidden />
            </button>
          )}
          <FastForwardToggle mode={fastMode} onPress={stepFast} />
          <KebabMenu items={menuItems} />
        </div>
      </header>

      {/* The muscle group is left off a single lift: the name already says it. */}
      {roundMode ? (
        <p className="-mt-2 text-lg font-medium text-neutral-400">
          round <span className="tabular-nums">{step.setIndex + 1}/{roundCount}</span> · rest{' '}
          {restLabel(restShownSec)}
        </p>
      ) : (
        <p className="-mt-2 text-lg font-medium text-neutral-400">
          set <span className="tabular-nums">{step.setIndex + 1}/{step.setCount}</span> ·{' '}
          {repRangeLabel(planned)} {planned.timed ? 'sec' : 'reps'} · rest {restLabel(restShownSec)}
        </p>
      )}
    </div>
  )

  const historyEx = historyKey == null ? undefined : exercises.find((e) => e.key === historyKey)

  const fadeRef = useSessionFade(
    rest ? 'rest' : `${step.stepKey}:${awaitingStart ? 'preview' : 'work'}`,
  )

  return (
    // min-h-full: the tap target is this element, so it has to reach the bottom of
    // the screen rather than stop where the set card does (the stretch routine's
    // root fills the screen the same way).
    <div ref={fadeRef} className="flex min-h-full flex-col gap-3 pb-6" {...screenTap}>
      {topBar}

      {!roundMode && set && (
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
                // back down the moment it isn't: rest, the pause curtain and any
                // open sheet all hold the clock with its
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
            setFields(step, set)
          )}
        </div>
      )}

      {/* A round of the circuit: every station's set on one screen, entered as you
          go and logged together by the one tap that ends the round. */}
      {roundMode && (
        <div className="flex flex-col gap-3">
          {roundOnScreen.map((s, i) => {
            const logged = logFor(s.ex.key)?.sets[s.setIndex]
            if (!logged) return null
            const { hint: cue, challenging: stepUp, goal } = roundCues[i] ?? {}
            return (
              <div key={s.stepKey} className="flex flex-col gap-2 rounded-2xl bg-surface px-4 pb-4 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="min-w-0 truncate font-semibold">{s.ex.name}</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    {cue && (
                      <span
                        className={`flex items-center gap-1 text-xs font-medium ${
                          stepUp ? 'rounded-lg bg-accent/15 px-2 py-1 font-bold text-accent' : 'text-accent'
                        }`}
                      >
                        {stepUp ? <MdBolt aria-hidden /> : <MdTrackChanges aria-hidden />}
                        {cue}
                      </span>
                    )}
                    <button
                      onClick={() => setHistoryKey(s.ex.key)}
                      aria-label={`recent sessions for ${s.ex.name}`}
                      className="flex min-h-[44px] w-11 items-center justify-center rounded-xl text-neutral-400 active:bg-surface-2"
                    >
                      <MdShowChart className="text-2xl" aria-hidden />
                    </button>
                  </div>
                </div>
                {goal && (goal.ready || goal.standing !== 'ahead') && (
                  <p
                    className={`flex items-center gap-1.5 text-xs font-medium ${
                      goal.ready ? 'text-accent-bright' : 'text-accent-2'
                    }`}
                  >
                    <MdFlag aria-hidden />
                    {goal.goalTitle}
                    {goal.ready ? ' — ready: ' : ': '}
                    {goal.weightLbs} × {goal.reps}
                  </p>
                )}
                {setFields(s, logged, true)}
              </div>
            )
          })}
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
          className="mt-1 flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-on-accent active:opacity-80"
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
          // Hands-free stands down on the way into an exercise you haven't
          // started: the rest waits for your tap, with its seconds showing, and
          // the mode picks up again from that exercise's first set (see
          // lib/fastMode's startsNewExercise). The set on screen is already the
          // coming one — the flow moved on as the rest opened.
          fastMode={
            startsNewExercise(rest.exKey, planned.key, !!log?.sets.some((s) => s.done)) ? 'off' : fastMode
          }
          onClose={closeRest}
        />
      )}

      {/* Above the rest screen it plays over, and below the full-screen celebrations
          (z-60), which own the moment when one of them is up. */}
      {cheer && <SetCheer key={cheer.id} grade={cheer.grade} onDone={() => setCheer(null)} />}

      {paused && <PauseOverlay label="workout paused" onResume={() => setPaused(false)} />}

      {historyEx && (
        <ExerciseHistorySheet
          exerciseKey={historyEx.key}
          name={historyEx.name}
          target={targets.get(historyEx.key)}
          slot={progressionVariant(historyEx.key, session.variant) ?? undefined}
          // Only a genuinely unloadable move charts as reps: weighted pull-ups are
          // flagged `bodyweight` but do take added weight, so they keep the
          // weight-based metrics.
          repsOnly={!!historyEx.repsOnly}
          // A hold logs its seconds in the reps field, so its sets read as seconds
          // rather than as a count of something (see PlannedExercise.timed).
          unit={historyEx.timed ? 'sec' : 'rep'}
          onClose={() => setHistoryKey(null)}
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
            <h3 className="mb-3 text-lg font-bold">{roundMode ? 'rest between rounds' : 'rest between these moves'}</h3>
            <div className="flex flex-col gap-1">
              {/* One row per station, so a circuit that rests after only one of
                  them is set in one place instead of a move at a time. */}
              {/* Not on a round screen, whose stations go back to back with no rest
                  between them to set. */}
              {!roundMode && stations.map((e) => (
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
              {(roundMode || stations.some((e) => e.circuitRoundRestSec != null)) && (
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
            <h3 className="mb-3 text-lg font-bold">workout checklist</h3>
            <ChecklistClock
              startedAt={session.startedAt}
              readRestSec={(now) => tally.current.takenSec + (restStartRef.current ? Math.max(0, (now - restStartRef.current) / 1000) : 0)}
              left={sumTiming(remainingRows)}
            />
            <button
              onClick={() => setShowAddExercise(true)}
              className="mb-3 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-accent px-3 font-semibold text-on-accent active:opacity-80"
            >
              + add exercise
            </button>
            <div className="flex flex-col gap-1">
              {exercises.map((e) => {
                const isSkipped = skipped.has(e.key)
                const complete = isComplete(e.key)
                const exerciseLog = logFor(e.key)
                // Land on the first set of it still owed — picking an exercise you
                // half finished means carrying on with it, not redoing set one.
                // Falls back to its first set when they're all logged. By key
                // rather than by list position: the step list is built from the
                // exercises still in play, so the two only line up until a skip.
                const firstStep = steps.findIndex((s, si) => s.ex.key === e.key && !stepDone[si])
                const jumpStep = firstStep >= 0 ? firstStep : steps.findIndex((s) => s.ex.key === e.key)
                return (
                  <div key={e.key} className={`rounded-xl px-2 ${planned.key === e.key ? 'bg-surface-2' : ''}`}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          // A skipped exercise has no step to jump to until it's
                          // back in the flow, so choosing it puts it back.
                          if (isSkipped) unskipAndJump(e.key)
                          else {
                            if (jumpStep >= 0) setCurrent(jumpStep)
                            // An in-flight rest is banked first.
                            activeStartRef.current = Date.now()
                            if (rest) closeRest()
                          }
                          setShowList(false)
                        }}
                        className={`flex-1 py-3 text-left active:opacity-70 ${isSkipped ? 'opacity-50' : ''}`}
                      >
                        <span className="text-[10px] tracking-wide text-neutral-500">{e.group}</span>
                        <span className={`block font-medium ${isSkipped ? 'line-through' : ''}`}>{e.name}</span>
                        <span className="text-xs text-neutral-500 tabular-nums">
                          {doneCount(e.key)}/{exerciseLog?.sets.length ?? e.sets} sets
                          {!isSkipped && (exerciseTimeLeft.get(e.key) ?? 0) > 0 && ` · ${formatDuration(exerciseTimeLeft.get(e.key)!).replace(/^~/, '')}`}
                          {complete && (exerciseSpent?.get(e.key) ?? 0) > 0 &&
                            ` · took ${clockText(exerciseSpent!.get(e.key)!)} · est ${clockText(exerciseProjected?.get(e.key) ?? 0)}`}
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
                    {!isSkipped && exerciseLog && (
                      <div className="mb-2 flex flex-col gap-1 border-t border-neutral-200/10 pt-1">
                        {exerciseLog.sets.map((loggedSet, setIndex) => (
                          <div key={loggedSet.setNumber} className="flex items-center gap-2 px-1">
                            <span className="w-10 shrink-0 text-xs text-neutral-500">set {setIndex + 1}</span>
                            {!e.repsOnly && (
                              <label className="flex min-w-0 flex-1 items-center gap-1">
                                <span className="sr-only">set {setIndex + 1} weight</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  aria-label={`${e.name} set ${setIndex + 1} weight`}
                                  value={loggedSet.weightLbs ?? ''}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => controls.updateSet(e.key, setIndex, { weightLbs: toWeight(event.target.value) })}
                                  className="min-h-[40px] w-full rounded-lg bg-surface-2 px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                                <span className="text-xs text-neutral-500">lb</span>
                              </label>
                            )}
                            <label className="flex min-w-0 flex-1 items-center gap-1">
                              <span className="sr-only">set {setIndex + 1} reps</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="0"
                                aria-label={`${e.name} set ${setIndex + 1} reps`}
                                value={loggedSet.reps || ''}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => controls.updateSet(e.key, setIndex, { reps: Number(event.target.value) || 0 })}
                                className="min-h-[40px] w-full rounded-lg bg-surface-2 px-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
                              />
                              <span className="text-xs text-neutral-500">reps</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showAddExercise && (
        <div className="fixed inset-0 z-70 flex items-end bg-black/60" onClick={() => setShowAddExercise(false)}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-exercise-title"
            className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault()
              addAdHocExercise()
            }}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 id="add-exercise-title" className="mb-1 text-lg font-bold">add exercise</h3>
            <p className="mb-3 text-sm text-neutral-400">Add an extra exercise for this workout only.</p>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs tracking-wide text-neutral-500">name</span>
                <input
                  autoFocus
                  value={newExerciseName}
                  onChange={(event) => setNewExerciseName(event.target.value)}
                  placeholder="e.g. farmer carry"
                  className="min-h-[48px] rounded-xl bg-surface-2 px-3 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs tracking-wide text-neutral-500">sets</span>
                  <input type="number" min="1" max="20" inputMode="numeric" value={newExerciseSets} onChange={(event) => setNewExerciseSets(event.target.value)} className="min-h-[48px] rounded-xl bg-surface-2 px-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-accent" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs tracking-wide text-neutral-500">reps</span>
                  <input type="number" min="1" max="999" inputMode="numeric" value={newExerciseReps} onChange={(event) => setNewExerciseReps(event.target.value)} className="min-h-[48px] rounded-xl bg-surface-2 px-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-accent" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs tracking-wide text-neutral-500">weight (lb)</span>
                  <input type="number" min="0" step="0.5" inputMode="decimal" value={newExerciseWeight} onChange={(event) => setNewExerciseWeight(event.target.value)} placeholder="optional" className="min-h-[48px] rounded-xl bg-surface-2 px-3 tabular-nums focus:outline-none focus:ring-2 focus:ring-accent" />
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddExercise(false)} className="min-h-[48px] flex-1 rounded-xl bg-surface-2 font-semibold active:opacity-70">cancel</button>
                <button type="submit" disabled={!newExerciseName.trim()} className="min-h-[48px] flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-40">add to workout</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
