import type { BodyWeightEntry, WorkoutRow, WorkoutSession } from '../types'
import { DEFAULT_PLAN, type Plan } from '../config/plan'
import type { FlexEntry } from '../lib/flex'

const KEYS = {
  settings: 'wt.settings',
  activeSession: 'wt.activeSession',
  cacheWorkouts: 'wt.cache.workouts',
  cacheBodyWeight: 'wt.cache.bodyweight',
  cacheFlex: 'wt.cache.flex',
  queue: 'wt.queue',
  plan: 'wt.plan',
} as const

export type Settings = {
  apiUrl: string
  openAiKey: string
  /** ISO date of the last progress photo the user logged (for reminders). */
  lastProgressPhoto?: string
}

const DEFAULT_SETTINGS: Settings = { apiUrl: '', openAiKey: '' }

/** A write that failed to reach the backend and is waiting to be flushed. */
export type QueuedWrite =
  | { type: 'session'; rows: WorkoutRow[] }
  | { type: 'bodyweight'; entry: BodyWeightEntry }
  | { type: 'flex'; entry: FlexEntry }
  | { type: 'plan'; plan: Plan }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export const storage = {
  loadSettings: (): Settings => ({ ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) }),
  saveSettings: (s: Settings) => write(KEYS.settings, s),

  loadActiveSession: (): WorkoutSession | null => read(KEYS.activeSession, null),
  saveActiveSession: (s: WorkoutSession | null) =>
    s ? write(KEYS.activeSession, s) : localStorage.removeItem(KEYS.activeSession),

  loadWorkouts: (): WorkoutRow[] => read(KEYS.cacheWorkouts, []),
  saveWorkouts: (rows: WorkoutRow[]) => write(KEYS.cacheWorkouts, rows),

  loadBodyWeights: (): BodyWeightEntry[] => read(KEYS.cacheBodyWeight, []),
  saveBodyWeights: (entries: BodyWeightEntry[]) => write(KEYS.cacheBodyWeight, entries),

  loadFlex: (): FlexEntry[] => read(KEYS.cacheFlex, []),
  saveFlex: (entries: FlexEntry[]) => write(KEYS.cacheFlex, entries),

  loadQueue: (): QueuedWrite[] => read(KEYS.queue, []),
  saveQueue: (q: QueuedWrite[]) => write(KEYS.queue, q),

  loadPlan: (): Plan => read(KEYS.plan, DEFAULT_PLAN),
  savePlan: (p: Plan) => write(KEYS.plan, p),
}
