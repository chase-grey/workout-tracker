import type { BodyWeightEntry, WorkoutRow, WorkoutSession } from '../types'
import { DEFAULT_PLAN, type Plan } from '../config/plan'
import { DEFAULT_FLEX_ROUTINE, type FlexBlock } from '../config/flexPlan'
import type { FlexEntry } from '../lib/flex'
import type { CalorieEntry } from '../lib/calories'

const KEYS = {
  settings: 'wt.settings',
  activeSession: 'wt.activeSession',
  cacheWorkouts: 'wt.cache.workouts',
  cacheBodyWeight: 'wt.cache.bodyweight',
  cacheFlex: 'wt.cache.flex',
  cacheCalories: 'wt.cache.calories',
  queue: 'wt.queue',
  plan: 'wt.plan',
  flexPlan: 'wt.flexplan',
  activeStep: 'wt.activeStep',
  stretch: 'wt.stretch',
  lastSync: 'wt.lastSync',
} as const

/** In-progress stretch session UI state (so it survives an app switch/reload). */
export type StretchState = { step: number; done: string[] }

export type Settings = {
  apiUrl: string
  openAiKey: string
  /** OpenAI model for the chat assistant. */
  openAiModel?: string
  /** ISO date of the last progress photo the user logged (for reminders). */
  lastProgressPhoto?: string
  /** ISO date before which the progress-photo reminder stays hidden ("Later"). */
  photoSnoozeUntil?: string
  /** Self-timer length (seconds) for the camera angle-measurement flow. */
  measureTimerSec?: number
}

const DEFAULT_SETTINGS: Settings = { apiUrl: '', openAiKey: '', openAiModel: 'gpt-4o-mini' }

/** A write that failed to reach the backend and is waiting to be flushed. */
export type QueuedWrite =
  | { type: 'session'; rows: WorkoutRow[] }
  | { type: 'bodyweight'; entry: BodyWeightEntry }
  | { type: 'flex'; entry: FlexEntry }
  | { type: 'calorie'; entry: CalorieEntry }
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

  loadCalories: (): CalorieEntry[] => read(KEYS.cacheCalories, []),
  saveCalories: (entries: CalorieEntry[]) => write(KEYS.cacheCalories, entries),

  loadLastSync: (): string | null => read(KEYS.lastSync, null),
  saveLastSync: (iso: string) => write(KEYS.lastSync, iso),

  loadQueue: (): QueuedWrite[] => read(KEYS.queue, []),
  saveQueue: (q: QueuedWrite[]) => write(KEYS.queue, q),

  loadPlan: (): Plan => read(KEYS.plan, DEFAULT_PLAN),
  savePlan: (p: Plan) => write(KEYS.plan, p),

  loadFlexPlan: (): FlexBlock[] => read(KEYS.flexPlan, DEFAULT_FLEX_ROUTINE),
  saveFlexPlan: (r: FlexBlock[]) => write(KEYS.flexPlan, r),

  loadActiveStep: (): number => read(KEYS.activeStep, 0),
  saveActiveStep: (n: number) => write(KEYS.activeStep, n),

  loadStretch: (): StretchState | null => read(KEYS.stretch, null),
  saveStretch: (s: StretchState | null) =>
    s ? write(KEYS.stretch, s) : localStorage.removeItem(KEYS.stretch),
}
