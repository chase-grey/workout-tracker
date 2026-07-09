import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { v4 as uuid } from 'uuid'
import type { BodyWeightEntry, DayType, StreakState, WorkoutRow, WorkoutSession } from '../types'
import { storage, type QueuedWrite, type Settings } from '../services/storage'
import { api } from '../services/api'
import { sessionToRows } from '../lib/session'
import { computeStreaks, isStreakAtRisk } from '../lib/streaks'
import { toISODate } from '../lib/dates'
import { QUICK_LOG_KEY, type Plan } from '../config/plan'
import type { FlexEntry } from '../lib/flex'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error'

type DataContextValue = {
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  flexEntries: FlexEntry[]
  settings: Settings
  plan: Plan
  sync: SyncState
  pendingWrites: number
  streaks: StreakState
  atRisk: boolean
  saveSession: (s: WorkoutSession) => Promise<void>
  logBodyWeight: (weightLbs: number, date?: string) => Promise<void>
  logFlex: (angleDeg: number | null, note?: string) => Promise<void>
  quickLog: (dayType: DayType) => Promise<void>
  logProgressPhoto: () => void
  importData: (rows: WorkoutRow[], bodyWeights: BodyWeightEntry[]) => Promise<void>
  updateSettings: (s: Settings) => void
  updatePlan: (p: Plan) => void
  refresh: () => Promise<void>
}

const Ctx = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [workouts, setWorkouts] = useState<WorkoutRow[]>(() => storage.loadWorkouts())
  const [bodyWeights, setBodyWeights] = useState<BodyWeightEntry[]>(() => storage.loadBodyWeights())
  const [flexEntries, setFlexEntries] = useState<FlexEntry[]>(() => storage.loadFlex())
  const [settings, setSettings] = useState<Settings>(() => storage.loadSettings())
  const [plan, setPlan] = useState<Plan>(() => storage.loadPlan())
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
      if (Array.isArray(f)) persistFlex(f)
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
  }, [flush, persistWorkouts, persistWeights, persistFlex])

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
      persistFlex([...storage.loadFlex(), entry])
      try {
        await api.postFlex(entry)
      } catch {
        enqueue({ type: 'flex', entry })
      }
    },
    [enqueue, persistFlex],
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

  const streaks = useMemo(() => computeStreaks(workouts), [workouts])
  const atRisk = useMemo(() => isStreakAtRisk(workouts), [workouts])

  const value: DataContextValue = {
    workouts,
    bodyWeights,
    flexEntries,
    settings,
    plan,
    sync,
    pendingWrites: queue.length,
    streaks,
    atRisk,
    saveSession,
    logBodyWeight,
    logFlex,
    quickLog,
    logProgressPhoto,
    importData,
    updateSettings,
    updatePlan,
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
