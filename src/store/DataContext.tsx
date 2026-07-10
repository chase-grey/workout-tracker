import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { BodyWeightEntry, DayType, StreakState, WorkoutRow, WorkoutSession } from '../types'
import { storage, type QueuedWrite, type Settings } from '../services/storage'
import { api } from '../services/api'
import { sessionToRows } from '../lib/session'
import { toISODate, weekStartISO } from '../lib/dates'
import { QUICK_LOG_KEY, type Plan } from '../config/plan'
import type { FlexBlock } from '../config/flexPlan'
import { dedupeFlexByDate, type FlexEntry } from '../lib/flex'
import { calorieHitDates, type CalorieEntry } from '../lib/calories'
import { computeWeeklyStreak, DEFAULT_WEEKLY_GOALS, type WeeklyGoalConfig } from '../lib/weeklyStreak'

export type WeekProgress = { workouts: number; flex: number; calDays: number }

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

type DataContextValue = {
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  flexEntries: FlexEntry[]
  calorieEntries: CalorieEntry[]
  settings: Settings
  plan: Plan
  flexPlan: FlexBlock[]
  sync: SyncState
  pendingWrites: number
  streaks: StreakState
  weekProgress: WeekProgress
  goals: WeeklyGoalConfig
  saveSession: (s: WorkoutSession) => Promise<void>
  logBodyWeight: (weightLbs: number, date?: string) => Promise<void>
  logFlex: (angleDeg: number | null, note?: string) => Promise<void>
  logCalories: (calories: number, label?: string, date?: string) => Promise<void>
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
  const [settings, setSettings] = useState<Settings>(() => storage.loadSettings())
  const [plan, setPlan] = useState<Plan>(() => storage.loadPlan())
  const [flexPlan, setFlexPlan] = useState<FlexBlock[]>(() => storage.loadFlexPlan())
  const [queue, setQueue] = useState<QueuedWrite[]>(() => storage.loadQueue())
  const [sync, setSync] = useState<SyncState>('idle')

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
      const p = await api.fetchPlan()
      if (p && p.push && p.pull) {
        setPlan(p)
        storage.savePlan(p)
      }
    } catch {
      /* ignore */
    }
  }, [flush, persistWorkouts, persistWeights, persistFlex, persistCalories])

  // Initial sync + flush the queue whenever we come back online.
  useEffect(() => {
    void refresh()
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh, flush])

  const saveSession = useCallback(
    async (s: WorkoutSession) => {
      const rows = sessionToRows(s)
      persistWorkouts([...storage.loadWorkouts(), ...rows]) // optimistic
      try {
        await api.postSession(rows)
      } catch {
        enqueue({ type: 'session', rows })
      }
    },
    [enqueue, persistWorkouts],
  )

  const logBodyWeight = useCallback(
    async (weightLbs: number, date?: string) => {
      const entry: BodyWeightEntry = { date: date ?? toISODate(new Date()), weightLbs }
      persistWeights([...storage.loadBodyWeights(), entry])
      try {
        await api.postBodyWeight(entry)
      } catch {
        enqueue({ type: 'bodyweight', entry })
      }
    },
    [enqueue, persistWeights],
  )

  const importData = useCallback(
    async (rows: WorkoutRow[], bws: BodyWeightEntry[]) => {
      if (rows.length) persistWorkouts([...storage.loadWorkouts(), ...rows])
      if (bws.length) persistWeights([...storage.loadBodyWeights(), ...bws])
      if (rows.length) {
        try {
          await api.postImport(rows)
        } catch {
          enqueue({ type: 'session', rows })
        }
      }
      if (bws.length) {
        try {
          await api.postBodyWeightBulk(bws)
        } catch {
          for (const entry of bws) enqueue({ type: 'bodyweight', entry })
        }
      }
    },
    [enqueue, persistWorkouts, persistWeights],
  )

  const logFlex = useCallback(
    async (angleDeg: number | null, note?: string) => {
      const entry: FlexEntry = { date: toISODate(new Date()), angleDeg, note }
      persistFlex(dedupeFlexByDate([...storage.loadFlex(), entry]))
      try {
        await api.postFlex(entry)
      } catch {
        enqueue({ type: 'flex', entry })
      }
    },
    [enqueue, persistFlex],
  )

  const logCalories = useCallback(
    async (calories: number, label?: string, date?: string) => {
      const entry: CalorieEntry = { date: date ?? toISODate(new Date()), calories, label }
      persistCalories([...storage.loadCalories(), entry])
      try {
        await api.postCalorie(entry)
      } catch {
        enqueue({ type: 'calorie', entry })
      }
    },
    [enqueue, persistCalories],
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
      persistWorkouts([...storage.loadWorkouts(), row])
      try {
        await api.postSession([row])
      } catch {
        enqueue({ type: 'session', rows: [row] })
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
      api.postPlan(p).catch(() => enqueue({ type: 'plan', plan: p }))
    },
    [enqueue],
  )

  // Flex routine persists per-device for now (not yet synced to the Sheet).
  const updateFlexPlan = useCallback((r: FlexBlock[]) => {
    setFlexPlan(r)
    storage.saveFlexPlan(r)
  }, [])

  // Distinct workout-session dates (one per session_id).
  const workoutDates = useMemo(() => {
    const bySession = new Map<string, string>()
    for (const r of workouts) if (r.session_id && !bySession.has(r.session_id)) bySession.set(r.session_id, r.date)
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

  const value: DataContextValue = {
    workouts,
    bodyWeights,
    flexEntries,
    calorieEntries,
    settings,
    plan,
    flexPlan,
    sync,
    pendingWrites: queue.length,
    streaks,
    weekProgress,
    goals: DEFAULT_WEEKLY_GOALS,
    saveSession,
    logBodyWeight,
    logFlex,
    logCalories,
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
