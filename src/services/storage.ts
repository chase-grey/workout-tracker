import type { ControlUses, LabelMode } from '../lib/controlLabels'
import { v4 as uuid } from 'uuid'
import type { BodyWeightEntry, WorkoutRow, WorkoutSession } from '../types'
import { DEFAULT_PLAN, PLAN_REVISION, withPlanDefaults, type Plan } from '../config/plan'
import { DEFAULT_FLEX_ROUTINE, type FlexBlock } from '../config/flexPlan'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../config/flexRoutines'
import type { FlexEntry } from '../lib/flex'
import type { CalorieEntry } from '../lib/calories'
import type { MeasurementEntry } from '../lib/bodyComp'
import type { LockedProjections } from '../lib/goalLock'
import type { ProviderId } from '../lib/aiProvider'
import type { TrackedIssue } from './issues'
import { normalizeQueue, type QueuedWrite } from '../lib/outbox'
import { withMatSitups } from '../lib/stretchCore'
import { withRenamedKeys } from '../lib/renamedKeys'
import type { RestTally } from '../lib/rest'
import type { SetClock } from '../lib/setClock'
import { normalizeExerciseAverages, type ExerciseAverages, type SessionDuration } from '../lib/estimate'
import { toFastMode, type FastMode } from '../lib/fastMode'
import type { SkippedExercises } from '../lib/skipped'
import type { Profile } from '../lib/profile'
import type { CardioPin, HomeLayout } from '../lib/homeTiles'
import type { CardLayout } from '../lib/cardLayout'
import type { Macro } from '../lib/calories'
import type { MetricKey } from '../lib/weekPace'
import type { CardioEntry } from '../lib/cardio'
import type { CalendarPins, WeekCalendarView, WeekPins } from '../lib/weekCalendar'
import type { CardioPlan } from '../lib/cardioPlan'

const KEYS = {
  settings: 'wt.settings',
  activeSession: 'wt.activeSession',
  cacheWorkouts: 'wt.cache.workouts',
  cacheBodyWeight: 'wt.cache.bodyweight',
  cacheFlex: 'wt.cache.flex',
  cacheCalories: 'wt.cache.calories',
  cacheMeasurements: 'wt.cache.measurements',
  cacheDurations: 'wt.cache.durations',
  cacheCardio: 'wt.cache.cardio',
  joinClaim: 'wt.joinClaim',
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
  // The single side-splits routine, from before there were two. Still read (it's
  // where a customised routine lives on a device that's never run this build) and
  // deliberately never deleted — a rollback shouldn't lose an edited routine.
  flexPlan: 'wt.flexplan',
  flexPlans: 'wt.flexplans',
  activeStep: 'wt.activeStep',
  activeStepKey: 'wt.activeStepKey',
  activeRest: 'wt.activeRest',
  activeRestTally: 'wt.activeRestTally',
  activeExerciseTimes: 'wt.activeExerciseTimes',
  activeSetClock: 'wt.activeSetClock',
  activeFastForward: 'wt.activeFastForward',
  activeSkipped: 'wt.activeSkipped',
  stretch: 'wt.stretch',
  lastSync: 'wt.lastSync',
  backendVersion: 'wt.backendVersion',
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

export type ActiveExerciseTimes = {
  sessionId: string
  samples: Record<string, import('../lib/estimate').ExerciseTimeSample[]>
}

/** In-progress stretch session UI state (so it survives an app switch/reload). */
export type StretchState = {
  timingSamples?: Record<string, import('../lib/estimate').ExerciseTimeSample>
  restLearning?: { totalSec: number; prescribedSec: number; count: number }
  /** What each set has actually taken, its rest included (see lib/setClock). */
  setClock?: SetClock
  /** A standalone office ab session, sharing the guided set flow. */
  officeAbs?: boolean
  startSide?: 'left' | 'right'
  step: number
  done: string[]
  /** Whether the user has confirmed the exercise preview, including after photos. */
  started?: boolean
  startedAt?: string
  /**
   * Which routine is in progress. Absent on a session started before this
   * shipped, which was necessarily a side split.
   */
  routine?: FlexRoutineKey
  /**
   * Whether this session includes the core block, decided at start and pinned
   * here for the same reason WorkoutSession.variant is: a session resumed after
   * another one logged core has to keep the shape it began with, or the checklist
   * and the step count would change under you mid-routine.
   */
  core?: boolean
  /** Reps entered per core set, keyed by 0-based set index. */
  coreReps?: Record<number, number>
  /**
   * Weight (lbs) entered per core set, keyed the same way. A key present with
   * null is a set deliberately left unloaded, which is why it's stored rather
   * than falling back to the prescribed weight the way a missing key does.
   */
  coreWeights?: Record<number, number | null>
  /** Seconds each open hold ran before it was ended, by step key (see FlexExercise.openHold). */
  heldSecs?: Record<string, number>
  /** Rep the current stretch set's rhythm guide had reached (1-based). */
  rep?: number
  /** Exercise keys omitted from this run of the routine. */
  skipped?: string[]
  /** Step keys of single sets omitted from this run (see lib/skipped). */
  skippedSteps?: string[]
  /** The rest countdown that was on screen, if any. */
  rest?: RestState | null
  /**
   * Seconds banked on the rest screen so far. Persisted for the same reason
   * `startedAt` is: the routine's total length spans a reload, so a rest tally
   * that restarted at zero would leave that rest counted as stretching.
   */
  restSec?: number
  /** Ids of the photo screens already offered, so a reload doesn't re-ask. */
  photoGates?: string[]
  /**
   * Whether hands-free fast-forward was on (see components/FastForwardToggle).
   * Persisted so a reload mid-routine doesn't quietly start waiting for taps
   * again — it holds until it's switched off.
   */
  fast?: boolean
}

/**
 * The guided workout's in-progress rest: the countdown plus which exercise it
 * belongs to and whether it follows that exercise's last set (which is what makes
 * adding a set mid-rest jump to it). Kept apart from the session log, which stores
 * only sets.
 */
export type ActiveRest = RestState & {
  exKey: string
  isLastSetOfExercise: boolean
}

export type Settings = {
  apiUrl: string
  /**
   * The coach's key, for whichever service `aiProvider` names. The name is
   * from when OpenAI was the only one, and isn't worth renaming out from
   * under the devices holding it.
   */
  openAiKey: string
  /**
   * Shared token this device proves itself to the backend's issue routes with.
   * Kept on-device rather than bundled precisely because the bundle is public —
   * see backendToken in services/issues.ts, which is also why the name still
   * says "chat": it once reached the coach too, and the key is not worth
   * renaming out from under the phones holding it.
   */
  chatToken: string
  /**
   * Whether this device shows the coach tab. Off until you turn it on in
   * Settings: the coach needs a key this device holds (see openAiKey), so a
   * device without one would only ever show the tab asking for it.
   * Device-local, like the key it unlocks — see
   * lib/settingsSync.DEVICE_LOCAL_KEYS.
   */
  coachEnabled?: boolean
  /**
   * Which service the coach talks to (see lib/aiProvider). Unset means
   * Anthropic, unless an OpenAI key was saved before that default. Device-local with the key.
   */
  aiProvider?: ProviderId
  /** API root for the `custom` provider; ignored for the presets. */
  aiBaseUrl?: string
  /** Model for the coach, in whatever naming the provider uses. Unset means the provider's default. */
  openAiModel?: string
  /**
   * Set once a model has been chosen by hand, in the coach tab or in Settings.
   * Until then a stored model may only be a default that was written for you
   * (see lib/aiProvider.modelFor).
   */
  coachModelPicked?: boolean
  /**
   * Chosen at setup instead of a key: the coach is used by copying a summary of
   * your training into another AI app (see Settings), not through this one.
   * Synced with the profile; it holds no secret.
   */
  coachPaste?: boolean
  /** ISO date of the last progress photo the user logged (for reminders). */
  lastProgressPhoto?: string
  /**
   * "Never ask me for progress photos." Silences the home-page reminder and the
   * camera screens in the stretch routines. Synced like the rest; turning it back
   * on is written as an explicit false (not a deleted key) so the newer copy
   * carries a value and the merge can't resurrect the old opt-out.
   */
  photosOff?: boolean
  /** ISO date before which the progress-photo reminder stays hidden ("Later"). */
  photoSnoozeUntil?: string
  /** Self-timer length (seconds) for the camera angle-measurement flow. */
  measureTimerSec?: number
  /** Previously recorded height in inches. */
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
   * Animations marked bad from a session's kebab, as `family:variant` ids, kept
   * out of every rotation from then on (see lib/hiddenAnimations).
   */
  hiddenAnimations?: string[]
  /**
   * Reached goals folded into one line on Progress. Off by default: a goal
   * already met stays in view as a reminder of it.
   */
  reachedGoalsCollapsed?: boolean
  /** Reached goals taken off Progress one at a time, by goal id. */
  hiddenReachedGoals?: string[]
  /**
   * The cardio log's quick picks, as the person has edited them (see
   * lib/cardio.cardioKinds). Unset means the defaults; an empty list means they
   * removed every one.
   */
  cardioKinds?: string[]
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
  /**
   * Whether the pelvis stands neutral yet, called off the weekly side-on photo
   * the pelvic tilt routine takes. The angle read off that photo is shown beside
   * it, but it's the eye that settles it. Unset means not yet.
   */
  pelvicTiltStatus?: SixPackStatus
  /**
   * Who is using the app and what they asked it to track (see lib/profile).
   * Absent on the original owner's devices, which is what keeps every shipped
   * target applying to them unchanged. Synced: it's the account's, not the phone's.
   */
  profile?: Profile
  /**
   * The order of the buttons at the foot of Today, and the ones taken off it
   * (see lib/homeTiles). Unset is the default grouping.
   */
  homeLayout?: HomeLayout
  /**
   * The cards on Today and on Progress, as they've been dragged, taken off and
   * put on (see lib/cardLayout and components/EditableStack). Unset is the
   * default page.
   */
  todayLayout?: CardLayout
  progressLayout?: CardLayout
  /** The order the week's goals are listed in on the this-week card. Unset is the shipped order. */
  weekGoalOrder?: MetricKey[]
  /** The calorie buttons' amounts, signed (see lib/quickAdds). Unset is +100, +500, −100. */
  calorieAdds?: number[]
  /** The same for each macro's row of buttons, in grams. */
  macroAdds?: Partial<Record<Macro, number[]>>
  /**
   * Whether the icon-only controls wear their starter word (see
   * lib/controlLabels). Unset follows whose device it is: bare for the owner,
   * auto for everyone else.
   */
  labelMode?: LabelMode
  /** How often each labelled control has been used, capped at the point its label drops. */
  controlUses?: ControlUses
  /** When the counters were last reset from Settings, ISO; a newer reset beats older counts in the merge. */
  controlUsesResetAt?: string
  /** Cardio sessions pinned to Today as one-tap logs. */
  cardioPins?: CardioPin[]
  /** Whether Today shows the week calendar (see lib/weekCalendar). Unset is shown. */
  showWeekCalendar?: boolean
  /** How the week calendar opens: one strip of marks, or kept open at a row per day. Unset is the strip. */
  weekCalendarView?: WeekCalendarView
  /** The standing schedule: weekdays pinned to lifting, stretching or cardio, which the calendar plans first. */
  calendarPins?: CalendarPins
  /** Single weeks given days of their own, by their first day (see lib/weekCalendar WeekPins). */
  calendarWeeks?: WeekPins
  /**
   * The day a week starts on, as `Date.getDay()` numbers it (0 = Sunday).
   * Unset is Monday. The account's: a week should not end on different days on
   * two phones. See lib/dates.
   */
  weekStartDay?: number
  /**
   * Whether the schedule is kept in step with a Google calendar (see
   * lib/calendarSync). The account's, not the phone's: the link to Google is
   * held by the backend, so any device signed in can run the sync.
   */
  gcalSync?: boolean
  /**
   * Guide mode: labels and explanations the app otherwise leaves out, and the
   * first-run tour (see lib/tour). On for accounts the welcome flow makes,
   * unset (off) for everyone who was here before it. Synced with the account.
   */
  guideMode?: boolean
  /** The tour steps already shown, by id, so each is shown once. */
  tourSeen?: string[]
  /** The tour is over, finished or skipped, and doesn't come back unprompted. */
  tourDone?: boolean
  /**
   * The cardio goal and the week-by-week plan toward it (see lib/cardioPlan).
   * Synced with the rest. Ending a plan keeps it here with `endedAt` set rather
   * than deleting it: a cleared field doesn't carry to the other devices (see
   * lib/settingsSync.mergeSettings), and the weeks it planned still score the
   * streak they were lived under.
   */
  cardioPlan?: CardioPlan
  /**
   * How this device stores its data (see lib/account). Device-local with the
   * token: the mode says how THIS phone reaches the backend, and a second phone
   * signs in for itself.
   */
  accountMode?: AccountMode
  /** The key this device proves its account to the hosted backend with. */
  accountToken?: string
  /** The name the account was created under, for the Settings card. */
  accountName?: string
  /**
   * Whether the signed-in account is the owner's, as the backend last said.
   * Unset until asked; see lib/accountProfile for the one thing that asks.
   */
  accountOwner?: boolean
}

/**
 * `legacy` is a device from before accounts: it talks to the backend with no
 * key and is the owner there. `hosted` holds an account key. `local` keeps
 * everything on the phone and never touches the network.
 */
export type AccountMode = 'legacy' | 'hosted' | 'local'

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

  // Re-keyed on the way out, not on the way in: the cache can hold rows written by
  // a build that predates the mat sit-up's own key (see lib/stretchCore).
  loadWorkouts: (): WorkoutRow[] => withRenamedKeys(withMatSitups(read(KEYS.cacheWorkouts, []))),
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

  /**
   * This device's id for its attempt at an invite code: minted once per code
   * and kept, so a retry (after a timeout, a reload, a second tap) is
   * recognised by the backend as the same join rather than a second one.
   */
  joinClaim: (code: string): string => {
    const key = `${KEYS.joinClaim}.${code.trim().toUpperCase()}`
    const held = read<string | null>(key, null)
    if (held) return held
    const claim = uuid()
    write(key, claim)
    return claim
  },

  loadCardio: (): CardioEntry[] => read(KEYS.cacheCardio, []),
  saveCardio: (entries: CardioEntry[]) => write(KEYS.cacheCardio, entries),
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
  /** The backend version last seen at ?route=version, so the banner needn't wait for a fetch. */
  loadBackendVersion: (): number | null => read(KEYS.backendVersion, null),
  saveBackendVersion: (v: number) => write(KEYS.backendVersion, v),

  loadQueue: (): QueuedWrite[] => normalizeQueue(read<unknown>(KEYS.queue, []), uuid),
  /**
   * Read-modify-write the outbox against what is on disk *now*, returning the
   * stored result. Every queue change straddles a network round-trip, and a
   * snapshot taken before one is stale by the time it's written back — it would
   * erase whatever was logged while the request was in flight.
   */
  updateQueue: (fn: (q: QueuedWrite[]) => QueuedWrite[]): QueuedWrite[] => {
    const next = fn(normalizeQueue(read<unknown>(KEYS.queue, []), uuid))
    // An outbox must never claim durability when storage is full or unavailable.
    localStorage.setItem(KEYS.queue, JSON.stringify(next))
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

  /**
   * The blocks of every routine, keyed by routine.
   *
   * Migrated on read rather than in a one-shot upgrade step: with nothing stored
   * under the new key, the side split takes whatever the single-routine key holds
   * — so a customised routine survives — and head to toe takes the shipped
   * default. A routine missing from a stored map (one added in a later build)
   * falls back the same way.
   */
  loadFlexPlans: (): Record<FlexRoutineKey, FlexBlock[]> => {
    const stored = read<Partial<Record<FlexRoutineKey, FlexBlock[]>>>(KEYS.flexPlans, {})
    const legacy = read<FlexBlock[]>(KEYS.flexPlan, DEFAULT_FLEX_ROUTINE)
    const out = {} as Record<FlexRoutineKey, FlexBlock[]>
    for (const key of FLEX_ROUTINE_KEYS) {
      out[key] =
        stored[key] ?? (key === 'side_split' ? legacy : FLEX_ROUTINES[key].blocks)
      if (key === 'head_to_toe' && stored[key]) {
        out[key] = out[key].map((block) => ({
          ...block,
          exercises: block.exercises.map((exercise) => exercise.key === 'calf_stretch'
            ? { ...exercise, sets: '3', maxSets: 3, reps: 1, tempo: '', holdSec: 30,
                perSide: true, restSec: 0, sideSwitchSec: 5,
                setLabels: ['foot straight', 'foot in', 'foot out'] }
            : exercise),
        }))
      }
    }
    return out
  },
  saveFlexPlans: (p: Record<FlexRoutineKey, FlexBlock[]>) => write(KEYS.flexPlans, p),

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

  /**
   * How much rest the workout in progress has banked. Read through
   * lib/rest.resumeRestTally, which drops a tally belonging to another session.
   */
  loadRestTally: (): RestTally | null => read<RestTally | null>(KEYS.activeRestTally, null),
  loadActiveExerciseTimes: (): ActiveExerciseTimes | null => read(KEYS.activeExerciseTimes, null),
  saveActiveExerciseTimes: (value: ActiveExerciseTimes | null) =>
    value ? write(KEYS.activeExerciseTimes, value) : localStorage.removeItem(KEYS.activeExerciseTimes),
  saveRestTally: (t: RestTally | null) =>
    t ? write(KEYS.activeRestTally, t) : localStorage.removeItem(KEYS.activeRestTally),
  /** What each set of the workout in progress actually took (see lib/setClock). */
  loadSetClock: (): SetClock | null => read<SetClock | null>(KEYS.activeSetClock, null),
  saveSetClock: (c: SetClock | null) =>
    c ? write(KEYS.activeSetClock, c) : localStorage.removeItem(KEYS.activeSetClock),

  /**
   * How hands-free the workout in progress is running (see lib/fastMode).
   * Persisted so a reload mid-workout doesn't quietly start waiting for taps
   * again; cleared when a workout starts or ends, because it's a choice about
   * this session rather than a saved preference. Read through `toFastMode`, which
   * also understands the bare `true` older builds stored here.
   */
  loadFastMode: (): FastMode => toFastMode(read<unknown>(KEYS.activeFastForward, null)),
  saveFastMode: (mode: FastMode) =>
    mode === 'off'
      ? localStorage.removeItem(KEYS.activeFastForward)
      : write(KEYS.activeFastForward, mode),

  /**
   * Which exercises the workout in progress has skipped. Read through
   * lib/skipped.resumeSkipped, which drops skips belonging to another session.
   */
  loadSkipped: (): SkippedExercises | null => read<SkippedExercises | null>(KEYS.activeSkipped, null),
  saveSkipped: (s: SkippedExercises | null) =>
    s && s.keys.length > 0 ? write(KEYS.activeSkipped, s) : localStorage.removeItem(KEYS.activeSkipped),

  loadStretch: (): StretchState | null => read(KEYS.stretch, null),
  saveStretch: (s: StretchState | null) =>
    s ? write(KEYS.stretch, s) : localStorage.removeItem(KEYS.stretch),
}
