import { v4 as uuid } from 'uuid'
import type { BodyWeightEntry, WorkoutRow, WorkoutSession } from '../types'
import { DEFAULT_PLAN, PLAN_REVISION, withPlanDefaults, type Plan } from '../config/plan'
import { DEFAULT_FLEX_ROUTINE, type FlexBlock } from '../config/flexPlan'
import type { FlexEntry } from '../lib/flex'
import type { CalorieEntry } from '../lib/calories'
import type { MeasurementEntry } from '../lib/bodyComp'
import type { LockedProjections } from '../lib/goalLock'
import type { TrackedIssue } from './issues'
import { normalizeQueue, type QueuedWrite } from '../lib/outbox'
import { normalizeExerciseAverages, type ExerciseAverages, type SessionDuration } from '../lib/estimate'

const KEYS = {
  settings: 'wt.settings',
  activeSession: 'wt.activeSession',
  cacheWorkouts: 'wt.cache.workouts',
  cacheBodyWeight: 'wt.cache.bodyweight',
  cacheFlex: 'wt.cache.flex',
  cacheCalories: 'wt.cache.calories',
  cacheMeasurements: 'wt.cache.measurements',
  cacheDurations: 'wt.cache.durations',
  cacheIssues: 'wt.cache.issues',
  // v2 dropped the pooled rest average (seconds) for a prescribed-rest ratio.
  // A fresh key rather than a migration: the v1 number is a duration, and there
  // is no way to recover what it was a fraction of, so it has to be re-learned.
  cacheExerciseAverages: 'wt.cache.exerciseAverages.v2',
  // Set once the calorie cache has taken a server-wins fetch. Caches written
  // while the sheet still held a row per tap store those rows summed — 8/3/2026
  // read as 35,000 calories — and local-wins would preserve the inflated total
  // for good. A flag rather than a fresh cache key: dropping the cache outright
  // would let a tap made before the first sync restart the day from zero.
  caloriesRepaired: 'wt.cache.caloriesRepaired',
  queue: 'wt.queue',
  plan: 'wt.plan',
  planRevision: 'wt.planRevision',
  flexPlan: 'wt.flexplan',
  activeStep: 'wt.activeStep',
  activeStepKey: 'wt.activeStepKey',
  activeRest: 'wt.activeRest',
  stretch: 'wt.stretch',
  lastSync: 'wt.lastSync',
} as const

/**
 * A rest countdown in progress. Stored as the wall-clock time it ends (not the
 * seconds left) so a reload resumes the real remaining time rather than
 * restarting the countdown. `seconds` is the rest's nominal length, which the
 * timer's progress ring drains against.
 */
export type RestState = {
  seconds: number
  endsAt: number
}

/** In-progress stretch session UI state (so it survives an app switch/reload). */
export type StretchState = {
  step: number
  done: string[]
  startedAt?: string
  /** Reps entered per dead-bug core set, keyed by 0-based set index. */
  coreReps?: Record<number, number>
  /** Rep the current stretch set's rhythm guide had reached (1-based). */
  rep?: number
  /** The rest countdown that was on screen, if any. */
  rest?: RestState | null
  /** Ids of the photo screens already offered, so a reload doesn't re-ask. */
  photoGates?: string[]
}

/**
 * The guided workout's in-progress rest: the countdown plus the context its
 * screen shows ("up next", the add-a-set affordance on an exercise's last rest).
 * Kept apart from the session log, which stores only sets.
 */
export type ActiveRest = RestState & {
  exKey: string
  isLastSetOfExercise: boolean
  upNext: string | null
}

export type Settings = {
  apiUrl: string
  openAiKey: string
  /**
   * Shared token that reaches the chat coach running on the laptop. Kept
   * on-device rather than bundled precisely because the bundle is public — see
   * services/chatEndpoint.ts. Blank means chat falls back to a direct OpenAI key.
   */
  chatToken: string
  /** OpenAI model for the chat assistant. */
  openAiModel?: string
  /** ISO date of the last progress photo the user logged (for reminders). */
  lastProgressPhoto?: string
  /** ISO date before which the progress-photo reminder stays hidden ("Later"). */
  photoSnoozeUntil?: string
  /** Self-timer length (seconds) for the camera angle-measurement flow. */
  measureTimerSec?: number
  /** Height in inches — fixed input for the Navy body-fat estimate. */
  heightIn?: number
  /** True once the first-run setup (height prompt) has been completed or skipped. */
  setupComplete?: boolean
  /** `YYYY-MM` of the month whose recap has already been shown (month-in-review). */
  lastReviewedMonth?: string
  /** `YYYY` of the year whose recap has already been shown (year-in-review). */
  lastReviewedYear?: string
  /**
   * Goal projections frozen once their ETA came within six months, keyed by goal
   * id (see lib/goalLock). Synced to the backend with the rest of these, and
   * merged per goal on the way back — see lib/settingsSync for why a commitment
   * can't be left on-device and can't be last-write-wins either.
   */
  lockedGoals?: LockedProjections
  /**
   * When these settings were last written on some device, ISO. The stamp the
   * merge orders the two copies by (see lib/settingsSync.mergeSettings); absent
   * means this device has never synced settings, which is what tells a fresh
   * install to take the account's committed goals wholesale.
   */
  updatedAt?: string
  /**
   * Whether the abs are visible yet, as judged in the mirror rather than
   * projected off a body-fat estimate. Drives the six-pack goal row and the
   * avatar's ab lines. Unset means not yet.
   */
  sixPackStatus?: SixPackStatus
}

/** The three answers the six-pack goal accepts. */
export type SixPackStatus = 'none' | 'close' | 'have'

const DEFAULT_SETTINGS: Settings = {
  apiUrl: '',
  openAiKey: '',
  chatToken: '',
  openAiModel: 'gpt-4o-mini',
}

export type { QueuedWrite }

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

  caloriesRepaired: (): boolean => read(KEYS.caloriesRepaired, false),
  markCaloriesRepaired: () => write(KEYS.caloriesRepaired, true),

  loadMeasurements: (): MeasurementEntry[] => read(KEYS.cacheMeasurements, []),
  saveMeasurements: (entries: MeasurementEntry[]) => write(KEYS.cacheMeasurements, entries),

  loadDurations: (): SessionDuration[] => read(KEYS.cacheDurations, []),
  saveDurations: (entries: SessionDuration[]) => write(KEYS.cacheDurations, entries),

  // null (not []) when nothing has ever been fetched, so Settings can tell an
  // empty tracker apart from a cold cache it should show a spinner for.
  loadIssues: (): TrackedIssue[] | null => read<TrackedIssue[] | null>(KEYS.cacheIssues, null),
  saveIssues: (issues: TrackedIssue[]) => write(KEYS.cacheIssues, issues),

  loadExerciseAverages: (): ExerciseAverages =>
    normalizeExerciseAverages(read<unknown>(KEYS.cacheExerciseAverages, null)),
  saveExerciseAverages: (a: ExerciseAverages) => write(KEYS.cacheExerciseAverages, a),

  loadLastSync: (): string | null => read(KEYS.lastSync, null),
  saveLastSync: (iso: string) => write(KEYS.lastSync, iso),

  loadQueue: (): QueuedWrite[] => normalizeQueue(read<unknown>(KEYS.queue, []), uuid),
  /**
   * Read-modify-write the outbox against what is on disk *now*, returning the
   * stored result. Every queue change straddles a network round-trip, and a
   * snapshot taken before one is stale by the time it's written back — it would
   * erase whatever was logged while the request was in flight.
   */
  updateQueue: (fn: (q: QueuedWrite[]) => QueuedWrite[]): QueuedWrite[] => {
    const next = fn(normalizeQueue(read<unknown>(KEYS.queue, []), uuid))
    write(KEYS.queue, next)
    return next
  },

  /**
   * The stored plan reconciled against the shipped defaults. The revision the
   * stored copy was last reconciled with rides alongside it (see PLAN_REVISION),
   * so a shipped restructure reaches a device that already saved a plan.
   */
  loadPlan: (): Plan =>
    withPlanDefaults(read<Partial<Plan>>(KEYS.plan, DEFAULT_PLAN), read<number>(KEYS.planRevision, 0)),
  // Saving a plan also marks it current: whatever the user has now is by
  // definition reconciled with the revision this build ships.
  savePlan: (p: Plan) => {
    write(KEYS.plan, p)
    write(KEYS.planRevision, PLAN_REVISION)
  },
  loadPlanRevision: (): number => read<number>(KEYS.planRevision, 0),

  loadFlexPlan: (): FlexBlock[] => read(KEYS.flexPlan, DEFAULT_FLEX_ROUTINE),
  saveFlexPlan: (r: FlexBlock[]) => write(KEYS.flexPlan, r),

  loadActiveStep: (): number => read(KEYS.activeStep, 0),
  saveActiveStep: (n: number) => write(KEYS.activeStep, n),
  /**
   * The `exerciseKey:setIndex` of the step in progress, saved alongside the bare
   * index. A shipped plan change reshapes the flattened step list (a circuit
   * interleaves it, a retired exercise shortens it), so the index alone can point
   * at a different set after an update — the key survives that.
   */
  loadActiveStepKey: (): string | null => read<string | null>(KEYS.activeStepKey, null),
  saveActiveStepKey: (k: string | null) =>
    k ? write(KEYS.activeStepKey, k) : localStorage.removeItem(KEYS.activeStepKey),

  loadActiveRest: (): ActiveRest | null => read(KEYS.activeRest, null),
  saveActiveRest: (r: ActiveRest | null) =>
    r ? write(KEYS.activeRest, r) : localStorage.removeItem(KEYS.activeRest),

  loadStretch: (): StretchState | null => read(KEYS.stretch, null),
  saveStretch: (s: StretchState | null) =>
    s ? write(KEYS.stretch, s) : localStorage.removeItem(KEYS.stretch),
}
