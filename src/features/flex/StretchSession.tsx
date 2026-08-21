import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { MdCheckCircle, MdRadioButtonUnchecked, MdTrackChanges } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { RestTimer } from '../../components/RestTimer'
import { SessionProgress } from '../../components/SessionProgress'
import { GetReady } from '../../components/GetReady'
import { FastForwardToggle } from '../../components/FastForwardToggle'
import { PauseOverlay } from '../../components/PauseOverlay'
import { RhythmGuide } from '../../components/RhythmGuide'
import { KebabMenu, type MenuItem } from '../../components/KebabMenu'
import { PhotoStep } from './PhotoStep'
import { formatDuration, remainingSecs } from '../../lib/estimate'
import { buildSessionSteps, type CoreSetStep } from '../../lib/flexSteps'
import { COLD_GATE, PHOTO_SHOT, gateAfterStep, type PhotoGate, type PhotoKind } from '../../lib/photoSteps'
import { dueGate } from '../../lib/photoCadence'
import { type MeasureResult } from '../../lib/measure'
import { type FlexMeasurement } from '../../store/DataContext'
import { canResumeRest, staleRestSec } from '../../lib/rest'
import { useOnHidden } from '../../lib/useOnHidden'
import { useWakeLock } from '../../lib/useWakeLock'
import { storage, type RestState } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { STRETCH_CORE, repRangeLabel } from '../../config/plan'
import { nextTarget, targetLabel } from '../../lib/progression'
import { toWeight } from '../../lib/weightField'

const SEC_PER_REP = 5

/** Seconds to get into position at the start and after each rest, before the pace starts. */
const GET_READY_SEC = 5

/** Stretches that take longer than the default to settle into, by exercise key. */
const GET_READY_SEC_BY_EX: Record<string, number> = { tailors_pose: 10 }

/**
 * Seconds to get into position when crossing from the mobility routine into the
 * core block. The pancake hang leaves you rested enough — no recovery rest, just
 * time to fetch a plate and set up the first sit-up.
 */
const CORE_ENTRY_GET_READY_SEC = 10

/**
 * A photo screen waiting to be shown, plus the set it interrupts. `resumeIndex`
 * is the step whose rest starts once the screen is dismissed, or null for the
 * cold screen, which runs before the routine has started.
 */
type PendingPhotos = { gate: PhotoGate; resumeIndex: number | null }

/**
 * Guided, one-set-at-a-time Stretch + Core flow: the mobility routine (with a
 * tempo rhythm animation) followed by a core block whose sets are logged as
 * workout rows. Finishing counts as a stretch/flex day.
 */
export function StretchSession({ onClose }: { onClose: () => void }) {
  const {
    flexPlan,
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
  // Hands-free: every rest rolls into the next set on its own, a paced set rolls
  // into its rest on its last rep, and the get-into-position counts are skipped —
  // until the fast-forward toggle is switched back off. Kept in the session's
  // snapshot so a reload mid-routine doesn't quietly start waiting for taps again.
  const [fast, setFast] = useState(!!saved?.fast)
  // True so the routine opens with the same "get into position" countdown that
  // follows each rest — but not over a resumed rest, which owns the screen first,
  // and not when the session is already running itself forward.
  const [preparing, setPreparing] = useState(rest == null && !fast)
  const [showList, setShowList] = useState(false)
  const [paused, setPaused] = useState(false)
  // Photo screens already offered this session, so resuming doesn't re-ask.
  const [seenGates, setSeenGates] = useState<Set<string>>(() => new Set(saved?.photoGates ?? []))
  // The cold shots open the session, before anything has warmed up. A resume
  // that's already past the first set is past that moment, so it doesn't re-ask,
  // and neither does a week that already has the readings.
  const [photos, setPhotos] = useState<PendingPhotos | null>(() => {
    if (seenGates.has(COLD_GATE.id) || (saved?.step ?? 0) > 0 || (saved?.done?.length ?? 0) > 0) {
      return null
    }
    const gate = dueGate(COLD_GATE, flexEntries, today)
    return gate ? { gate, resumeIndex: null } : null
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

  const steps = useMemo(() => buildSessionSteps(flexPlan), [flexPlan])
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
  }, [safeCurrent, done, startedAt, coreReps, coreWeights, rep, rest, seenGates, fast])

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
        workSec: (s.kind === 'flex' ? s.reps : coreTarget.reps) * SEC_PER_REP,
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
    // The rest screen carries the finish actions, so bank the rest still on the
    // clock rather than logging it as time stretching.
    bankRest()
    void logSessionDuration({
      date: toISODate(new Date()),
      kind: 'stretch',
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
    void logFlex({ note: 'stretch + core' })
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

  // Seconds to settle into the current set before its work begins: the
  // per-stretch value for a mobility set, a brief reposition when first entering
  // the core block (round 0, reached from the pancake), and none between the core
  // sets — those get a real rest instead.
  const getReadySec =
    step.kind === 'flex'
      ? GET_READY_SEC_BY_EX[step.exKey] ?? GET_READY_SEC
      : step.round === 0
        ? CORE_ENTRY_GET_READY_SEC
        : 0

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

  // Start the finished set's rest and move on — or wrap up, on the last step.
  const advanceFrom = (index: number, doneSet: Set<string>) => {
    if (index >= N - 1) {
      finishWith(doneSet)
      return
    }
    // Crossing from the mobility routine into the core block skips the rest — the
    // pancake hang leaves you rested, so go straight to a get-into-position count
    // (or, running hands-free, straight to the set).
    if (steps[index].kind === 'flex' && steps[index + 1].kind === 'core') {
      goToStep(index + 1)
      setPreparing(!fast)
      return
    }
    restStartRef.current = Date.now()
    setRest({ seconds: steps[index].restSec, endsAt: Date.now() + steps[index].restSec * 1000 })
    goToStep(index + 1)
  }

  const completeSetAndAdvance = () => {
    const nextDone = new Set(done).add(step.stepKey)
    setDone(nextDone)
    // A photo moment holds the flow on its own screen first: the rest clock only
    // starts once you're through with the camera.
    const gate = dueGate(gateAfterStep(steps, safeCurrent), flexEntries, today)
    if (gate && !seenGates.has(gate.id)) {
      setPhotos({ gate, resumeIndex: safeCurrent })
      return
    }
    advanceFrom(safeCurrent, nextDone)
  }

  // Leave a photo screen (shots taken or skipped) and pick the routine back up.
  const closePhotos = () => {
    if (!photos) return
    setSeenGates((prev) => new Set(prev).add(photos.gate.id))
    setPhotos(null)
    if (photos.resumeIndex != null) advanceFrom(photos.resumeIndex, done)
  }

  // Tapping the screen finishes the set — your hands are busy mid-stretch, so
  // the whole page is the target rather than one button. Controls (the kebab, the
  // core block's own fields) keep their own job, an overlay that owns the screen
  // swallows the tap, and the last set still needs its explicit finish button.
  const overlayUp = rest != null || photos != null || paused || showList || preparing
  const onScreenTap = (e: MouseEvent) => {
    if (atLast || overlayUp) return
    if ((e.target as HTMLElement).closest('button, input, label, a')) return
    completeSetAndAdvance()
  }

  // The set ending itself is worth a buzz: mid-stretch you're rarely looking at
  // the screen, so rest starting would otherwise be silent (the rest timer buzzes
  // when it runs out for the same reason).
  const intoRestOnTarget = () => {
    navigator.vibrate?.(200)
    completeSetAndAdvance()
  }

  // Shared by the header and the rest screen, so the same actions stay reachable
  // while resting instead of forcing you to end rest to get at them.
  const menuItems: MenuItem[] = [
    { label: 'pause routine', onClick: () => setPaused(true) },
    { label: 'routine checklist', onClick: () => setShowList(true) },
    {
      label: 'finish & log session',
      onClick: () => finishWith(done),
    },
    { label: 'exit without logging', danger: true, onClick: onClose },
  ]

  return (
    <div className="flex min-h-full flex-col gap-3" onClick={onScreenTap}>
      {/* Same bar, same place, as the rest screen's: how much of the whole
          routine is still ahead of you, at the top of the screen either way. */}
      <SessionProgress
        done={completed}
        total={N}
        unit="sets"
        timeLeftLabel={`${formatDuration(timeLeft)} left`}
      />

      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{step.exName}</h2>
          <p className="text-sm text-neutral-500">
            set {step.round + 1} of {step.maxSets}
          </p>
        </div>
        <div className="flex shrink-0 items-start">
          {/* No turbo here: under hands-free every set that can advance itself
              already does, and there's no learned per-set timing to run the core
              block's rep entry on. */}
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

      {step.kind === 'flex' ? (
        <RhythmGuide
          key={step.stepKey}
          tempo={step.tempo}
          reps={step.reps}
          running={rest == null && !preparing && !paused && photos == null}
          startRep={rep}
          onRep={setRep}
          // Under fast-forward the last rep is the tap. Not on the closing step —
          // the core block ends the session, so nothing here logs one on a timer.
          onTargetHit={fast && !atLast ? intoRestOnTarget : undefined}
          // Same condition: with no tap coming, the guide brightens a step on the
          // rep that's about to roll the set into its rest.
          endsOnTarget={fast && !atLast}
        />
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
          worth an explicit button, pinned where a thumb can reach it. */}
      {atLast && (
        <div
          className="sticky bottom-0 -mx-4 -mb-4 mt-auto flex flex-col gap-2 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={completeSetAndAdvance}
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
          fastMode={fast ? 'on' : 'off'}
          onPressFastForward={() => setFast(!fast)}
          menu={menuItems}
          progress={{ done: completed, total: N, unit: 'sets' }}
          timeLeftLabel={`${formatDuration(timeLeft)} left`}
          onClose={closeRest}
        />
      )}
      {/* The get-into-position count waits its turn behind a photo screen, and
          only shows for a set that has one — mobility sets and the first core
          set; skipped inside the core block, which rests instead. */}
      {preparing && photos == null && getReadySec > 0 && (
        <GetReady seconds={getReadySec} label={step.exName} onDone={() => setPreparing(false)} />
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
