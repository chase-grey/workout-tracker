import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { MdCheckCircle, MdRadioButtonUnchecked, MdTrackChanges } from 'react-icons/md'
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
import { formatDuration, remainingSecs } from '../../lib/estimate'
import {
  buildSessionSteps,
  stepWorkSec,
  SEC_PER_REP,
  type CoreSetStep,
  type SessionStep,
} from '../../lib/flexSteps'
import { coldGate, PHOTO_SHOT, gateAfterStep, type PhotoGate, type PhotoKind } from '../../lib/photoSteps'
import { dueGate } from '../../lib/photoCadence'
import { type MeasureResult } from '../../lib/measure'
import { type FlexMeasurement } from '../../store/DataContext'
import { FLEX_ROUTINES, type FlexRoutineKey } from '../../config/flexRoutines'
import { canResumeRest, staleRestSec } from '../../lib/rest'
import { useOnHidden } from '../../lib/useOnHidden'
import { useWakeLock } from '../../lib/useWakeLock'
import { storage, type RestState } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { STRETCH_CORE, repRangeLabel } from '../../config/plan'
import { nextTarget, targetLabel } from '../../lib/progression'
import { toWeight } from '../../lib/weightField'

/** Seconds to get into position at the start and after each rest, before the pace starts. */
const GET_READY_SEC = 5

/**
 * Stretches that take longer than the default to settle into, by exercise key.
 * The pike positions take real setting up — a block under the leg, a strap, the
 * whole shape squared away before anything is worth timing.
 */
const GET_READY_SEC_BY_EX: Record<string, number> = {
  tailors_pose: 15,
  pike_block_crush: 15,
  pike_lift: 15,
  rolling_feet: 10,
}

/**
 * Seconds to get into position when crossing from the mobility routine into the
 * core block. The pancake hang leaves you rested enough — no recovery rest, just
 * time to fetch a plate and set up the first sit-up.
 */
const CORE_ENTRY_GET_READY_SEC = 10

/**
 * Seconds to get into position after taking a photo on the way into the first
 * stretch. A shot means the phone was propped up somewhere across the room, so
 * this is the walk back and the settle in, not just the settle in.
 */
const POST_PHOTO_GET_READY_SEC = 15

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
 * The settle-in a step gets before its work begins: the per-stretch value for a
 * mobility set, a brief reposition on the way into the core block, and none
 * between the core sets — those get a real rest instead.
 */
function getReadySecFor(s: SessionStep): number {
  if (s.kind !== 'flex') return s.round === 0 ? CORE_ENTRY_GET_READY_SEC : 0
  return GET_READY_SEC_BY_EX[s.exKey] ?? GET_READY_SEC
}

/** The side and the variation, as the header and the checklist name them. */
function stepDetail(s: SessionStep): string {
  const parts = [`set ${s.round + 1} of ${s.maxSets}`]
  if (s.kind === 'flex') {
    if (s.setLabel) parts.push(s.setLabel)
    if (s.side) parts.push(s.side)
  }
  return parts.join(' · ')
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
}: {
  routine: FlexRoutineKey
  onClose: () => void
}) {
  const {
    flexPlans,
    workouts,
    flexEntries,
    logFlex,
    logCore,
    durations,
    logSessionDuration,
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
  // get-into-position counts are skipped — until the fast-forward toggle is
  // switched back off. Stretch sets roll into their rest either way. Kept in the
  // session's snapshot so a reload mid-routine doesn't quietly start waiting for
  // taps again.
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
  const steps = useMemo(() => buildSessionSteps(plan, { core: withCore }), [plan, withCore])
  const N = steps.length
  const safeCurrent = N ? Math.min(Math.max(0, current), N - 1) : 0

  // Progression target for the core sets — weight and reps both prefilled and both
  // editable. Read from the movement's whole history, which includes the sets the
  // push and pull days train it with: it's one lift, wherever it was done.
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
      rest,
      // Written on every snapshot: `rest` flipping to null is the tick right after
      // a rest was banked, so the two always go to storage together.
      restSec: restAccumSec.current,
      photoGates: [...seenGates],
      fast,
    })
  }, [safeCurrent, done, startedAt, routine, withCore, coreReps, coreWeights, rep, rest, seenGates, fast])

  // Leave the app — another app, or the screen going dark — and hands-free
  // switches off. Its rests and paced sets run on the wall clock, so they'd
  // otherwise keep rolling the routine forward while it's out of sight.
  useOnHidden(fast, () => setFast(false))

  // And while it's on, the screen stays lit — a paced routine is one nobody is
  // tapping, and the phone would dim mid-hold. Not under the pause curtain,
  // where there's nothing to watch.
  useWakeLock(fast && !paused)

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
  }, [steps, done, durations, completed, N, coreTarget])

  // Record the finished routine's length once, for time-left learning + reporting.
  const recordDuration = () => {
    if (!startedAt) return
    // The rest screen carries the finish actions, so bank the rest still on the
    // clock rather than logging it as time stretching.
    bankRest()
    void logSessionDuration({
      date: toISODate(new Date()),
      kind: 'stretch',
      routine,
      totalSec: (Date.now() - new Date(startedAt).getTime()) / 1000,
      restSec: restAccumSec.current,
    })
  }

  // Finish the session: log the completed core sets as workout rows (weight ×
  // reps) and record the stretch/flex day. `doneSet` is passed explicitly so the
  // set just completed is included without waiting for the state update.
  const finishWith = (doneSet: Set<string>) => {
    recordDuration()
    const coreSets = steps
      .filter((s): s is CoreSetStep => s.kind === 'core' && doneSet.has(s.stepKey))
      .map((s) => ({ reps: coreRepsFor(s.round), weightLbs: coreWeightFor(s.round) }))
    void logCore(coreSets)
    // Which routine was done is what the alternation reads off the log. The note
    // says whether the core block was part of it, since with it skipped "stretch
    // + core" would be a plain misstatement of what happened.
    void logFlex({ note: withCore ? 'stretch + core' : 'stretch', routines: [routine] })
    onClose()
  }

  if (N === 0) {
    return (
      <div className="flex flex-col gap-4 pb-24 pt-16 text-center">
        <p className="text-neutral-500">no stretches in your routine. add some in settings → edit stretch routine.</p>
        <button onClick={onClose} className="min-h-[44px] rounded-xl bg-surface font-medium">
          back
        </button>
      </div>
    )
  }

  const step = steps[safeCurrent]
  const atLast = safeCurrent >= N - 1
  // A static hold has nothing to animate, so it runs on a clock of its own with
  // its own start and done — see HoldTimer.
  const holdSec = step.kind === 'flex' ? step.holdSec : undefined

  const getReadySec = getReadySecFor(step)

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

  // Bank the rest slice just spent, then hand the screen to the get-ready count.
  // `expired` is a rest that ran itself out under fast-forward: you've had the
  // whole rest, so the routine goes straight on to the set. Cutting a rest short
  // with a tap still gets the count — you asked to move on early, not to be
  // already in position.
  const closeRest = (expired?: boolean) => {
    bankRest()
    setRest(null)
    // Hand off to the get-into-position count only when the upcoming set has one;
    // otherwise (a set inside the core block) go straight to the set.
    setPreparing(getReadySec > 0 && !(fast && expired))
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
    // A stretch that prescribes no rest at all (the feet and calf holds) hands
    // straight to the next set's own settle-in rather than flashing a rest screen
    // that's already over.
    if (finished.restSec <= 0) {
      straightToGetReady(getReadySecFor(steps[index + 1]))
      return
    }
    restStartRef.current = Date.now()
    setRest({ seconds: finished.restSec, endsAt: Date.now() + finished.restSec * 1000 })
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
  // A timed hold is exempt: it has a start and a done of its own, and a stray tap
  // shouldn't cut ninety seconds of it short.
  const overlayUp = rest != null || photos != null || paused || showList || preparing
  const onScreenTap = (e: MouseEvent) => {
    if (atLast || overlayUp || holdSec) return
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
  const prevStep = steps[safeCurrent - 1]
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
    restStartRef.current = Date.now()
    setRest({ seconds: sec, endsAt: Date.now() + sec * 1000 })
  }

  // Shared by the header and the rest screen, so the same actions stay reachable
  // while resting instead of forcing you to end rest to get at them.
  const menuItems: MenuItem[] = [
    // Off the rest screen only — there's nothing to go back to while it's up, and
    // nothing to go back to before a set that never had a rest ahead of it.
    ...(rest == null && restBeforeSec > 0
      ? [{ label: 'back to rest', onClick: () => reopenRest(restBeforeSec) }]
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
          <h2 className="text-xl font-bold">{step.exName}</h2>
          {/* The variation and the side, when the stretch has them: which of the
              calf stretch's three shapes this is, and which leg it's on. */}
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
            // A hold you kept going on is worth keeping, so stopping it by hand
            // is what ends the set — and hands-free the clock closes it instead.
            onStop={() => completeSetAndAdvance(true)}
            onTargetEnd={fast ? () => completeSetAndAdvance(true) : undefined}
          />
        ) : (
          <RhythmGuide
            key={step.stepKey}
            tempo={step.tempo}
            reps={step.reps}
            running={rest == null && !preparing && !paused && photos == null}
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
        <div className="fixed inset-0 z-60 flex items-end bg-black/60" onClick={() => setShowList(false)}>
          <div
            className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <h3 className="mb-1 text-lg font-bold">routine checklist</h3>
            <p className="mb-3 text-xs text-neutral-500">tap a set to jump; tap the circle to mark it done.</p>
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
                        // Jumping is a decision to start that set now, so an
                        // in-flight rest ends rather than covering it back up.
                        if (rest) closeRest()
                        setShowList(false)
                      }}
                      className="flex-1 py-3 text-left active:opacity-70"
                    >
                      <span className="text-[10px] tracking-wide text-neutral-500">{s.blockLabel}</span>
                      <span className="block font-medium">
                        {s.exName} · {stepDetail(s)}
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
