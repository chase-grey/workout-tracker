import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { BodyWeightEntry, StreakState, WorkoutRow, WorkoutSession } from '../types'
import { storage, type QueuedWrite, type Settings } from '../services/storage'
import { dequeued, enqueued, newWrite, type WritePayload } from '../lib/outbox'
import { mergeSettings, sameSyncedSettings, syncablePart } from '../lib/settingsSync'
import { api } from '../services/api'
import { sessionToRows, trainingDates } from '../lib/session'
import { DAY_TYPES, DEAD_BUG } from '../config/plan'
import { maxAttemptRow } from '../lib/maxAttempt'
import { toISODate, weekStartISO } from '../lib/dates'
import { withPlanDefaults, withRemovedFrom, type Plan } from '../config/plan'
import type { FlexBlock } from '../config/flexPlan'
import { dedupeFlexByDate, type FlexEntry } from '../lib/flex'
import {
  calorieHitDates,
  CALORIE_GOAL,
  mergeCaloriesByDate,
  setDayTotal,
  totalForDate,
  type CalorieEntry,
} from '../lib/calories'
import { dedupeMeasurementsByDate, type MeasurementEntry } from '../lib/bodyComp'
import {
  applySessionSamples,
  isSaneDuration,
  mergeDurations,
  mergeExerciseAverages,
  normalizeExerciseAverages,
  type ExerciseAverages,
  type SessionDuration,
  type SessionTimeSamples,
} from '../lib/estimate'
import { sessionChallenges, metBaselines, type ChallengeOpts } from '../lib/challenge'
import { MEASUREMENT_HISTORY } from '../config/body'
import {
  weeklyStreakHistory,
  DEFAULT_WEEKLY_GOALS,
  type WeeklyGoalConfig,
  type WeekResult,
} from '../lib/weeklyStreak'
import { useCelebrate } from './CelebrationContext'
import {
  achievementCelebration,
  calorieGoalCelebration,
  composeCelebration,
  currentWeekCounts,
  detectPRs,
  newlyEarned,
  stretchDoneCelebration,
  type Celebration,
  type PR,
  type WeekCounts,
} from '../lib/celebration'
import { flexAngleCelebrations } from '../lib/flexCelebration'
import { newRecords, type RecordSnapshot } from '../lib/records'
import { goalPaceNotes, type GoalPaceNote } from '../lib/goalPace'
import { graduationNote } from '../lib/graduation'
import { applyNotesEdit, parseDiscomfort, type NotesEdit } from '../lib/discomfort'

export type WeekProgress = { workouts: number; flex: number; calDays: number }

/** Wall-clock split of a finished workout, measured by the guided flow. */
export type SessionDurationInput = { totalSec: number; restSec: number }

/**
 * Everything the full-screen workout-finish recap needs: PRs and new baselines
 * hit this session (the headline), the time split, and the "ambient" weekly-goal
 * / all-time-record celebration to play once the recap is dismissed.
 */
export type WorkoutFinishSummary = {
  prs: PR[]
  baselines: string[]
  totalSec: number
  activeSec: number
  restSec: number
  ambient: Celebration | null
  /**
   * How this session moved the locked goals it touched — whether it gained or
   * lost ground against the projection each goal committed to.
   */
  goalPace: GoalPaceNote[]
  /** One-off notes earned by this session (e.g. graduating to full leg raises). */
  notes: string[]
}

/** A flexibility log: a stretch-session marker (angles omitted) and/or measurements. */
export type FlexMeasurement = {
  splitDeg?: number | null
  coldSplitDeg?: number | null
  warmSplitDeg?: number | null
  tailorsLeftDeg?: number | null
  tailorsRightDeg?: number | null
  tailorsColdLeftDeg?: number | null
  tailorsColdRightDeg?: number | null
  tailorsWarmLeftDeg?: number | null
  tailorsWarmRightDeg?: number | null
  note?: string
}

/** The angle fields a measurement can carry — one non-null makes it a reading. */
const FLEX_ANGLE_KEYS = [
  'splitDeg',
  'coldSplitDeg',
  'warmSplitDeg',
  'tailorsLeftDeg',
  'tailorsRightDeg',
  'tailorsColdLeftDeg',
  'tailorsColdRightDeg',
  'tailorsWarmLeftDeg',
  'tailorsWarmRightDeg',
] as const

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export type Toast = { msg: string; ok: boolean }

type DataContextValue = {
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  flexEntries: FlexEntry[]
  calorieEntries: CalorieEntry[]
  measurements: MeasurementEntry[]
  durations: SessionDuration[]
  exerciseAverages: ExerciseAverages
  settings: Settings
  plan: Plan
  flexPlan: FlexBlock[]
  sync: SyncState
  lastSync: string | null
  toast: Toast | null
  pendingWrites: number
  streaks: StreakState
  streakHistory: WeekResult[]
  weekProgress: WeekProgress
  goals: WeeklyGoalConfig
  saveSession: (s: WorkoutSession, duration?: SessionDurationInput) => Promise<WorkoutFinishSummary>
  flagDiscomfort: (edit: NotesEdit) => Promise<void>
  logBodyWeight: (weightLbs: number, date?: string) => Promise<void>
  logFlex: (measurement: FlexMeasurement) => Promise<void>
  logCalories: (calories: number, date?: string) => Promise<void>
  logMeasurement: (m: Omit<MeasurementEntry, 'date'> & { date?: string }) => Promise<void>
  logSessionDuration: (entry: SessionDuration) => Promise<void>
  logExerciseTimes: (samples: SessionTimeSamples) => Promise<void>
  logCore: (reps: number[]) => Promise<void>
  /** A single at `weightLbs` on `exerciseKey`, the way a strength goal is settled. */
  logMaxAttempt: (exerciseKey: string, weightLbs: number) => Promise<void>
  logProgressPhoto: () => void
  importData: (rows: WorkoutRow[], bodyWeights: BodyWeightEntry[]) => Promise<void>
  updateSettings: (s: Settings) => void
  updatePlan: (p: Plan) => void
  updateFlexPlan: (r: FlexBlock[]) => void
  refresh: () => Promise<void>
}

/** Shortest gap between full pulls triggered by resuming or reconnecting. */
const PULL_COOLDOWN_MS = 5 * 60_000

const Ctx = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>(() => storage.loadWorkouts())
  const [bodyWeights, setBodyWeights] = useState<BodyWeightEntry[]>(() => storage.loadBodyWeights())
  const [flexEntries, setFlexEntries] = useState<FlexEntry[]>(() => storage.loadFlex())
  const [calorieEntries, setCalorieEntries] = useState<CalorieEntry[]>(() => storage.loadCalories())
  const [measurements, setMeasurements] = useState<MeasurementEntry[]>(() => storage.loadMeasurements())
  const [durations, setDurations] = useState<SessionDuration[]>(() => storage.loadDurations())
  const [exerciseAverages, setExerciseAverages] = useState<ExerciseAverages>(() =>
    storage.loadExerciseAverages(),
  )
  const [settings, setSettings] = useState<Settings>(() => storage.loadSettings())
  const [plan, setPlan] = useState<Plan>(() => storage.loadPlan())
  const [flexPlan, setFlexPlan] = useState<FlexBlock[]>(() => storage.loadFlexPlan())
  const [queue, setQueue] = useState<QueuedWrite[]>(() => storage.loadQueue())
  const [sync, setSync] = useState<SyncState>('idle')
  const [lastSync, setLastSync] = useState<string | null>(() => storage.loadLastSync())
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const { celebrate } = useCelebrate()

  // Weekly-goal celebrations earned when this-week counts move before → after.
  const weeklyCelebrations = useCallback((before: WeekCounts, after: WeekCounts): Celebration[] => {
    return newlyEarned(before, after, DEFAULT_WEEKLY_GOALS).map((k) =>
      achievementCelebration(k, after, DEFAULT_WEEKLY_GOALS),
    )
  }, [])

  const persistWorkouts = useCallback((rows: WorkoutRow[]) => {
    setWorkouts(rows)
    storage.saveWorkouts(rows)
  }, [])
  const persistWeights = useCallback((e: BodyWeightEntry[]) => {
    setBodyWeights(e)
    storage.saveBodyWeights(e)
  }, [])
  const persistFlex = useCallback((e: FlexEntry[]) => {
    setFlexEntries(e)
    storage.saveFlex(e)
  }, [])
  const persistCalories = useCallback((e: CalorieEntry[]) => {
    setCalorieEntries(e)
    storage.saveCalories(e)
  }, [])
  const persistMeasurements = useCallback((e: MeasurementEntry[]) => {
    setMeasurements(e)
    storage.saveMeasurements(e)
  }, [])
  const persistDurations = useCallback((e: SessionDuration[]) => {
    setDurations(e)
    storage.saveDurations(e)
  }, [])
  const persistExerciseAverages = useCallback((a: ExerciseAverages) => {
    setExerciseAverages(a)
    storage.saveExerciseAverages(a)
  }, [])
  /**
   * Record a write in the outbox before anything is sent. Returns the queued
   * write so the caller can ask, once the outbox has been pushed, whether its
   * own entry made it — see `deliver`.
   */
  const enqueue = useCallback((payload: WritePayload): QueuedWrite => {
    const w = newWrite(payload, uuid())
    setQueue(storage.updateQueue((q) => enqueued(q, w)))
    return w
  }, [])

  // Push the outbox in order, dropping each write only once the backend has
  // taken it. A write that fails stays queued and the rest still go.
  const runFlush = useCallback(async () => {
    if (!api.isConfigured()) return
    for (const w of storage.loadQueue()) {
      try {
        if (w.type === 'session') await api.postSession(w.rows)
        else if (w.type === 'notes') await api.postNotes(w.edit)
        else if (w.type === 'bodyweight') await api.postBodyWeight(w.entry)
        else if (w.type === 'flex') await api.postFlex(w.entry)
        else if (w.type === 'calorie') await api.postCalorie(w.entry)
        else if (w.type === 'measurement') await api.postMeasurement(w.entry)
        else if (w.type === 'duration') await api.postDuration(w.entry)
        else if (w.type === 'exerciseTimes') await api.postExerciseTimes(w.samples)
        else if (w.type === 'plan') await api.postPlan(w.plan)
        else if (w.type === 'settings') await api.postSettings(w.settings)
      } catch {
        continue
      }
      setQueue(storage.updateQueue((q) => dequeued(q, w.id)))
    }
  }, [])

  // One flush at a time. A day's calories are sent as a running total, so two
  // overlapping pushes can reach the sheet out of order and leave it on the
  // older number — the newer tap looks saved on this device and isn't.
  const flushChain = useRef<Promise<void>>(Promise.resolve())
  const flush = useCallback((): Promise<void> => {
    // Both arms run the next flush: a rejected link must not poison the chain.
    const next = flushChain.current.then(runFlush, runFlush)
    flushChain.current = next
    return next
  }, [runFlush])

  /**
   * Push the outbox and report whether `w` landed. An id that's gone counts as
   * delivered: either the backend took it, or a newer write superseded it (a
   * later tap on the same day carries that day's total), and that write reports
   * for itself.
   */
  const deliver = useCallback(
    async (w: QueuedWrite): Promise<boolean> => {
      await flush()
      return !storage.loadQueue().some((x) => x.id === w.id)
    },
    [flush],
  )

  /**
   * Save settings locally and queue them for the backend, stamped with the
   * moment they were written — the stamp the merge orders two devices' copies by
   * (see lib/settingsSync). Queued rather than posted directly so a commitment
   * made offline still reaches the sheet, and silent because most settings
   * writes aren't a deliberate save the user is waiting on (a progress photo, a
   * lock adopting the goal's current curve).
   */
  const persistSettings = useCallback(
    (s: Settings) => {
      const next: Settings = { ...s, updatedAt: new Date().toISOString() }
      setSettings(next)
      storage.saveSettings(next)
      enqueue({ type: 'settings', settings: syncablePart(next) })
      void flush()
    },
    [enqueue, flush],
  )

  const refresh = useCallback(async () => {
    if (!api.isConfigured()) {
      setSync('offline')
      return
    }
    setSync('syncing')
    try {
      await flush()
      const [w, bw] = await Promise.all([api.fetchWorkouts(), api.fetchBodyWeight()])
      persistWorkouts(w)
      persistWeights(bw)
      setSync('idle')
      const now = new Date().toISOString()
      setLastSync(now)
      storage.saveLastSync(now)
    } catch {
      setSync('error')
    }
    // Best-effort extras — tolerate an older backend without these routes.
    try {
      const f = await api.fetchFlex()
      // Merge rather than replace: a fetched value wins for the field it carries,
      // but a field the backend has nothing for keeps this device's reading. A
      // deployment that predates a column (the cold/warm angles, say) returns
      // those as null for every row, and replacing wholesale would erase the
      // angles this session just measured.
      if (Array.isArray(f)) persistFlex(dedupeFlexByDate([...storage.loadFlex(), ...f]))
    } catch {
      /* ignore */
    }
    try {
      const c = await api.fetchCalories()
      // Merge rather than replace: this device's local total wins for any date
      // it already has, so a fetch can't clobber optimistic taps (including a
      // −100 correction) the server hasn't recorded yet.
      //
      // Exactly once, the server has to win instead. Caches written while the
      // sheet still held a row per tap store those rows summed, and local-wins
      // gives no way back — no later fetch can correct a date this device
      // already has. Waiting for a *successful* fetch to spend the flag, rather
      // than clearing the cache at startup, keeps a tap made before the first
      // sync adding to a real total instead of restarting the day from zero.
      //
      // The server also wins whenever the outbox is empty: everything this
      // device logged has been accepted, so any difference left is an edit made
      // to the sheet directly, and local-wins would hide it forever. Checked
      // after the fetch resolves, so a tap made mid-request still holds (its
      // write is sitting in the queue at this moment).
      if (Array.isArray(c)) {
        const repaired = storage.caloriesRepaired()
        const settled = storage.loadQueue().length === 0
        persistCalories(
          mergeCaloriesByDate(storage.loadCalories(), c, { serverWins: !repaired || settled }),
        )
        if (!repaired) storage.markCaloriesRepaired()
      }
    } catch {
      /* ignore */
    }
    try {
      const m = await api.fetchMeasurements()
      // Merge rather than replace, for the same reason as flex: a fetched date
      // wins, but a backend with nothing to say can't blank this device's log.
      if (Array.isArray(m))
        persistMeasurements(dedupeMeasurementsByDate([...storage.loadMeasurements(), ...m]))
    } catch {
      /* ignore */
    }
    try {
      const d = await api.fetchDurations()
      // Merge rather than replace: the Time-spent report reads this cache, and a
      // backend holding no duration rows returns [] — replacing wholesale would
      // erase every session this device recorded, including ones still queued.
      if (Array.isArray(d)) persistDurations(mergeDurations(storage.loadDurations(), d))
    } catch {
      /* ignore */
    }
    try {
      const ex = await api.fetchExerciseTimes()
      // The backend pools every device's samples, so it wins per exercise where
      // it has any — but it can't reset an average it has nothing for, or an
      // empty `active` map would wipe everything learned locally. Normalised on
      // the way in, so a backend still serving the old pooled rest *seconds*
      // degrades to "no rest samples" instead of a nonsense ratio.
      if (ex && typeof ex === 'object' && ex.active) {
        persistExerciseAverages(
          mergeExerciseAverages(storage.loadExerciseAverages(), normalizeExerciseAverages(ex)),
        )
      }
    } catch {
      /* ignore — an older backend won't have this route */
    }
    try {
      // Merge rather than replace, and in both directions: the account's copy
      // restores what this device lost (a reinstall's committed goals), while
      // anything only this device holds gets pushed up rather than dropped.
      //
      // `null` means the route works but nothing has been stored — a backend
      // without the route throws and lands in the catch. That distinction
      // matters: on the first sync after this shipped there is nothing up there
      // and the locks the user already committed have never queued a write of
      // their own, so this is the moment to seed the account with them rather
      // than wait for the next time a setting happens to change.
      const stored = await api.fetchSettings()
      const remote = stored && typeof stored === 'object' ? stored : null
      const local = storage.loadSettings()
      const merged = mergeSettings(local, remote)
      if (!sameSyncedSettings(syncablePart(merged), remote)) {
        persistSettings(merged)
      } else if (!sameSyncedSettings(syncablePart(local), syncablePart(merged))) {
        // The account only told this device things it didn't know; save them, but
        // don't push a copy identical to the one already up there.
        setSettings(merged)
        storage.saveSettings(merged)
      }
    } catch {
      /* ignore — an older backend won't have this route */
    }
    try {
      const p = await api.fetchPlan()
      if (p && p.push && p.pull) {
        // The sheet stores the plan without a revision marker, so reconcile the
        // fetched copy against this device's — a plan that predates a shipped
        // restructure gets it applied rather than overwriting the local one. Its
        // deletions come along the same way: a copy pushed before those were
        // recorded would otherwise re-adopt every default it dropped, and this
        // line saves the result.
        const local = storage.loadPlan()
        const merged = withPlanDefaults(withRemovedFrom(p, local), storage.loadPlanRevision())
        setPlan(merged)
        storage.savePlan(merged)
      }
    } catch {
      /* ignore */
    }
  }, [flush, persistWorkouts, persistWeights, persistFlex, persistCalories, persistMeasurements, persistDurations, persistExerciseAverages, persistSettings])

  // Initial sync, then re-sync whenever there's a fresh chance to: back online,
  // or back in the foreground. A phone that logged something and got locked
  // mid-request resumes without a remount, so visibility is the only moment
  // that retry happens before the next cold start.
  //
  // Resuming pulls as well as pushes. A row edited in the sheet by hand only
  // reaches the app on a fetch, and an installed PWA can sit in the background
  // for days without ever remounting — push-only meant those edits waited for a
  // cold start. Throttled, since a pull is a fistful of Apps Script round-trips
  // and app-switching shouldn't spend them.
  const lastPullRef = useRef(0)
  useEffect(() => {
    lastPullRef.current = Date.now()
    void refresh()
    const resync = () => {
      if (Date.now() - lastPullRef.current < PULL_COOLDOWN_MS) {
        void flush()
        return
      }
      lastPullRef.current = Date.now()
      void refresh()
    }
    const onOnline = () => resync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, flush])

  // Progression inputs per exercise key, from the live plan — for challenge
  // detection (which lifts the session was asked to beat, and whether it did).
  const challengeOptsByKey = useMemo(() => {
    const m = new Map<string, ChallengeOpts>()
    for (const day of Object.values(plan)) {
      for (const e of day.exercises) {
        m.set(e.key, { repMin: e.repMin, repMax: e.repMax, bodyweight: e.bodyweight, increment: e.increment, sharedLoad: e.sharedLoad })
      }
    }
    return m
  }, [plan])

  const saveSession = useCallback(
    async (s: WorkoutSession, duration?: SessionDurationInput): Promise<WorkoutFinishSummary> => {
      const prev = storage.loadWorkouts()
      const rows = sessionToRows(s)
      const next = [...prev, ...rows]
      persistWorkouts(next) // optimistic

      // The outbox entry is written synchronously; delivery runs in the
      // background so the finish recap can show immediately.
      const pending = enqueue({ type: 'session', rows })
      void deliver(pending).then((ok) =>
        notify(ok ? 'workout saved' : "couldn't save — queued to retry", ok),
      )

      // Headline achievements shown in the finish recap.
      const prs = detectPRs(prev, rows)
      const baselines = metBaselines(sessionChallenges(prev, rows, challengeOptsByKey))

      // "Ambient" wins (weekly goals, all-time records) are handed back to play
      // as a transient celebration once the recap is dismissed — the recap owns
      // the PR / baseline moment, so those aren't duplicated here.
      let ambient: Celebration | null = null
      try {
        const flexDates = storage.loadFlex().map((f) => f.date)
        const cals = storage.loadCalories()
        const before = currentWeekCounts(prev, flexDates, cals)
        const after = currentWeekCounts(next, flexDates, cals)
        const beforeRec: RecordSnapshot = { workouts: prev, flexDates, calorieEntries: cals }
        const afterRec: RecordSnapshot = { workouts: next, flexDates, calorieEntries: cals }
        ambient = composeCelebration([
          ...weeklyCelebrations(before, after),
          ...newRecords(beforeRec, afterRec),
        ])
      } catch {
        /* a missed cheer must never break a save */
      }

      // Goal pacing + one-off progression notes. Same defensive framing as the
      // ambient cheers: a missing note must never break the save.
      let goalPace: GoalPaceNote[] = []
      const notes: string[] = []
      try {
        const s = storage.loadSettings()
        goalPace = goalPaceNotes(prev, rows, s.lockedGoals ?? {}, {
          bodyWeights: storage.loadBodyWeights(),
          measurements: storage.loadMeasurements(),
          heightIn: s.heightIn ?? 0,
        })
        const graduated = graduationNote(prev, rows)
        if (graduated) notes.push(graduated)
      } catch {
        /* pacing is commentary, not the save */
      }

      const totalSec = duration?.totalSec ?? 0
      const restSec = Math.max(0, Math.min(duration?.restSec ?? 0, totalSec))
      return { prs, baselines, totalSec, activeSec: totalSec - restSec, restSec, ambient, goalPace, notes }
    },
    [challengeOptsByKey, deliver, enqueue, notify, persistWorkouts, weeklyCelebrations],
  )

  /**
   * Set (or clear) a discomfort flag on an exercise in a session that has
   * already been saved — the knee you only notice on the drive home.
   *
   * The note is rewritten where it landed rather than logged again: it belongs
   * to the exercise, all of its set rows carry the same copy, and a fresh row
   * would read as a set that was never performed. Queued like every other write,
   * so a flag added offline still reaches the sheet — and it has to reach it,
   * since a refresh replaces this device's rows with the sheet's.
   */
  const flagDiscomfort = useCallback(
    async (edit: NotesEdit) => {
      persistWorkouts(applyNotesEdit(storage.loadWorkouts(), edit))
      const ok = await deliver(enqueue({ type: 'notes', edit }))
      const saved = parseDiscomfort(edit.notes).length > 0 ? 'discomfort noted' : 'flag cleared'
      notify(ok ? saved : "couldn't save — queued to retry", ok)
    },
    [deliver, enqueue, notify, persistWorkouts],
  )

  const logBodyWeight = useCallback(
    async (weightLbs: number, date?: string) => {
      const entry: BodyWeightEntry = { date: date ?? toISODate(new Date()), weightLbs }
      persistWeights([...storage.loadBodyWeights(), entry])
      const ok = await deliver(enqueue({ type: 'bodyweight', entry }))
      notify(ok ? 'weight saved' : "couldn't save — queued to retry", ok)
    },
    [deliver, enqueue, notify, persistWeights],
  )

  const importData = useCallback(
    async (rows: WorkoutRow[], bws: BodyWeightEntry[]) => {
      if (rows.length) persistWorkouts([...storage.loadWorkouts(), ...rows])
      if (bws.length) persistWeights([...storage.loadBodyWeights(), ...bws])
      let ok = true
      if (rows.length) {
        try {
          await api.postImport(rows)
        } catch {
          enqueue({ type: 'session', rows })
          ok = false
        }
      }
      if (bws.length) {
        try {
          await api.postBodyWeightBulk(bws)
        } catch {
          for (const entry of bws) enqueue({ type: 'bodyweight', entry })
          ok = false
        }
      }
      notify(ok ? 'imported to sheet' : "couldn't save import — queued to retry", ok)
    },
    [enqueue, notify, persistWorkouts, persistWeights],
  )

  const logFlex = useCallback(
    async (m: FlexMeasurement) => {
      const entry: FlexEntry = {
        date: toISODate(new Date()),
        splitDeg: m.splitDeg ?? null,
        coldSplitDeg: m.coldSplitDeg ?? null,
        warmSplitDeg: m.warmSplitDeg ?? null,
        tailorsLeftDeg: m.tailorsLeftDeg ?? null,
        tailorsRightDeg: m.tailorsRightDeg ?? null,
        tailorsColdLeftDeg: m.tailorsColdLeftDeg ?? null,
        tailorsColdRightDeg: m.tailorsColdRightDeg ?? null,
        tailorsWarmLeftDeg: m.tailorsWarmLeftDeg ?? null,
        tailorsWarmRightDeg: m.tailorsWarmRightDeg ?? null,
        note: m.note,
      }
      const isMeasurement = FLEX_ANGLE_KEYS.some((k) => m[k] != null)
      const prevFlex = storage.loadFlex()
      const nextFlex = dedupeFlexByDate([...prevFlex, entry])
      persistFlex(nextFlex)
      // Cheer before the round-trip: the finish screen belongs to the moment you
      // finished, not to whenever the backend gets back to us.
      // Only a completed stretch session cheers — a pure angle measurement doesn't.
      if (!isMeasurement) {
        try {
          const workoutsNow = storage.loadWorkouts()
          const cals = storage.loadCalories()
          const beforeFlexDates = prevFlex.map((f) => f.date)
          const afterFlexDates = nextFlex.map((f) => f.date)
          const before = currentWeekCounts(workoutsNow, beforeFlexDates, cals)
          const after = currentWeekCounts(workoutsNow, afterFlexDates, cals)
          const beforeRec: RecordSnapshot = { workouts: workoutsNow, flexDates: beforeFlexDates, calorieEntries: cals }
          const afterRec: RecordSnapshot = { workouts: workoutsNow, flexDates: afterFlexDates, calorieEntries: cals }
          celebrate(
            composeCelebration([
              stretchDoneCelebration,
              // The angles measured during the session — a new best on a pose, a
              // goal crossed — are cheered here, at the end, not when the camera
              // caught them mid-stretch.
              ...flexAngleCelebrations(nextFlex),
              ...weeklyCelebrations(before, after),
              ...newRecords(beforeRec, afterRec),
            ]),
          )
        } catch {
          /* a missed cheer must never break a save */
        }
      }
      const ok = await deliver(enqueue({ type: 'flex', entry }))
      const saved = isMeasurement ? 'measurement saved' : 'stretch logged'
      notify(ok ? saved : "couldn't save — queued to retry", ok)
    },
    [celebrate, deliver, enqueue, notify, persistFlex, weeklyCelebrations],
  )

  const logCalories = useCallback(
    // `calories` is the amount to add; a day is stored as one running-total entry.
    async (calories: number, date?: string) => {
      const now = new Date()
      const day = date ?? toISODate(now)
      const prevCals = storage.loadCalories()
      // `calories` may be negative (a −100 correction); never let a day go below 0.
      const newTotal = Math.max(0, totalForDate(prevCals, day) + calories)
      // Stamp the log time only when logging TODAY. Backfilling an earlier day
      // says nothing about when that day's food was eaten, so it leaves the
      // existing timestamp (if any) alone rather than writing a misleading one.
      const loggedAt = day === toISODate(now) ? now.toISOString() : undefined
      const nextCals = setDayTotal(prevCals, day, newTotal, loggedAt)
      const entry: CalorieEntry = { date: day, calories: newTotal, ...(loggedAt && { loggedAt }) }
      persistCalories(nextCals)
      // Write-ahead: the outbox entry is on disk before the network is touched,
      // so a tap interrupted mid-POST — the phone sleeping, the PWA going to the
      // background, the tab closing — is still there to retry. Enqueuing also
      // coalesces, leaving at most the newest running total per date, so a stale
      // earlier total can never overwrite a newer one on the way out.
      const signed = calories >= 0 ? `+${calories}` : `${calories}`
      const ok = await deliver(enqueue({ type: 'calorie', entry }))
      notify(ok ? `${signed} cal saved` : "couldn't save — queued to retry", ok)
      // Cheer: this date's total just crossed the goal + any weekly calorie-day goal.
      try {
        const crossed =
          totalForDate(prevCals, entry.date) < CALORIE_GOAL && totalForDate(nextCals, entry.date) >= CALORIE_GOAL
        const workoutsNow = storage.loadWorkouts()
        const flexDates = storage.loadFlex().map((f) => f.date)
        const before = currentWeekCounts(workoutsNow, flexDates, prevCals)
        const after = currentWeekCounts(workoutsNow, flexDates, nextCals)
        const beforeRec: RecordSnapshot = { workouts: workoutsNow, flexDates, calorieEntries: prevCals }
        const afterRec: RecordSnapshot = { workouts: workoutsNow, flexDates, calorieEntries: nextCals }
        celebrate(
          composeCelebration([
            crossed ? calorieGoalCelebration(CALORIE_GOAL) : null,
            ...weeklyCelebrations(before, after),
            ...newRecords(beforeRec, afterRec),
          ]),
        )
      } catch {
        /* a missed cheer must never break a save */
      }
    },
    [celebrate, deliver, enqueue, notify, persistCalories, weeklyCelebrations],
  )

  const logMeasurement = useCallback(
    async (m: Omit<MeasurementEntry, 'date'> & { date?: string }) => {
      const { date, ...rest } = m
      const entry: MeasurementEntry = { date: date ?? toISODate(new Date()), ...rest }
      persistMeasurements(dedupeMeasurementsByDate([...storage.loadMeasurements(), entry]))
      const ok = await deliver(enqueue({ type: 'measurement', entry }))
      notify(ok ? 'measurement saved' : "couldn't save — queued to retry", ok)
    },
    [deliver, enqueue, notify, persistMeasurements],
  )

  // Records a finished session's length for time-left learning + time-spent
  // reporting. Silent (the workout/stretch save already toasts) and drops
  // implausible durations so a backgrounded session can't skew the numbers.
  const logSessionDuration = useCallback(
    async (entry: SessionDuration) => {
      if (!isSaneDuration(entry.totalSec)) return
      persistDurations([...storage.loadDurations(), entry])
      enqueue({ type: 'duration', entry })
      await flush()
    },
    [enqueue, flush, persistDurations],
  )

  // Folds a finished workout's per-exercise active times + rests into the
  // rolling averages that drive the time-left estimate. Optimistically updates
  // the local copy so the next session estimates well even before the backend
  // round-trips; a later fetch replaces it with the authoritative averages.
  const logExerciseTimes = useCallback(
    async (samples: SessionTimeSamples) => {
      if (samples.exercises.length === 0 && !(samples.restCount > 0)) return
      persistExerciseAverages(applySessionSamples(storage.loadExerciseAverages(), samples))
      enqueue({ type: 'exerciseTimes', samples })
      await flush()
    },
    [enqueue, flush, persistExerciseAverages],
  )

  // Logs the dead-bug sets done during a Stretch + Core session as workout rows
  // (one shared session_id, reps per set) under the Dead Bug key, so they feed
  // the reps chart and core-progress series. Silent — the stretch save toasts —
  // and no celebration: these are supplemental and don't count as a workout
  // (trainingSessions excludes a session whose only exercise is a supplemental
  // core move). The day_type is cosmetic here for the same reason.
  const logCore = useCallback(
    async (reps: number[]) => {
      const done = reps.filter((r) => r > 0)
      if (done.length === 0) return
      const sessionId = uuid()
      const date = toISODate(new Date())
      const rows: WorkoutRow[] = done.map((r, i) => ({
        session_id: sessionId,
        date,
        day_type: 'push',
        exercise: DEAD_BUG.key,
        set_number: i + 1,
        weight_lbs: null,
        reps: r,
        notes: '',
        is_historical: false,
      }))
      persistWorkouts([...storage.loadWorkouts(), ...rows])
      enqueue({ type: 'session', rows })
      await flush()
    },
    [enqueue, flush, persistWorkouts],
  )

  // Logs a one-rep max attempt as a workout row of its own: a real set on a real
  // lift, so it lands in that lift's history and PRs rather than in a private
  // ledger the charts can't see. It's what settles a strength goal (see
  // goals.GoalSpec's `singles`), and the goal row it was logged from turns over to
  // "goal reached!" as soon as this lands, which is feedback enough — hence no
  // toast. The day type is the day the lift is programmed on, cosmetically: one
  // single isn't a session, and the week's count leaves it out (see
  // session.trainingSessions).
  const logMaxAttempt = useCallback(
    async (exerciseKey: string, weightLbs: number) => {
      if (!(weightLbs > 0)) return
      const day = DAY_TYPES.find((t) => plan[t].exercises.some((e) => e.key === exerciseKey))
      const row = maxAttemptRow({
        sessionId: uuid(),
        date: toISODate(new Date()),
        dayType: day ?? 'fullbody',
        exercise: exerciseKey,
        weightLbs,
      })
      persistWorkouts([...storage.loadWorkouts(), row])
      enqueue({ type: 'session', rows: [row] })
      await flush()
    },
    [enqueue, flush, persistWorkouts, plan],
  )

  const logProgressPhoto = useCallback(() => {
    persistSettings({ ...storage.loadSettings(), lastProgressPhoto: toISODate(new Date()) })
  }, [persistSettings])

  const updateSettings = useCallback((s: Settings) => persistSettings(s), [persistSettings])

  const updatePlan = useCallback(
    (p: Plan) => {
      setPlan(p)
      storage.savePlan(p)
      void deliver(enqueue({ type: 'plan', plan: p })).then((ok) =>
        notify(ok ? 'plan saved' : "couldn't save plan — queued to retry", ok),
      )
    },
    [deliver, enqueue, notify],
  )

  // Flex routine persists per-device for now (not yet synced to the Sheet).
  const updateFlexPlan = useCallback((r: FlexBlock[]) => {
    setFlexPlan(r)
    storage.saveFlexPlan(r)
  }, [])

  // Distinct dates trained — two sessions in a day count once. Supplemental
  // core-only sessions (dead bugs done with a stretch) are excluded too, so
  // neither inflates the weekly workout goal.
  const workoutDates = useMemo(() => trainingDates(workouts), [workouts])
  const flexDates = useMemo(() => flexEntries.map((f) => f.date), [flexEntries])
  const calHitDates = useMemo(() => calorieHitDates(calorieEntries), [calorieEntries])

  // Every completed week replayed, oldest first. The flame is this list's last
  // row rather than a second calculation, so the Progress breakdown always
  // explains the number the Today tab shows.
  const streakHistory = useMemo(
    () => weeklyStreakHistory({ workoutDates, flexDates, calorieHitDates: calHitDates }),
    [workoutDates, flexDates, calHitDates],
  )

  const streaks = useMemo<StreakState>(() => {
    const last = streakHistory[streakHistory.length - 1]
    return last ? { streak: last.streakAfter, freezes: last.freezesAfter } : { streak: 0, freezes: 0 }
  }, [streakHistory])

  const weekProgress = useMemo<WeekProgress>(() => {
    const wk = weekStartISO(toISODate(new Date()))
    const inWeek = (d: string) => weekStartISO(d) === wk
    return {
      workouts: workoutDates.filter(inWeek).length,
      flex: new Set(flexDates.filter(inWeek)).size,
      calDays: calHitDates.filter(inWeek).length,
    }
  }, [workoutDates, flexDates, calHitDates])

  // Merge read-only historical anchors (e.g. the 2025-10-31 baseline) with logged
  // measurements. Logged entries win on a shared date; history is never re-synced.
  const allMeasurements = useMemo(
    () => dedupeMeasurementsByDate([...MEASUREMENT_HISTORY, ...measurements]),
    [measurements],
  )

  const value: DataContextValue = {
    workouts,
    bodyWeights,
    flexEntries,
    calorieEntries,
    measurements: allMeasurements,
    durations,
    exerciseAverages,
    settings,
    plan,
    flexPlan,
    sync,
    lastSync,
    toast,
    pendingWrites: queue.length,
    streaks,
    streakHistory,
    weekProgress,
    goals: DEFAULT_WEEKLY_GOALS,
    saveSession,
    flagDiscomfort,
    logBodyWeight,
    logFlex,
    logCalories,
    logMeasurement,
    logSessionDuration,
    logExerciseTimes,
    logCore,
    logMaxAttempt,
    logProgressPhoto,
    importData,
    updateSettings,
    updatePlan,
    updateFlexPlan,
    refresh,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataContextValue {
  const c = useContext(Ctx)
  if (!c) throw new Error('useData must be used within DataProvider')
  return c
}
