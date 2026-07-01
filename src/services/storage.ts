import type { BodyWeightEntry, WorkoutRow, WorkoutSession } from '../types'

const KEYS = {
  settings: 'wt.settings',
  activeSession: 'wt.activeSession',
  cacheWorkouts: 'wt.cache.workouts',
  cacheBodyWeight: 'wt.cache.bodyweight',
  queue: 'wt.queue',
} as const

export type Settings = {
  apiUrl: string
  openAiKey: string // reserved for the post-MVP AI chat
}

const DEFAULT_SETTINGS: Settings = { apiUrl: '', openAiKey: '' }

/** A write that failed to reach the backend and is waiting to be flushed. */
export type QueuedWrite =
  | { type: 'session'; rows: WorkoutRow[] }
  | { type: 'bodyweight'; entry: BodyWeightEntry }

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

  loadQueue: (): QueuedWrite[] => read(KEYS.queue, []),
  saveQueue: (q: QueuedWrite[]) => write(KEYS.queue, q),
}
