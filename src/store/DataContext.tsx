import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { BodyWeightEntry, DayType, StreakState, WorkoutRow, WorkoutSession } from '../types'
import { storage, type QueuedWrite, type Settings } from '../services/storage'
import { api } from '../services/api'
import { sessionToRows } from '../lib/session'
import { toISODate, weekStartISO } from '../lib/dates'
import { QUICK_LOG_KEY, withPlanDefaults, type Plan } from '../config/plan'
import type { FlexBlock } from '../config/flexPlan'
import { dedupeFlexByDate, type FlexEntry } from '../lib/flex'
import { calorieHitDates, CALORIE_GOAL, totalForDate, type CalorieEntry } from '../lib/calories'
import { dedupeMeasurementsByDate, type MeasurementEntry } from '../lib/bodyComp'
import { isSaneDuration, type SessionDuration } from '../lib/estimate'
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
  prCelebration,
  stretchDoneCelebration,
  workoutDoneCelebration,
  type Celebration,
  type WeekCounts,
} from '../lib/celebration'

export type WeekProgress = { workouts: number; flex: number; calDays: number }

/** A flexibility log: a stretch-session marker (angles omitted) and/or measurements. */
export type FlexMeasurement = {
  splitDeg?: number | null
  tailorsLeftDeg?: number | null
  tailorsRightDeg?: number | null
  note?: string
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

export type Toast = { msg: string; ok: boolean }

type DataContextValue = {
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  flexEntries: FlexEntry[]
  calorieEntries: CalorieEntry[]
  measurements: MeasurementEntry[]
  durations: SessionDuration[]
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
  saveSession: (s: WorkoutSession) => Promise<void>
  logBodyWeight: (weightLbs: number, date?: string) => Promise<void>
  logFlex: (measurement: FlexMeasurement) => Promise<void>
  logCalories: (calories: number, label?: string, date?: string) => Promise<void>
  logMeasurement: (m: Omit<MeasurementEntry, 'date'> & { date?: string }) => Promise<void>
  logSessionDuration: (entry: SessionDuration) => Promise<void>
  quickLog: (dayType: DayType) => Promise<void>
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
      if (Array.isArray(c)) persistCalories(c)
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
      const p = await api.fetchPlan()
      if (p && p.push && p.pull) {
        const merged = withPlanDefaults(p)
        setPlan(merged)
        storage.savePlan(merged)
      }
    } catch {
      /* ignore */
    }
  }, [flush, persistWorkouts, persistWeights, persistFlex, persistCalories, persistMeasurements, persistDurations])

  // Initial sync + flush the queue whenever we come back online.
  useEffect(() => {
    void refresh()
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh, flush])

  const saveSession = useCallback(
    async (s: WorkoutSession) => {
      const prev = storage.loadWorkouts()
      const rows = sessionToRows(s)
      const next = [...prev, ...rows]
      persistWorkouts(next) // optimistic
      try {
        await api.postSession(rows)
        notify('Workout saved', true)
      } catch {
        enqueue({ type: 'session', rows })
        notify("Couldn't save — queued to retry", false)
      }
      // Cheer: workout done + any all-time PRs + weekly goals crossed.
      try {
        const flexDates = storage.loadFlex().map((f) => f.date)
        const cals = storage.loadCalories()
        const before = currentWeekCounts(prev, flexDates, cals)
        const after = currentWeekCounts(next, flexDates, cals)
        celebrate(
          composeCelebration([
            rows.length ? workoutDoneCelebration(s.dayType) : null,
            ...weeklyCelebrations(before, after),
            prCelebration(detectPRs(prev, rows)),
          ]),
        )
      } catch {
        /* a missed cheer must never break a save */
      }
    },
    [celebrate, enqueue, notify, persistWorkouts, weeklyCelebrations],
  )

  const logBodyWeight = useCallback(
    async (weightLbs: number, date?: string) => {
      const entry: BodyWeightEntry = { date: date ?? toISODate(new Date()), weightLbs }
      persistWeights([...storage.loadBodyWeights(), entry])
      try {
        await api.postBodyWeight(entry)
        notify('Weight saved', true)
      } catch {
        enqueue({ type: 'bodyweight', entry })
        notify("Couldn't save — queued to retry", false)
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
      notify(ok ? 'Imported to sheet' : "Couldn't save import — queued to retry", ok)
    },
    [enqueue, notify, persistWorkouts, persistWeights],
  )

  const logFlex = useCallback(
    async (m: FlexMeasurement) => {
      const entry: FlexEntry = {
        date: toISODate(new Date()),
        splitDeg: m.splitDeg ?? null,
        tailorsLeftDeg: m.tailorsLeftDeg ?? null,
        tailorsRightDeg: m.tailorsRightDeg ?? null,
        note: m.note,
      }
      const isMeasurement = m.splitDeg != null || m.tailorsLeftDeg != null || m.tailorsRightDeg != null
      const prevFlex = storage.loadFlex()
      const nextFlex = dedupeFlexByDate([...prevFlex, entry])
      persistFlex(nextFlex)
      try {
        await api.postFlex(entry)
        notify(isMeasurement ? 'Measurement saved' : 'Stretch logged', true)
      } catch {
        enqueue({ type: 'flex', entry })
        notify("Couldn't save — queued to retry", false)
      }
      // Only a completed stretch session cheers — a pure angle measurement doesn't.
      if (!isMeasurement) {
        try {
          const workoutsNow = storage.loadWorkouts()
          const cals = storage.loadCalories()
          const before = currentWeekCounts(workoutsNow, prevFlex.map((f) => f.date), cals)
          const after = currentWeekCounts(workoutsNow, nextFlex.map((f) => f.date), cals)
          celebrate(composeCelebration([stretchDoneCelebration, ...weeklyCelebrations(before, after)]))
        } catch {
          /* a missed cheer must never break a save */
        }
      }
    },
    [celebrate, enqueue, notify, persistFlex, weeklyCelebrations],
  )

  const logCalories = useCallback(
    async (calories: number, label?: string, date?: string) => {
      const entry: CalorieEntry = { date: date ?? toISODate(new Date()), calories, label }
      const prevCals = storage.loadCalories()
      const nextCals = [...prevCals, entry]
      persistCalories(nextCals)
      try {
        await api.postCalorie(entry)
        notify(`+${calories} cal saved`, true)
      } catch {
        enqueue({ type: 'calorie', entry })
        notify("Couldn't save — queued to retry", false)
      }
      // Cheer: this date's total just crossed the goal + any weekly calorie-day goal.
      try {
        const crossed =
          totalForDate(prevCals, entry.date) < CALORIE_GOAL && totalForDate(nextCals, entry.date) >= CALORIE_GOAL
        const workoutsNow = storage.loadWorkouts()
        const flexDates = storage.loadFlex().map((f) => f.date)
        const before = currentWeekCounts(workoutsNow, flexDates, prevCals)
        const after = currentWeekCounts(workoutsNow, flexDates, nextCals)
        celebrate(
          composeCelebration([
            crossed ? calorieGoalCelebration(CALORIE_GOAL) : null,
            ...weeklyCelebrations(before, after),
          ]),
        )
      } catch {
        /* a missed cheer must never break a save */
      }
    },
    [celebrate, enqueue, notify, persistCalories, weeklyCelebrations],
  )

  const logMeasurement = useCallback(
    async (m: Omit<MeasurementEntry, 'date'> & { date?: string }) => {
      const { date, ...rest } = m
      const entry: MeasurementEntry = { date: date ?? toISODate(new Date()), ...rest }
      persistMeasurements(dedupeMeasurementsByDate([...storage.loadMeasurements(), entry]))
      try {
        await api.postMeasurement(entry)
        notify('Measurement saved', true)
      } catch {
        enqueue({ type: 'measurement', entry })
        notify("Couldn't save — queued to retry", false)
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
        notes: 'Quick log (no details)',
        is_historical: false,
      }
      const prev = storage.loadWorkouts()
      const next = [...prev, row]
      persistWorkouts(next)
      try {
        await api.postSession([row])
        notify('Logged', true)
      } catch {
        enqueue({ type: 'session', rows: [row] })
        notify("Couldn't save — queued to retry", false)
      }
      try {
        const flexDates = storage.loadFlex().map((f) => f.date)
        const cals = storage.loadCalories()
        const before = currentWeekCounts(prev, flexDates, cals)
        const after = currentWeekCounts(next, flexDates, cals)
        celebrate(composeCelebration([workoutDoneCelebration(dayType), ...weeklyCelebrations(before, after)]))
      } catch {
        /* a missed cheer must never break a save */
      }
    },
    [celebrate, enqueue, notify, persistWorkouts, weeklyCelebrations],
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
        () => notify('Plan saved', true),
        () => {
          enqueue({ type: 'plan', plan: p })
          notify("Couldn't save plan — queued to retry", false)
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

  // Distinct workout-session dates (one per session_id). Abs/core sessions are
  // supplemental and excluded so they don't inflate the weekly workout goal.
  const workoutDates = useMemo(() => {
    const bySession = new Map<string, string>()
    for (const r of workouts) {
      if (r.day_type === 'abs') continue
      if (r.session_id && !bySession.has(r.session_id)) bySession.set(r.session_id, r.date)
    }
    return [...bySession.values()]
  }, [workouts])
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
    quickLog,
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
