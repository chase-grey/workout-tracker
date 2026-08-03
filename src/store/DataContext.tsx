import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { BodyWeightEntry, DayType, StreakState, WorkoutRow, WorkoutSession } from '../types'
import { storage, type QueuedWrite, type Settings } from '../services/storage'
import { api } from '../services/api'
import { sessionToRows, trainingSessions } from '../lib/session'
import { DEAD_BUG } from '../config/plan'
import { toISODate, weekStartISO } from '../lib/dates'
import { QUICK_LOG_KEY, withPlanDefaults, type Plan } from '../config/plan'
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
  type ExerciseAverages,
  type SessionDuration,
  type SessionTimeSamples,
} from '../lib/estimate'
import { sessionChallenges, metBaselines, type ChallengeOpts } from '../lib/challenge'
import { MEASUREMENT_HISTORY } from '../config/body'
import { computeWeeklyStreak, DEFAULT_WEEKLY_GOALS, type WeeklyGoalConfig } from '../lib/weeklyStreak'
import { useCelebrate } from './CelebrationContext'
import {
  achievementCelebration,
  calorieGoalCelebration,
  composeCelebration,
  currentWeekCounts,
  detectPRs,
  newlyEarned,
  stretchDoneCelebration,
  workoutDoneCelebration,
  type Celebration,
  type PR,
  type WeekCounts,
} from '../lib/celebration'
import { newRecords, type RecordSnapshot } from '../lib/records'
import { goalPaceNotes, type GoalPaceNote } from '../lib/goalPace'
import { graduationNote } from '../lib/graduation'

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
  weekProgress: WeekProgress
  goals: WeeklyGoalConfig
  saveSession: (s: WorkoutSession, duration?: SessionDurationInput) => Promise<WorkoutFinishSummary>
  logBodyWeight: (weightLbs: number, date?: string) => Promise<void>
  logFlex: (measurement: FlexMeasurement) => Promise<void>
  logCalories: (calories: number, date?: string) => Promise<void>
  logMeasurement: (m: Omit<MeasurementEntry, 'date'> & { date?: string }) => Promise<void>
  logSessionDuration: (entry: SessionDuration) => Promise<void>
  logExerciseTimes: (samples: SessionTimeSamples) => Promise<void>
  quickLog: (dayType: DayType) => Promise<void>
  logCore: (reps: number[]) => Promise<void>
  logProgressPhoto: () => void
  importData: (rows: WorkoutRow[], bodyWeights: BodyWeightEntry[]) => Promise<void>
  updateSettings: (s: Settings) => void
  updatePlan: (p: Plan) => void
  updateFlexPlan: (r: FlexBlock[]) => void
  refresh: () => Promise<void>
}

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
  const persistQueue = useCallback((q: QueuedWrite[]) => {
    setQueue(q)
    storage.saveQueue(q)
  }, [])

  const enqueue = useCallback(
    (w: QueuedWrite) => persistQueue([...storage.loadQueue(), w]),
    [persistQueue],
  )

  const flush = useCallback(async () => {
    if (!api.isConfigured()) return
    const remaining: QueuedWrite[] = []
    for (const w of storage.loadQueue()) {
      try {
        if (w.type === 'session') await api.postSession(w.rows)
        else if (w.type === 'bodyweight') await api.postBodyWeight(w.entry)
        else if (w.type === 'flex') await api.postFlex(w.entry)
        else if (w.type === 'calorie') await api.postCalorie(w.entry)
        else if (w.type === 'measurement') await api.postMeasurement(w.entry)
        else if (w.type === 'duration') await api.postDuration(w.entry)
        else if (w.type === 'exerciseTimes') await api.postExerciseTimes(w.samples)
        else if (w.type === 'plan') await api.postPlan(w.plan)
      } catch {
        remaining.push(w)
      }
    }
    persistQueue(remaining)
  }, [persistQueue])

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
      if (Array.isArray(f)) persistFlex(dedupeFlexByDate(f))
    } catch {
      /* ignore */
    }
    try {
      const c = await api.fetchCalories()
      // Merge rather than replace: this device's local total wins for any date
      // it already has, so a fetch can't clobber optimistic taps (including a
      // −100 correction) the server hasn't recorded yet.
      if (Array.isArray(c)) persistCalories(mergeCaloriesByDate(storage.loadCalories(), c))
    } catch {
      /* ignore */
    }
    try {
      const m = await api.fetchMeasurements()
      if (Array.isArray(m)) persistMeasurements(dedupeMeasurementsByDate(m))
    } catch {
      /* ignore */
    }
    try {
      const d = await api.fetchDurations()
      if (Array.isArray(d)) persistDurations(d)
    } catch {
      /* ignore */
    }
    try {
      const ex = await api.fetchExerciseTimes()
      // The backend is authoritative for the rolling averages; replace local.
      if (ex && typeof ex === 'object' && ex.active) persistExerciseAverages(ex)
    } catch {
      /* ignore — an older backend won't have this route */
    }
    try {
      const p = await api.fetchPlan()
      if (p && p.push && p.pull) {
        // The sheet stores the plan without a revision marker, so reconcile the
        // fetched copy against this device's — a plan that predates a shipped
        // restructure gets it applied rather than overwriting the local one.
        const merged = withPlanDefaults(p, storage.loadPlanRevision())
        setPlan(merged)
        storage.savePlan(merged)
      }
    } catch {
      /* ignore */
    }
  }, [flush, persistWorkouts, persistWeights, persistFlex, persistCalories, persistMeasurements, persistDurations, persistExerciseAverages])

  // Initial sync + flush the queue whenever we come back online.
  useEffect(() => {
    void refresh()
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh, flush])

  // Progression inputs per exercise key, from the live plan — for challenge
  // detection (which lifts the session was asked to beat, and whether it did).
  const challengeOptsByKey = useMemo(() => {
    const m = new Map<string, ChallengeOpts>()
    for (const day of Object.values(plan)) {
      for (const e of day.exercises) {
        m.set(e.key, { repMin: e.repMin, repMax: e.repMax, bodyweight: e.bodyweight, increment: e.increment })
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

      // Persist to the backend in the background so the finish recap can show
      // immediately (offline still falls back to the retry queue).
      void api.postSession(rows).then(
        () => notify('workout saved', true),
        () => {
          enqueue({ type: 'session', rows })
          notify("couldn't save — queued to retry", false)
        },
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
    [challengeOptsByKey, enqueue, notify, persistWorkouts, weeklyCelebrations],
  )

  const logBodyWeight = useCallback(
    async (weightLbs: number, date?: string) => {
      const entry: BodyWeightEntry = { date: date ?? toISODate(new Date()), weightLbs }
      persistWeights([...storage.loadBodyWeights(), entry])
      try {
        await api.postBodyWeight(entry)
        notify('weight saved', true)
      } catch {
        enqueue({ type: 'bodyweight', entry })
        notify("couldn't save — queued to retry", false)
      }
    },
    [enqueue, notify, persistWeights],
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
              ...weeklyCelebrations(before, after),
              ...newRecords(beforeRec, afterRec),
            ]),
          )
        } catch {
          /* a missed cheer must never break a save */
        }
      }
      try {
        await api.postFlex(entry)
        notify(isMeasurement ? 'measurement saved' : 'stretch logged', true)
      } catch {
        enqueue({ type: 'flex', entry })
        notify("couldn't save — queued to retry", false)
      }
    },
    [celebrate, enqueue, notify, persistFlex, weeklyCelebrations],
  )

  const logCalories = useCallback(
    // `calories` is the amount to add; a day is stored as one running-total entry.
    async (calories: number, date?: string) => {
      const day = date ?? toISODate(new Date())
      const prevCals = storage.loadCalories()
      // `calories` may be negative (a −100 correction); never let a day go below 0.
      const newTotal = Math.max(0, totalForDate(prevCals, day) + calories)
      const entry: CalorieEntry = { date: day, calories: newTotal }
      const nextCals = setDayTotal(prevCals, day, newTotal)
      persistCalories(nextCals)
      // The queue holds at most the newest running total per date, so a stale
      // earlier total can never overwrite a newer one when the queue is flushed.
      const queueSansDay = storage.loadQueue().filter(
        (w) => !(w.type === 'calorie' && w.entry.date === day),
      )
      const signed = calories >= 0 ? `+${calories}` : `${calories}`
      try {
        await api.postCalorie(entry)
        persistQueue(queueSansDay)
        notify(`${signed} cal saved`, true)
      } catch {
        persistQueue([...queueSansDay, { type: 'calorie', entry }])
        notify("couldn't save — queued to retry", false)
      }
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
    [celebrate, notify, persistCalories, persistQueue, weeklyCelebrations],
  )

  const logMeasurement = useCallback(
    async (m: Omit<MeasurementEntry, 'date'> & { date?: string }) => {
      const { date, ...rest } = m
      const entry: MeasurementEntry = { date: date ?? toISODate(new Date()), ...rest }
      persistMeasurements(dedupeMeasurementsByDate([...storage.loadMeasurements(), entry]))
      try {
        await api.postMeasurement(entry)
        notify('measurement saved', true)
      } catch {
        enqueue({ type: 'measurement', entry })
        notify("couldn't save — queued to retry", false)
      }
    },
    [enqueue, notify, persistMeasurements],
  )

  // Records a finished session's length for time-left learning + time-spent
  // reporting. Silent (the workout/stretch save already toasts) and drops
  // implausible durations so a backgrounded session can't skew the numbers.
  const logSessionDuration = useCallback(
    async (entry: SessionDuration) => {
      if (!isSaneDuration(entry.totalSec)) return
      persistDurations([...storage.loadDurations(), entry])
      try {
        await api.postDuration(entry)
      } catch {
        enqueue({ type: 'duration', entry })
      }
    },
    [enqueue, persistDurations],
  )

  // Folds a finished workout's per-exercise active times + rests into the
  // rolling averages that drive the time-left estimate. Optimistically updates
  // the local copy so the next session estimates well even before the backend
  // round-trips; a later fetch replaces it with the authoritative averages.
  const logExerciseTimes = useCallback(
    async (samples: SessionTimeSamples) => {
      if (samples.exercises.length === 0 && !(samples.restCount > 0)) return
      persistExerciseAverages(applySessionSamples(storage.loadExerciseAverages(), samples))
      try {
        await api.postExerciseTimes(samples)
      } catch {
        enqueue({ type: 'exerciseTimes', samples })
      }
    },
    [enqueue, persistExerciseAverages],
  )

  const quickLog = useCallback(
    async (dayType: DayType) => {
      const row: WorkoutRow = {
        session_id: uuid(),
        date: toISODate(new Date()),
        day_type: dayType,
        exercise: QUICK_LOG_KEY,
        set_number: 1,
        weight_lbs: null,
        reps: 0,
        notes: 'quick log (no details)',
        is_historical: false,
      }
      const prev = storage.loadWorkouts()
      const next = [...prev, row]
      persistWorkouts(next)
      try {
        await api.postSession([row])
        notify('logged', true)
      } catch {
        enqueue({ type: 'session', rows: [row] })
        notify("couldn't save — queued to retry", false)
      }
      try {
        const flexDates = storage.loadFlex().map((f) => f.date)
        const cals = storage.loadCalories()
        const before = currentWeekCounts(prev, flexDates, cals)
        const after = currentWeekCounts(next, flexDates, cals)
        const beforeRec: RecordSnapshot = { workouts: prev, flexDates, calorieEntries: cals }
        const afterRec: RecordSnapshot = { workouts: next, flexDates, calorieEntries: cals }
        celebrate(
          composeCelebration([
            workoutDoneCelebration(dayType),
            ...weeklyCelebrations(before, after),
            ...newRecords(beforeRec, afterRec),
          ]),
        )
      } catch {
        /* a missed cheer must never break a save */
      }
    },
    [celebrate, enqueue, notify, persistWorkouts, weeklyCelebrations],
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
      try {
        await api.postSession(rows)
      } catch {
        enqueue({ type: 'session', rows })
      }
    },
    [enqueue, persistWorkouts],
  )

  const logProgressPhoto = useCallback(() => {
    const next = { ...storage.loadSettings(), lastProgressPhoto: toISODate(new Date()) }
    setSettings(next)
    storage.saveSettings(next)
  }, [])

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s)
    storage.saveSettings(s)
  }, [])

  const updatePlan = useCallback(
    (p: Plan) => {
      setPlan(p)
      storage.savePlan(p)
      api.postPlan(p).then(
        () => notify('plan saved', true),
        () => {
          enqueue({ type: 'plan', plan: p })
          notify("couldn't save plan — queued to retry", false)
        },
      )
    },
    [enqueue, notify],
  )

  // Flex routine persists per-device for now (not yet synced to the Sheet).
  const updateFlexPlan = useCallback((r: FlexBlock[]) => {
    setFlexPlan(r)
    storage.saveFlexPlan(r)
  }, [])

  // Distinct workout-session dates (one per session_id). Supplemental core-only
  // sessions (dead bugs done with a stretch) are excluded so they don't inflate
  // the weekly workout goal.
  const workoutDates = useMemo(() => trainingSessions(workouts).map((s) => s.date), [workouts])
  const flexDates = useMemo(() => flexEntries.map((f) => f.date), [flexEntries])
  const calHitDates = useMemo(() => calorieHitDates(calorieEntries), [calorieEntries])

  const streaks = useMemo(
    () => computeWeeklyStreak({ workoutDates, flexDates, calorieHitDates: calHitDates }),
    [workoutDates, flexDates, calHitDates],
  )

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
    weekProgress,
    goals: DEFAULT_WEEKLY_GOALS,
    saveSession,
    logBodyWeight,
    logFlex,
    logCalories,
    logMeasurement,
    logSessionDuration,
    logExerciseTimes,
    quickLog,
    logCore,
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
