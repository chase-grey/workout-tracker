import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { MdCheckCircle, MdRadioButtonUnchecked, MdTrackChanges } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { RestTimer } from '../../components/RestTimer'
import { SessionProgress } from '../../components/SessionProgress'
import { GetReady } from '../../components/GetReady'
import { PauseOverlay } from '../../components/PauseOverlay'
import { RhythmGuide } from '../../components/RhythmGuide'
import { KebabMenu, type MenuItem } from '../../components/KebabMenu'
import { MeasureSheet } from './MeasureSheet'
import { PhotoStep } from './PhotoStep'
import { formatDuration, remainingSecs } from '../../lib/estimate'
import { buildSessionSteps, type CoreSetStep } from '../../lib/flexSteps'
import { COLD_GATE, PHOTO_SHOT, gateAfterStep, type PhotoGate, type PhotoKind } from '../../lib/photoSteps'
import { dueGate } from '../../lib/photoCadence'
import { type MeasureResult } from '../../lib/measure'
import { type FlexMeasurement } from '../../store/DataContext'
import { canResumeRest } from '../../lib/rest'
import { storage, type RestState } from '../../services/storage'
import { toISODate } from '../../lib/dates'
import { DEAD_BUG, repRangeLabel } from '../../config/plan'
import { nextTarget } from '../../lib/progression'

const SEC_PER_REP = 5

/** Seconds to get into position at the start and after each rest, before the pace starts. */
const GET_READY_SEC = 5

/** Stretches that take longer than the default to settle into, by exercise key. */
const GET_READY_SEC_BY_EX: Record<string, number> = { tailors_pose: 10 }

/**
 * Seconds to get into position when crossing from the mobility routine into the
 * core block. The pancake hang leaves you rested enough — no recovery rest, just
 * time to set up the first dead bug.
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
 * tempo rhythm animation) followed by a dead-bug core block whose reps are
 * logged as workout rows. Finishing counts as a stretch/flex day.
 */
export function StretchSession({ onClose, onMinimize }: { onClose: () => void; onMinimize: () => void }) {
  const {
    flexPlan,
    updateFlexPlan,
    settings,
    updateSettings,
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
  const [paused, setPaused] = useState(false)
  // Per-exercise auto-advance for this session only, keyed by exercise. An entry
  // overrides the saved `autoAdvance` default either way, so "auto just for now"
  // and "not this time" are both possible without editing the routine. One map per
  // direction: rolling out of rest into the next set, and rolling out of a set
  // into its rest.
  const [autoOverride, setAutoOverride] = useState<Map<string, boolean>>(new Map())
  const [intoOverride, setIntoOverride] = useState<Map<string, boolean>>(new Map())
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
  const restAccumSec = useRef(Math.max(0, saved?.restSec ?? 0))
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
    storage.saveStretch({
      step: safeCurrent,
      done: [...done],
      startedAt,
      coreReps,
      rep,
      rest,
      // Written on every snapshot: `rest` flipping to null is the tick right after
      // a rest was banked, so the two always go to storage together.
      restSec: restAccumSec.current,
      photoGates: [...seenGates],
    })
  }, [safeCurrent, done, startedAt, coreReps, rep, rest, seenGates])

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

  // Finish the session: log the completed dead-bug sets as workout rows (reps)
  // and record the stretch/flex day. `doneSet` is passed explicitly so the set
  // just completed is included without waiting for the state update.
  const finishWith = (doneSet: Set<string>) => {
    recordDuration()
    const reps = steps
      .filter((s): s is CoreSetStep => s.kind === 'core' && doneSet.has(s.stepKey))
      .map((s) => coreRepsFor(s.round))
    void logCore(reps)
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
  // the core block (round 0, reached from the pancake), and none between the
  // dead-bug sets — those get a real rest instead.
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
  const closeRest = () => {
    bankRest()
    setRest(null)
    // Hand off to the get-into-position count only when the upcoming set has one;
    // otherwise (a between-dead-bugs set) go straight to the set.
    setPreparing(getReadySec > 0)
  }

  // Start the finished set's rest and move on — or wrap up, on the last step.
  const advanceFrom = (index: number, doneSet: Set<string>) => {
    if (index >= N - 1) {
      finishWith(doneSet)
      return
    }
    // Crossing from the mobility routine into the core block skips the rest — the
    // pancake hang leaves you rested, so go straight to a get-into-position count.
    if (steps[index].kind === 'flex' && steps[index + 1].kind === 'core') {
      goToStep(index + 1)
      setPreparing(true)
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
  // the whole page is the target rather than one button. Controls (the kebab,
  // the core rep box) keep their own job, an overlay that owns the screen
  // swallows the tap, and the last set still needs its explicit finish button.
  const overlayUp = rest != null || photos != null || paused || showMeasure || showList || preparing
  const onScreenTap = (e: MouseEvent) => {
    if (atLast || overlayUp) return
    if ((e.target as HTMLElement).closest('button, input, label, a')) return
    completeSetAndAdvance()
  }

  // Whether rest rolls straight into this set. During rest `step` is already the
  // set the rest is leading into, so this reads the same from the set screen and
  // from the rest screen before it.
  const savedAuto = step.kind === 'flex' ? !!step.autoAdvance : !!settings.coreAutoAdvance
  const autoNow = autoOverride.get(step.exKey) ?? savedAuto
  const setAutoNow = (on: boolean) =>
    setAutoOverride((prev) => new Map(prev).set(step.exKey, on))

  // And the other direction: whether finishing the set's target reps starts its
  // rest on its own. Only the paced mobility sets can offer it — the rhythm guide
  // is what knows when the set is over. A dead-bug set is a number you type, so
  // it has no end the app can see and keeps waiting for a tap.
  const paced = step.kind === 'flex'
  const savedInto = step.kind === 'flex' && !!step.autoIntoRest
  const intoNow = intoOverride.get(step.exKey) ?? savedInto
  const setIntoNow = (on: boolean) =>
    setIntoOverride((prev) => new Map(prev).set(step.exKey, on))

  /** Write one auto-advance default onto every copy of this stretch in the routine. */
  const saveFlexDefault = (fields: Partial<{ autoAdvance: boolean; autoIntoRest: boolean }>) =>
    updateFlexPlan(
      flexPlan.map((block) => ({
        ...block,
        exercises: block.exercises.map((e) => (e.key === step.exKey ? { ...e, ...fields } : e)),
      })),
    )

  // Saving the default takes effect for the rest of this session too. A stretch
  // carries the flag on its routine entry; the dead-bug block has no routine
  // entry to carry it, so it saves to settings (see Settings.coreAutoAdvance).
  const setAutoDefault = (on: boolean) => {
    if (step.kind === 'flex') saveFlexDefault({ autoAdvance: on })
    else updateSettings({ ...settings, coreAutoAdvance: on })
    setAutoNow(on)
  }

  // Only ever called from a mobility set, so this one has a routine entry to
  // write to and needs no settings fallback.
  const setIntoDefault = (on: boolean) => {
    saveFlexDefault({ autoIntoRest: on })
    setIntoNow(on)
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
    // Both directions read the same way: the session-only toggles first, then the
    // saved per-stretch defaults. The into-rest pair only shows on a paced set.
    ...(paced
      ? [
          {
            label: intoNow ? 'wait for my tap after the set' : 'auto-advance into rest',
            onClick: () => setIntoNow(!intoNow),
          },
        ]
      : []),
    {
      label: autoNow ? 'wait for my tap after rest' : 'auto-advance out of rest',
      onClick: () => setAutoNow(!autoNow),
    },
    ...(paced
      ? [
          {
            label: savedInto
              ? `stop auto-advancing ${step.exName} into rest`
              : `always auto-advance ${step.exName} into rest`,
            onClick: () => setIntoDefault(!savedInto),
          },
        ]
      : []),
    {
      label: savedAuto
        ? `stop auto-advancing ${step.exName} out of rest`
        : `always auto-advance ${step.exName} out of rest`,
      onClick: () => setAutoDefault(!savedAuto),
    },
    { label: 'back to app (keep going)', onClick: onMinimize },
    { label: 'pause routine', onClick: () => setPaused(true) },
    { label: 'log measurement', onClick: () => setShowMeasure(true) },
    { label: 'routine checklist', onClick: () => setShowList(true) },
    {
      label: 'skip logging details (mark done)',
      onClick: () => {
        recordDuration()
        void logFlex({ note: 'stretch + core' })
        onClose()
      },
    },
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
        <KebabMenu items={menuItems} />
      </header>

      {/* Flex sets show their rep count live in the rhythm guide, so only the
          core block's target range needs stating up here. */}
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
          // On auto, the last rep is the tap. Not on the closing step — the core
          // block ends the session, so nothing here logs a session on a timer.
          onTargetHit={intoNow && !atLast ? intoRestOnTarget : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          <p className="flex items-center justify-center gap-1 text-sm font-medium text-accent">
            <MdTrackChanges aria-hidden />
            target {coreTarget} reps
          </p>
          <label className="mx-auto flex flex-col items-center gap-1">
            <span className="text-xs tracking-wide text-neutral-500">reps</span>
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
          autoAdvance={autoNow}
          menu={menuItems}
          progress={{ done: completed, total: N, unit: 'sets' }}
          timeLeftLabel={`${formatDuration(timeLeft)} left`}
          onClose={closeRest}
        />
      )}
      {/* The get-into-position count waits its turn behind a photo screen, and
          only shows for a set that has one — mobility sets and the first core
          set; skipped between dead-bug sets, which rest instead. */}
      {preparing && photos == null && getReadySec > 0 && (
        <GetReady seconds={getReadySec} label={step.exName} onDone={() => setPreparing(false)} />
      )}
      {paused && <PauseOverlay label="routine paused" onResume={() => setPaused(false)} />}
      {showMeasure && <MeasureSheet onClose={() => setShowMeasure(false)} />}
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
