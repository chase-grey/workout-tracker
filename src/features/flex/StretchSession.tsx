import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { MdBlock, MdCheckCircle, MdRadioButtonUnchecked, MdTrackChanges } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { RestTimer } from '../../components/RestTimer'
import { SessionProgress } from '../../components/SessionProgress'
import { GetReady } from '../../components/GetReady'
import { HoldTimer } from '../../components/HoldTimer'
import { FastForwardToggle } from '../../components/FastForwardToggle'
import { PauseOverlay } from '../../components/PauseOverlay'
import { RhythmGuide } from '../../components/RhythmGuide'
import { KebabMenu, type MenuItem } from '../../components/KebabMenu'
import { PhotoStep } from './PhotoStep'
import { formatDuration, medianTotalSec, remainingSecs } from '../../lib/estimate'
import {
  buildSessionSteps,
  flexRoundKey,
  stepWorkSec,
  SEC_PER_REP,
  type CoreSetStep,
  type SessionStep,
} from '../../lib/flexSteps'
import { coldGate, PHOTO_SHOT, gateAfterStep, type PhotoGate, type PhotoKind } from '../../lib/photoSteps'
import { dueGate } from '../../lib/photoCadence'
import { type MeasureResult } from '../../lib/measure'
import { type FlexMeasurement, type StretchFinishSummary } from '../../store/DataContext'
import { FLEX_ROUTINES, type FlexRoutineKey } from '../../config/flexRoutines'
import { stretchSplit } from '../../lib/stretchSplit'
import { canResumeRest, restScreenSec, staleRestSec } from '../../lib/rest'
import { useOnHidden } from '../../lib/useOnHidden'
import { useBackGuard } from '../../lib/useBackGuard'
import { useWakeLock } from '../../lib/useWakeLock'
import { storage, type RestState } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { STRETCH_CORE, repRangeLabel } from '../../config/plan'
import {
  CORE_ENTRY_GET_READY_SEC,
  POST_PHOTO_GET_READY_SEC,
  settleInSec,
} from '../../lib/settleIn'
import { nextTarget, targetLabel } from '../../lib/progression'
import { toWeight } from '../../lib/weightField'
import { createRhythmVariantSelector } from '../../lib/rhythmVariant'

/**
 * Seconds of rest the menu hands out where the routine prescribes none — the feet
 * and the calf holds run one straight into the next. Needing a minute is about the
 * body rather than the plan, so the option is always there; the length is what the
 * rest of the routine rests for.
 */
const MANUAL_REST_SEC = 60

/**
 * A photo screen waiting to be shown, and what the routine does once it closes:
 *   - 'start'   — the cold screen, which runs before the routine has begun: settle
 *                 in and go into the first stretch.
 *   - 'advance' — mid-routine: the set at `index` starts its rest and hands on.
 *   - 'stay'    — the closing stretch set ended itself on its own clock, and the
 *                 finish button is what comes next. A routine shouldn't file
 *                 itself away while you're still in the pose.
 */
type PendingPhotos = { gate: PhotoGate; index: number | null; then: 'start' | 'advance' | 'stay' }

/**
 * Which leg, and which of the stretch's shapes: the calf stretch's foot angle, the
 * leg the floss is on. Empty for a stretch that is neither taken a side at a time
 * nor varied set to set, and for a core set.
 */
function stepPosition(s: SessionStep): string {
  if (s.kind !== 'flex') return ''
  return [s.side && `${s.side} leg`, s.setLabel].filter(Boolean).join(' · ')
}

/** Which set of how many. */
const setOfLabel = (s: SessionStep) => `set ${s.round + 1} of ${s.maxSets}`

/**
 * The big title. A stretch taken one leg at a time, in one of three shapes, is a
 * position before it is a name: which leg and which angle is the thing you need
 * off a glance with your head down, so it takes the title and the move's own name
 * drops to the line under it.
 */
const stepTitle = (s: SessionStep) => stepPosition(s) || s.exName

/** The line under the title: the move, where the title gave its place away, and the set. */
function stepDetail(s: SessionStep): string {
  return [stepPosition(s) ? s.exName : '', setOfLabel(s)].filter(Boolean).join(' · ')
}

type RoutineChecklistProps = {
  steps: SessionStep[]
  currentKey?: string
  done: Set<string>
  skipped: Set<string>
  onClose: () => void
  onJump: (stepKey: string) => void
  onToggleDone: (stepKey: string) => void
  onToggleSkipped: (exKey: string, skip: boolean) => void
}

/** The full routine stays visible here even when an exercise leaves today's flow. */
function RoutineChecklist({
  steps,
  currentKey,
  done,
  skipped,
  onClose,
  onJump,
  onToggleDone,
  onToggleSkipped,
}: RoutineChecklistProps) {
  const exercises = steps.reduce<Array<{ key: string; name: string; blockLabel: string; steps: SessionStep[] }>>(
    (groups, step) => {
      const group = groups.find((item) => item.key === step.exKey)
      if (group) group.steps.push(step)
      else groups.push({ key: step.exKey, name: step.exName, blockLabel: step.blockLabel, steps: [step] })
      return groups
    },
    [],
  )

  return (
    <div className="fixed inset-0 z-60 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <h3 className="mb-1 text-lg font-bold">routine checklist</h3>
        <p className="mb-3 text-xs text-neutral-500">tap a set to jump; tap the circle to mark it done.</p>
        <div className="flex flex-col gap-3">
          {exercises.map((exercise) => {
            const isSkipped = skipped.has(exercise.key)
            return (
              <section key={exercise.key} className="rounded-xl bg-surface-2/40 px-2 py-1">
                <div className="flex items-center gap-2">
                  <div className={`min-w-0 flex-1 py-2 ${isSkipped ? 'opacity-50' : ''}`}>
                    <span className="block text-[10px] tracking-wide text-neutral-500">{exercise.blockLabel}</span>
                    <span className={`block font-semibold ${isSkipped ? 'line-through' : ''}`}>{exercise.name}</span>
                  </div>
                  <button
                    onClick={() => onToggleSkipped(exercise.key, !isSkipped)}
                    aria-label={isSkipped ? `unskip ${exercise.name}` : `skip ${exercise.name}`}
                    className="p-2 text-2xl"
                  >
                    <MdBlock className={isSkipped ? 'text-neutral-200' : 'text-neutral-600'} aria-hidden />
                  </button>
                </div>
                {!isSkipped && (
                  <div className="flex flex-col gap-1 pb-1">
                    {exercise.steps.map((step) => {
                      const isDone = done.has(step.stepKey)
                      return (
                        <div
                          key={step.stepKey}
                          className={`flex items-center gap-2 rounded-xl px-2 ${step.stepKey === currentKey ? 'bg-surface-2' : ''}`}
                        >
                          <button
                            onClick={() => onJump(step.stepKey)}
                            className="flex-1 py-2 text-left active:opacity-70"
                          >
                            <span className="block text-sm font-medium">
                              {[stepPosition(step), setOfLabel(step)].filter(Boolean).join(' · ')}
                            </span>
                          </button>
                          <button
                            onClick={() => onToggleDone(step.stepKey)}
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
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Guided, one-set-at-a-time Stretch + Core flow: the mobility routine (with a
 * tempo rhythm animation, or a hold clock for a static stretch) followed by a
 * core block whose sets are logged as workout rows. Finishing counts as a
 * stretch/flex day.
 *
 * Which routine is running — side split or head to toe — comes in as a prop and
 * decides the blocks, the photos offered and what gets logged at the end. Whether
 * the core block is appended was decided when the session started and rides in the
 * saved snapshot: pinned, so a session resumed after another one logged core keeps
 * the shape it began with rather than growing four steps mid-routine.
 */
export function StretchSession({
  routine,
  onClose,
  onFinish,
}: {
  routine: FlexRoutineKey
  onClose: () => void
  /**
   * A session that was logged rather than abandoned, with its recap. Called
   * alongside `onClose`, once the write has gone in — the recap screen takes it
   * from there (see StretchFinishOverlay).
   */
  onFinish: (summary: StretchFinishSummary) => void
}) {
  const {
    flexPlans,
    workouts,
    flexEntries,
    logFlex,
    durations,
    finishStretch,
  } = useData()
  // Held for the session's lifetime: which Mon–Sun week the photo cadence is
  // measured against.
  const [today] = useState(() => toISODate(new Date()))
  // The whole flow resumes from this snapshot, read once on mount: an app switch
  // or accidental refresh drops you back where you were, not at the top.
  const [saved] = useState(() => storage.loadStretch())
  // A session started before the core-skip rule shipped always had its core.
  const [withCore] = useState(saved?.core ?? true)
  const [current, setCurrent] = useState(saved?.step ?? 0)
  const [done, setDone] = useState<Set<string>>(() => new Set(saved?.done ?? []))
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set(saved?.skipped ?? []))
  const [coreReps, setCoreReps] = useState<Record<number, number>>(() => saved?.coreReps ?? {})
  // Weight per core set. A round that's absent hasn't been touched and takes the
  // prescribed load; one present with null was deliberately cleared to bodyweight.
  const [coreWeights, setCoreWeights] = useState<Record<number, number | null>>(
    () => saved?.coreWeights ?? {},
  )
  // Rep the current stretch set has reached, persisted so a refresh mid-set
  // resumes the count instead of restarting at rep 1.
  const [rep, setRep] = useState(saved?.rep ?? 1)
  // A rest still running when the app closed picks up its real remaining time
  // (it's wall-clock based, so the time away counts) unless it's long stale.
  const [rest, setRest] = useState<RestState | null>(() =>
    saved?.rest && canResumeRest(saved.rest.endsAt, Date.now()) ? saved.rest : null,
  )
  // Hands-free: every rest rolls into the next set on its own and the
  // get-into-position counts that stand alone — a side switch, the crossing into
  // the core block — are skipped, until the fast-forward toggle is switched back
  // off. The count a rest ends on stays: the rest gave up its seconds for it, so
  // skipping it would only mean arriving at the pose late. Stretch sets roll into
  // their rest either way. Kept in the session's snapshot so a reload mid-routine
  // doesn't quietly start waiting for taps again.
  const [fast, setFast] = useState(!!saved?.fast)
  // True so the routine opens with the same "get into position" countdown that
  // follows each rest — but not over a resumed rest, which owns the screen first,
  // and not when the session is already running itself forward.
  const [preparing, setPreparing] = useState(rest == null && !fast)
  const [showList, setShowList] = useState(false)
  // A one-off, longer get-into-position count that replaces the upcoming set's
  // own — set when a photo screen hands the routine straight to a stretch, and
  // when a side switch replaces the settle-in with a reposition.
  const [readyOverrideSec, setReadyOverrideSec] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  // Photo screens already offered this session, so resuming doesn't re-ask.
  const [seenGates, setSeenGates] = useState<Set<string>>(() => new Set(saved?.photoGates ?? []))
  // The cold shots open the session, before anything has warmed up. A resume
  // that's already past the first set is past that moment, so it doesn't re-ask,
  // and neither does a week that already has the readings.
  const [photos, setPhotos] = useState<PendingPhotos | null>(() => {
    const cold = coldGate(routine)
    if (seenGates.has(cold.id) || (saved?.step ?? 0) > 0 || (saved?.done?.length ?? 0) > 0) {
      return null
    }
    const gate = dueGate(cold, flexEntries, today)
    return gate ? { gate, index: null, then: 'start' } : null
  })
  // When the routine began (persisted so a resumed session still measures its
  // full length) and accumulated time spent on the rest screen.
  const [startedAt] = useState(saved?.startedAt)
  // A rest too stale to reopen is settled in as the session resumes: it never
  // reaches the rest screen, so nothing else banks it, and its seconds are in the
  // total either way. The snapshot effect below writes the result straight back.
  const [resumedRestSec] = useState(
    () => Math.max(0, saved?.restSec ?? 0) + staleRestSec(saved?.rest, Date.now()),
  )
  const restAccumSec = useRef(resumedRestSec)
  // Initial value only: a resumed rest began before the reload, so credit it from
  // its real start rather than from now.
  const restStartRef = useRef(rest ? rest.endsAt - rest.seconds * 1000 : 0)

  /** Move the rest currently on the clock into the session's total. */
  const bankRest = () => {
    if (restStartRef.current) restAccumSec.current += (Date.now() - restStartRef.current) / 1000
    restStartRef.current = 0
  }

  const plan = flexPlans[routine] ?? FLEX_ROUTINES[routine].blocks
  const allSteps = useMemo(() => buildSessionSteps(plan, { core: withCore }), [plan, withCore])
  // Skipping is an exercise-level decision: all of its sides and sets leave the
  // live flow, while allSteps keeps them available to restore from the checklist.
  const steps = useMemo(
    () => allSteps.filter((step) => !skipped.has(step.exKey)),
    [allSteps, skipped],
  )
  // A per-side round is two mounted guides, but it is one set: draw once for the
  // round so either side gets the same animation. A later round has another key
  // and therefore takes the next random choice from the rotation.
  const [rhythmVariantFor] = useState(() => createRhythmVariantSelector())
  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0

  // Progression target for the core sets — weight and reps both prefilled and both
  // editable. Read from the mat sit-up's own history and nothing else: what the
  // training days press out on a strapped-in incline says nothing about what to
  // hold on the floor (see plan.MAT_SITUP_KEY).
  const coreTarget = useMemo(
    () =>
      nextTarget(workouts, STRETCH_CORE.key, {
        repMin: STRETCH_CORE.repMin,
        repMax: STRETCH_CORE.repMax,
        increment: STRETCH_CORE.increment,
      }),
    [workouts],
  )
  const coreRepsFor = (round: number) => coreReps[round] ?? coreTarget.reps
  const coreWeightFor = (round: number) =>
    round in coreWeights ? coreWeights[round] : coreTarget.weightLbs

  useEffect(() => {
    storage.saveStretch({
      step: safeCurrent,
      done: [...done],
      startedAt,
      routine,
      core: withCore,
      coreReps,
      coreWeights,
      rep,
      skipped: [...skipped],
      rest,
      // Written on every snapshot: `rest` flipping to null is the tick right after
      // a rest was banked, so the two always go to storage together.
      restSec: restAccumSec.current,
      photoGates: [...seenGates],
      fast,
    })
  }, [safeCurrent, done, startedAt, routine, withCore, coreReps, coreWeights, rep, skipped, rest, seenGates, fast])

  // Leave the app — another app, or the screen going dark — and hands-free
  // switches off. Its rests and paced sets run on the wall clock, so they'd
  // otherwise keep rolling the routine forward while it's out of sight.
  useOnHidden(fast, () => setFast(false))

  // Android back (the button or the edge swipe) belongs to the checklist while
  // it is open. Close the sheet and keep the routine underneath active; the
  // session-level guard in App can handle a later press.
  useBackGuard(showList, () => setShowList(false))

  // A static hold has nothing to animate, so it runs on a clock of its own — see
  // HoldTimer. Read here rather than beside the set below, because the wake lock
  // sits above the empty-routine return and needs it.
  const onScreen = steps[safeCurrent]
  const holdSec = onScreen?.kind === 'flex' ? onScreen.holdSec : undefined

  // Nothing between you and the set: no rest, no get-into-position count, no photo
  // screen, no sheet, no pause curtain. The rhythm guide paces only while this
  // holds and a hold's clock starts only then — a set counting down behind a
  // screen you're reading is counting time you weren't in the pose. The workout's
  // timed holds run on the same rule (see ActiveSession's setScreenLive).
  const setLive = rest == null && photos == null && !paused && !showList && !preparing

  // And while it's on, the screen stays lit — a paced routine is one nobody is
  // tapping, and the phone would dim mid-hold. A hold's clock runs unattended
  // whether or not the routine is hands-free, so ninety seconds of calf stretch
  // holds the screen open too. Not under the pause curtain, where there's nothing
  // to watch.
  useWakeLock((fast || (holdSec != null && setLive)) && !paused)

  const completed = useMemo(() => steps.filter((s) => done.has(s.stepKey)).length, [steps, done])

  const timeLeft = useMemo(() => {
    const fallbackItems = steps
      .filter((s) => !done.has(s.stepKey))
      .map((s) => ({
        remainingSets: 1,
        // A ninety-second hold is ninety seconds of work, not eighteen reps of it.
        workSec: s.kind === 'flex' ? stepWorkSec(s) : coreTarget.reps * SEC_PER_REP,
        restSec: s.restSec,
      }))
    return remainingSecs({
      history: durations,
      // Scoped to this routine: head to toe runs about twice the side split, so
      // a median pooled across both would tell you half the truth in either one.
      sel: { kind: 'stretch', routine },
      doneSteps: completed,
      totalSteps: N,
      fallbackItems,
    })
  }, [steps, done, durations, completed, N, coreTarget, routine])

  /**
   * What the session that just happened was projected to cost, split the way the
   * recap reports it.
   *
   * Priced over the steps actually done rather than the whole routine, and read
   * here at the end rather than frozen at the start: a routine finished off the
   * menu at set five was never going to cost what all twenty would, and a recap
   * comparing against that number would read as time saved instead of work
   * dropped. The learned median comes off the same history the time-left readout
   * quotes, scaled the same way, so the recap can't contradict what the screen
   * was promising all the way through.
   */
  const projectedSplit = (doneSet: Set<string>) => {
    const doneSteps = steps.filter((s) => doneSet.has(s.stepKey))
    const learned = medianTotalSec(durations, { kind: 'stretch', routine })
    const share = N > 0 ? doneSteps.length / N : 0
    return stretchSplit(doneSteps, coreRepsFor, learned == null ? null : learned * share)
  }

  // Finish the session: file the length, the completed core sets (as workout rows,
  // weight × reps) and the stretch/flex day, then hand the recap on. `doneSet` is
  // passed explicitly so the set just completed is included without waiting for
  // the state update.
  const finishWith = (doneSet: Set<string>) => {
    // The rest screen carries the finish actions, so bank the rest still on the
    // clock rather than logging it as time stretching.
    bankRest()
    const coreSets = steps
      .filter((s): s is CoreSetStep => s.kind === 'core' && doneSet.has(s.stepKey))
      .map((s) => ({ reps: coreRepsFor(s.round), weightLbs: coreWeightFor(s.round) }))
    void finishStretch({
      routine,
      // The core block may have been offered at session start and then skipped
      // from the checklist; don't describe that session as "stretch + core".
      withCore: withCore && !skipped.has(STRETCH_CORE.key),
      coreSets,
      duration: startedAt
        ? {
            totalSec: (Date.now() - new Date(startedAt).getTime()) / 1000,
            restSec: restAccumSec.current,
            projected: projectedSplit(doneSet),
          }
        : undefined,
    }).then(onFinish)
    onClose()
  }

  if (N === 0) {
    const allSkipped = allSteps.length > 0
    return (
      <div className="flex min-h-full flex-col gap-4 pb-24 pt-16 text-center">
        <p className="text-neutral-500">
          {allSkipped ? 'all exercises skipped.' : 'no stretches in your routine. add some in settings → edit stretch routine.'}
        </p>
        {allSkipped ? (
          <>
            <button onClick={() => setShowList(true)} className="min-h-[44px] rounded-xl bg-surface font-medium">
              routine checklist
            </button>
            <button onClick={() => finishWith(done)} className="min-h-[56px] rounded-2xl bg-accent text-lg font-bold text-black">
              finish &amp; log session
            </button>
          </>
        ) : (
          <button onClick={onClose} className="min-h-[44px] rounded-xl bg-surface font-medium">
            back
          </button>
        )}
        {showList && (
          <RoutineChecklist
            steps={allSteps}
            done={done}
            skipped={skipped}
            onClose={() => setShowList(false)}
            onJump={() => {}}
            onToggleDone={() => {}}
            onToggleSkipped={(key, skip) => {
              setSkipped((current) => {
                const next = new Set(current)
                if (skip) next.add(key)
                else next.delete(key)
                return next
              })
              if (!skip) {
                setCurrent(0)
                setPreparing(!fast)
              }
            }}
          />
        )}
      </div>
    )
  }

  const step = steps[safeCurrent]
  const atLast = safeCurrent >= N - 1
  // The step this one follows. It decides two things: whether the settle-in ahead
  // of this set is a reposition within a stretch already built or the full setup of
  // a new one, and whether a rest led into the set on screen.
  const prevStep = steps[safeCurrent - 1]

  const getReadySec = settleInSec(step, prevStep)

  // Route a captured angle into the right field. The shot fixes cold vs warm;
  // which pose it lands in follows the angles the camera actually returned, so
  // switching pose mid-capture still logs the reading somewhere sensible.
  const logMeasurement = (kind: PhotoKind, result: MeasureResult) => {
    const { cold } = PHOTO_SHOT[kind]
    const m: FlexMeasurement = { note: 'measurement' }
    if (result.splitDeg != null) {
      if (cold) m.coldSplitDeg = result.splitDeg
      else m.warmSplitDeg = result.splitDeg
    }
    if (result.tailorsLeftDeg != null) {
      if (cold) m.tailorsColdLeftDeg = result.tailorsLeftDeg
      else m.tailorsWarmLeftDeg = result.tailorsLeftDeg
    }
    if (result.tailorsRightDeg != null) {
      if (cold) m.tailorsColdRightDeg = result.tailorsRightDeg
      else m.tailorsWarmRightDeg = result.tailorsRightDeg
    }
    if (result.toeTouchDeg != null) {
      if (cold) m.coldToeTouchDeg = result.toeTouchDeg
      else m.warmToeTouchDeg = result.toeTouchDeg
    }
    if (result.legLiftLeftDeg != null) {
      if (cold) m.coldLegLiftLeftDeg = result.legLiftLeftDeg
      else m.warmLegLiftLeftDeg = result.legLiftLeftDeg
    }
    if (result.legLiftRightDeg != null) {
      if (cold) m.coldLegLiftRightDeg = result.legLiftRightDeg
      else m.warmLegLiftRightDeg = result.legLiftRightDeg
    }
    void logFlex(m)
  }

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

  /** Drop every set of an exercise from this run, or put the exercise back. */
  const setExerciseSkipped = (key: string, skip: boolean) => {
    const nextSkipped = new Set(skipped)
    if (skip) nextSkipped.add(key)
    else nextSkipped.delete(key)

    const nextSteps = allSteps.filter((candidate) => !nextSkipped.has(candidate.exKey))
    const leaving = skip && step.exKey === key
    const currentAllIndex = allSteps.findIndex((candidate) => candidate.stepKey === step.stepKey)
    const landing = leaving
      ? (allSteps.slice(currentAllIndex + 1).find((candidate) => !nextSkipped.has(candidate.exKey) && !done.has(candidate.stepKey))
        ?? nextSteps.find((candidate) => !done.has(candidate.stepKey))
        ?? nextSteps[0])
      : nextSteps.find((candidate) => candidate.stepKey === step.stepKey) ?? nextSteps[0]

    setSkipped(nextSkipped)
    setCurrent(landing ? nextSteps.findIndex((candidate) => candidate.stepKey === landing.stepKey) : 0)
    setRep(1)

    if (leaving) {
      // A rest or setup count aimed at the exercise being removed no longer has a
      // destination. Start the replacement exercise with its ordinary setup.
      if (rest) bankRest()
      setRest(null)
      setReadyOverrideSec(null)
      setPreparing(!!landing && !fast && settleInSec(landing) > 0)
    }
  }

  // Bank the rest slice just spent, then hand the screen to the get-ready count.
  //
  // Every rest ends on that count, however it ended: the rest was shortened by it
  // when it opened (see advanceFrom), so a rest run out hands-free and one cut
  // short by a tap both land on the same settle-in. The exception is a set with
  // no settle-in at all — one inside the core block — which goes straight on.
  const closeRest = () => {
    bankRest()
    setRest(null)
    setPreparing(getReadySec > 0)
  }

  /**
   * Hand the screen to a count of `sec` before the coming set, with no rest.
   *
   * Hands-free there is no count, and no override is left behind either — a stale
   * one would still be on the clock when the next rest ended. A count of zero is
   * refused for a harder reason: `preparing` is what stands the rhythm guide and
   * the screen tap down, so a count that renders nothing would leave the routine
   * with no way forward at all.
   */
  const straightToGetReady = (sec: number) => {
    if (fast || sec <= 0) {
      setPreparing(false)
      return
    }
    setReadyOverrideSec(sec)
    setPreparing(true)
  }

  // Start the finished set's rest and move on — or wrap up, on the last step.
  const advanceFrom = (index: number, doneSet: Set<string>) => {
    if (index >= N - 1) {
      finishWith(doneSet)
      return
    }
    const finished = steps[index]
    goToStep(index + 1)

    // Crossing from the mobility routine into the core block skips the rest — the
    // last stretch leaves you rested, so go straight to a get-into-position count
    // (or, running hands-free, straight to the set).
    if (finished.kind === 'flex' && steps[index + 1].kind === 'core') {
      straightToGetReady(CORE_ENTRY_GET_READY_SEC)
      return
    }
    // The other side of the same round: a reposition, not a rest, so it must not
    // be banked into the rest tally — the session's time-left estimate reads that
    // number, and counting every leg swap as rest would drift it badly.
    if (finished.kind === 'flex' && finished.sideSwitchSec) {
      straightToGetReady(finished.sideSwitchSec)
      return
    }
    // The rest ends on the coming set's settle-in, and those seconds come out of
    // the rest rather than being added after it (see lib/rest's restScreenSec):
    // what the stretch prescribes is how long until the next set starts, and a
    // routine of twelve sets would otherwise run minutes long.
    //
    // A stretch that prescribes no rest at all (the feet and calf holds) and one
    // whose whole rest is settle-in both hand straight to the count rather than
    // flashing a rest screen that's already over.
    const ready = settleInSec(steps[index + 1], finished)
    const restSec = restScreenSec(finished.restSec, ready)
    if (restSec <= 0) {
      straightToGetReady(ready)
      return
    }
    restStartRef.current = Date.now()
    setRest({ seconds: restSec, endsAt: Date.now() + restSec * 1000 })
  }

  /**
   * Mark the set on screen done and move on. `auto` means its own clock ended it
   * rather than a tap: on the closing set that stops at the photo screen and the
   * finish button, because a routine shouldn't log itself while you're still in
   * the pose.
   */
  const completeSetAndAdvance = (auto = false) => {
    const nextDone = new Set(done).add(step.stepKey)
    setDone(nextDone)
    // A photo moment holds the flow on its own screen first: the rest clock only
    // starts once you're through with the camera.
    const gate = dueGate(gateAfterStep(steps, safeCurrent, routine), flexEntries, today)
    const closing = auto && atLast
    if (gate && !seenGates.has(gate.id)) {
      setPhotos({ gate, index: safeCurrent, then: closing ? 'stay' : 'advance' })
      return
    }
    if (closing) return
    advanceFrom(safeCurrent, nextDone)
  }

  // Leave a photo screen (shots taken or skipped) and pick the routine back up.
  // The cold screen opens the session, so the routine goes straight into its
  // first stretch from here — and if a shot was taken, the get-into-position
  // count is stretched to cover retrieving the phone.
  const closePhotos = (tookAny: boolean) => {
    if (!photos) return
    setSeenGates((prev) => new Set(prev).add(photos.gate.id))
    const { then, index } = photos
    setPhotos(null)
    if (then === 'advance' && index != null) {
      advanceFrom(index, done)
      return
    }
    if (then === 'start' && tookAny && !fast) straightToGetReady(POST_PHOTO_GET_READY_SEC)
  }

  // Tapping the screen finishes the set — your hands are busy mid-stretch, so
  // the whole page is the target rather than one button. Controls (the kebab, the
  // core block's own fields) keep their own job, an overlay that owns the screen
  // swallows the tap, and the last set still needs its explicit finish button.
  // A timed hold is exempt: it runs on a clock of its own and closes itself, and a
  // stray tap shouldn't cut ninety seconds of it short.
  const onScreenTap = (e: MouseEvent) => {
    if (atLast || !setLive || holdSec) return
    if ((e.target as HTMLElement).closest('button, input, label, a')) return
    completeSetAndAdvance()
  }

  // The set ending itself is worth a buzz: mid-stretch you're rarely looking at
  // the screen, so rest starting would otherwise be silent (the rest timer buzzes
  // when it runs out for the same reason). Not for a hold, which buzzes at its
  // own target already.
  const intoRestOnTarget = () => {
    navigator.vibrate?.(200)
    completeSetAndAdvance(true)
  }

  // The rest that led into the set on screen: the one the step before it
  // prescribed (see advanceFrom). Zero when there wasn't one — the routine's
  // first set, a side switch, a stretch that rests not at all, and the crossing
  // out of the mobility routine into the core block, which hands you to the
  // sit-ups already rested off the last stretch.
  const restBeforeSec =
    !prevStep || (prevStep.kind === 'flex' && step.kind === 'core') ? 0 : prevStep.restSec

  // Rest again before the set on screen — for the rest that was cut short, or the
  // one hands-free rolled straight through. It runs and banks like any other, and
  // the get-into-position count follows it as usual, so you settle back into the
  // pose before the pace picks up again.
  const reopenRest = (sec: number) => {
    // Whatever count is on screen gives way to the rest, and the walk back from
    // the camera is already behind you: what follows this rest is the ordinary
    // settle-in for the coming set.
    setPreparing(false)
    setReadyOverrideSec(null)
    // Shortened by the count it ends on, like any other rest, and all count when
    // there's nothing left over for a rest screen.
    const restSec = restScreenSec(sec, getReadySec)
    if (restSec <= 0) {
      straightToGetReady(getReadySec)
      return
    }
    restStartRef.current = Date.now()
    setRest({ seconds: restSec, endsAt: Date.now() + restSec * 1000 })
  }

  // Shared by the header and the rest screen, so the same actions stay reachable
  // while resting instead of forcing you to end rest to get at them.
  const menuItems: MenuItem[] = [
    // Off the rest screen only — there's nothing to go back to while it's up. A set
    // the routine ran straight into (a side switch, or the feet and calf holds,
    // which prescribe no rest at all) still gets the option, since needing a minute
    // is about the body rather than the plan — it just doesn't call it going back.
    ...(rest == null
      ? [
          restBeforeSec > 0
            ? { label: 'back to rest', onClick: () => reopenRest(restBeforeSec) }
            : { label: 'take a rest', onClick: () => reopenRest(MANUAL_REST_SEC) },
        ]
      : []),
    { label: 'pause routine', onClick: () => setPaused(true) },
    { label: 'routine checklist', onClick: () => setShowList(true) },
    {
      label: 'finish & log session',
      onClick: () => finishWith(done),
    },
    { label: 'exit without logging', danger: true, onClick: onClose },
  ]

  // The top of the screen, built once and rendered on the set screen and on every
  // screen that covers it — the rest timer, the get-into-position count — so
  // nothing above the fold changes as the routine moves between them: the same
  // progress bar, the same stretch named, the same set of it coming, and the same
  // controls — reachable while you sit down or settle in as much as while you're
  // in the pose.
  //
  // Which set it names is right on all three: the flow advances *before* resting
  // (see advanceFrom), so through a rest and the count that follows it `step` is
  // already the set they lead into.
  const topBar = (
    <div className="flex flex-col gap-3">
      {/* How much of the whole routine is still ahead of you. */}
      <SessionProgress
        done={completed}
        total={N}
        unit="sets"
        timeLeftLabel={`${formatDuration(timeLeft)} left`}
      />

      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">{stepTitle(step)}</h2>
          {/* The move the position belongs to, and which set of it — which leg and
              which of the calf stretch's three shapes are up in the title, where
              they can't be missed mid-stretch. */}
          <p className="text-sm text-neutral-500">{stepDetail(step)}</p>
        </div>
        {/* A tap on the rest screen ends rest, so these keep theirs to themselves. */}
        <div className="flex shrink-0 items-start" onClick={(e) => e.stopPropagation()}>
          {/* No turbo here: every stretch set already advances itself, and
              there's no learned per-set timing to run the core block's rep entry
              on. */}
          <FastForwardToggle mode={fast ? 'on' : 'off'} onPress={() => setFast(!fast)} />
          <KebabMenu items={menuItems} />
        </div>
      </header>

      {/* A flex set is paced by the guide and brightens when it's done, so there's
          no count to state; the core block's reps are typed in, and its target
          range does need saying. */}
      {step.kind === 'core' && (
        <p className="px-1 text-xs font-semibold tracking-wider text-neutral-500">
          {repRangeLabel(step)} reps
        </p>
      )}
    </div>
  )

  return (
    <div className="flex min-h-full flex-col gap-3" onClick={onScreenTap}>
      {topBar}

      {step.kind === 'flex' ? (
        holdSec ? (
          <HoldTimer
            key={step.stepKey}
            targetSec={holdSec}
            // The set being on screen is the whole of the start signal, and the
            // count leading in is what covers getting into the pose. Standing the
            // clock down when it isn't (a rest reopened over it, the curtain, the
            // checklist) is the same call the rhythm guide's `running` makes.
            running={setLive}
            // And the clock closes the set, hands-free or not, exactly as the paced
            // sets close themselves on their target rep: ninety seconds is what was
            // prescribed, and waiting on a tap only means holding it longer. On the
            // closing set it stops at the finish button rather than logging the
            // session off a timer.
            onTargetEnd={() => completeSetAndAdvance(true)}
          />
        ) : (
          <RhythmGuide
            key={step.stepKey}
            tempo={step.tempo}
            reps={step.reps}
            variant={rhythmVariantFor(flexRoundKey(step), step.tempo)}
            running={setLive}
            startRep={rep}
            onRep={setRep}
            // A stretch set always ends itself: the target rep rolls it into its
            // rest whether or not the routine is running hands-free. Mid-pose there
            // is nothing to decide — the hold is over when the reps are done, and
            // waiting for a tap only means holding it longer than prescribed. On
            // the closing set (core skipped, so a stretch closes the routine) it
            // still ends itself, and then waits on the finish button rather than
            // logging the session on a timer.
            onTargetHit={intoRestOnTarget}
            // Same either way: with no tap coming, the guide brightens a step on
            // the rep that's about to end the set — and keeps its rep count off
            // the screen, since there's nothing left to time by it.
            endsOnTarget
          />
        )
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          <p className="flex items-center justify-center gap-1 text-sm font-medium text-accent">
            <MdTrackChanges aria-hidden />
            {targetLabel(coreTarget)}
          </p>
          {/* The same weight-and-reps pair the guided workout logs a set with — the
              plate is part of what was done, and prescribing the next set needs it. */}
          <div className="flex items-end justify-center gap-3">
            <label className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs tracking-wide text-neutral-500">weight</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="lbs"
                value={coreWeightFor(step.round) ?? ''}
                onChange={(e) =>
                  setCoreWeights((prev) => ({ ...prev, [step.round]: toWeight(e.target.value) }))
                }
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
                value={coreRepsFor(step.round) || ''}
                onChange={(e) =>
                  setCoreReps((prev) => ({ ...prev, [step.round]: Number(e.target.value) || 0 }))
                }
                className="min-h-[64px] w-full rounded-xl bg-surface-2 px-2 text-center text-3xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>
        </div>
      )}

      {/* Every other set advances on a tap anywhere; ending the whole routine is
          worth an explicit button, pinned where a thumb can reach it. With the
          core block skipped it sits under the closing stretch's guide or hold
          clock rather than under the core fields. */}
      {atLast && (
        <div
          className="sticky bottom-0 -mx-4 -mb-4 mt-auto flex flex-col gap-2 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => completeSetAndAdvance()}
            className="flex min-h-[56px] items-center justify-center gap-1 rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
          >
            finish &amp; log session
          </button>
        </div>
      )}

      {rest != null && (
        <RestTimer
          seconds={rest.seconds}
          endsAt={rest.endsAt}
          // The same top of the screen the set behind it has — the bar, the stretch,
          // the set coming and this session's own controls all included, so nothing
          // up there moves when rest opens.
          header={topBar}
          fastMode={fast ? 'on' : 'off'}
          onClose={closeRest}
        />
      )}
      {/* The get-into-position count waits its turn behind a photo screen, and
          only shows for a set that has one — mobility sets, a side switch, and the
          first core set; skipped inside the core block, which rests instead. */}
      {preparing && photos == null && (readyOverrideSec ?? getReadySec) > 0 && (
        <GetReady
          seconds={readyOverrideSec ?? getReadySec}
          // The same top of the screen the set behind it has, exactly as rest
          // does — the bar, the stretch coming and the session's controls all
          // stay put and stay tappable while you settle into position.
          header={topBar}
          onDone={() => {
            setPreparing(false)
            setReadyOverrideSec(null)
          }}
        />
      )}
      {paused && <PauseOverlay label="routine paused" onResume={() => setPaused(false)} />}
      {photos && <PhotoStep gate={photos.gate} onCapture={logMeasurement} onDone={closePhotos} />}

      {showList && (
        // Above the rest overlay (z-50) — reachable from the rest screen's menu.
        <RoutineChecklist
          steps={allSteps}
          currentKey={step.stepKey}
          done={done}
          skipped={skipped}
          onClose={() => setShowList(false)}
          onToggleDone={toggleDone}
          onToggleSkipped={setExerciseSkipped}
          onJump={(stepKey) => {
            const i = steps.findIndex((candidate) => candidate.stepKey === stepKey)
            if (i < 0) return
            const destination = steps[i]
            // A checklist jump changes the physical position without following
            // the routine's normal rest transition, so put its setup in between.
            const ready = settleInSec(destination, step)
            goToStep(i)
            if (rest) {
              bankRest()
              setRest(null)
            }
            setReadyOverrideSec(ready > 0 ? ready : null)
            setPreparing(ready > 0)
            setShowList(false)
          }}
        />
      )}
    </div>
  )
}
