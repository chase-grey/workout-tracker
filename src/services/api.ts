import type { BodyWeightEntry, WorkoutRow } from '../types'
import type { Plan } from '../config/plan'
import type { FlexEntry } from '../lib/flex'
import type { CalorieEntry } from '../lib/calories'
import type { MeasurementEntry } from '../lib/bodyComp'
import type { ExerciseAverages, SessionDuration, SessionTimeSamples } from '../lib/estimate'
import type { SyncedSettings } from '../lib/settingsSync'
import type { NotesEdit } from '../lib/discomfort'
import type { IssueThread, TrackedIssue } from './issues'
import type { SaveErrorReport } from '../lib/saveErrorReport'
import { storage } from './storage'
import { DEFAULT_API_URL } from '../config/backend'
import { liveBackendVersion } from '../lib/backendVersion'
import { accountKey, mayReachBackend } from '../lib/account'
import { registerOrSignIn } from '../lib/login'
import type { CardioEntry } from '../lib/cardio'
import type { BrainShare } from '../lib/brainShare'

/**
 * Thin client for the Google Apps Script web app that proxies the Sheet.
 *
 * POSTs use `text/plain` on purpose: it's a CORS "simple request", so the
 * browser skips the preflight OPTIONS that Apps Script can't answer cleanly.
 * The backend parses the raw body as JSON.
 */

function baseUrl(): string {
  // Prefer a user-configured URL (Settings), then a build-time env value, then the default.
  return (storage.loadSettings().apiUrl || import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim()
}

/**
 * Whether this device syncs at all. An address alone isn't enough any more: the
 * default one is the owner's hosted backend, and a device that hasn't signed in
 * to it keeps its data to itself (see lib/account).
 */
export function isConfigured(): boolean {
  return baseUrl().length > 0 && mayReachBackend(storage.loadSettings())
}

/** Stamp the account key on a request, so the backend opens the right person's tabs. */
function withAccount(url: URL): URL {
  const key = accountKey(storage.loadSettings())
  if (key) url.searchParams.set('user', key)
  return url
}

/**
 * The backend's own failures, which don't come with a failing status code.
 *
 * Apps Script serves every `ContentService` response as 200 — it has no way to
 * set one — so the backend reports a bad route or a thrown error as `{ error }`
 * in the body of an otherwise perfectly successful response. Taken at face
 * value that reads as a save that worked: a route the deployed backend doesn't
 * have yet silently swallows every write to it, and nothing ever retries.
 */
function assertOk<T>(route: string, payload: T): T {
  const err = (payload as { error?: unknown } | null)?.error
  if (typeof err === 'string') throw new Error(`${route} failed: ${err}`)
  return payload
}

async function get<T>(route: string, params: Record<string, string> = {}): Promise<T> {
  const base = baseUrl()
  if (!base) throw new Error('api not configured')
  const url = new URL(base)
  url.searchParams.set('route', route)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  if (!('user' in params)) withAccount(url)
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`GET ${route} failed: ${res.status}`)
  return assertOk(`GET ${route}`, (await res.json()) as T)
}

async function post<T>(route: string, body: unknown): Promise<T> {
  const base = baseUrl()
  if (!base) throw new Error('api not configured')
  const url = new URL(base)
  url.searchParams.set('route', route)
  if (route !== 'join' && route !== 'register' && route !== 'login' && route !== 'claim_owner') withAccount(url)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`POST ${route} failed: ${res.status}`)
  const result = assertOk(`POST ${route}`, (await res.json()) as T)
  if (route !== 'report_issue' && route !== 'answer_issue') {
    const ack = result as { saved?: number; stale?: boolean } | null
    const expected = (body as { rows?: unknown[] }).rows?.length
    // A rest-only exercise_times post (no lift timings, just the rests) is
    // counted by its exercises, so a backend that folded the rests answers
    // `saved: 0`. It throws when nothing folds, so a clean 0 here is a save.
    const restOnly = route === 'exercise_times' &&
      (body as { exercises?: unknown[] }).exercises?.length === 0 && ack?.saved === 0
    if (!restOnly && !(route === 'settings' && ack?.stale === true) &&
        !(typeof ack?.saved === 'number' && Number.isFinite(ack.saved) &&
          ack.saved > 0 && (expected === undefined || ack.saved === expected))) {
      throw new Error(`POST ${route}: backend did not confirm the complete save. Update the backend and retry.`)
    }
  }
  return result
}

/** One session as the Google calendar holds it (see lib/calendarSync RemoteEvent). */
type GcalEvent = { id: string; pillar: 'strength' | 'flexibility' | 'cardio'; date: string; title: string }

/** What signing in or making an account hands back. */
export type SignedIn = { saved: number; token: string; name: string; owner: boolean }

/** One account, as the owner sees it in Settings. */
export type Person = { name: string; email: string; createdAt: string; lastSeen: string; owner: boolean }

export const api = {
  /**
   * Google Calendar sync (see lib/calendarSync, SimpleBackend.gs "google
   * calendar sync"). The backend keeps the account's Google token and makes the
   * calls; every answer carries `saved: 1` so the write check above passes.
   */
  gcalStatus: () => post<{ available: boolean; connected: boolean }>('gcal_status', {}),
  gcalConnect: (returnUrl: string) => post<{ url: string }>('gcal_connect', { returnUrl }),
  gcalDisconnect: () => post<{ saved: number }>('gcal_disconnect', {}),
  gcalState: (from: string, to: string) =>
    post<{ connected: boolean; events: GcalEvent[]; base: string[] }>('gcal_state', { from, to }),
  gcalApply: (ops: {
    create: Omit<GcalEvent, 'id'>[]
    update: { id: string; title: string }[]
    remove: string[]
    base: string[]
  }) => post<{ connected: boolean; failed: number }>('gcal_apply', ops),
  isConfigured,
  fetchWorkouts: (since?: string) => get<WorkoutRow[]>('workouts', since ? { since } : {}),
  fetchBodyWeight: (since?: string) => get<BodyWeightEntry[]>('bodyweight', since ? { since } : {}),
  postSession: (rows: WorkoutRow[]) => post<{ saved: number }>('session', { rows }),
  postNotes: (edit: NotesEdit) => post<{ saved: number }>('notes', edit),
  postBodyWeight: (entry: BodyWeightEntry) => post<{ saved: number }>('bodyweight', entry),
  postBodyWeightBulk: (entries: BodyWeightEntry[]) =>
    post<{ saved: number }>('bodyweight', { entries }),
  postImport: (rows: WorkoutRow[]) => post<{ saved: number }>('import', { rows }),
  fetchFlex: (since?: string) => get<FlexEntry[]>('flexibility', since ? { since } : {}),
  postFlex: (entry: FlexEntry) => post<{ saved: number }>('flexibility', entry),
  fetchPlan: () => get<Plan | null>('plan'),
  postPlan: (plan: Plan) => post<{ saved: number }>('plan', { plan }),
  fetchSettings: () => get<SyncedSettings | null>('settings'),
  /** The summary my-brain reads, sent whole (see lib/brainShare). */
  postShare: (share: BrainShare) => post<{ saved: number }>('share', { share }),
  postSettings: (settings: SyncedSettings) =>
    post<{ saved: number; stale?: boolean }>('settings', { settings }),
  fetchCalories: (since?: string) => get<CalorieEntry[]>('calories', since ? { since } : {}),
  postCalorie: (entry: CalorieEntry) => post<{ saved: number }>('calories', entry),
  fetchMeasurements: (since?: string) =>
    get<MeasurementEntry[]>('measurements', since ? { since } : {}),
  postMeasurement: async (entry: MeasurementEntry) => {
    const result = await post<{ saved: number; bodyFatSupported?: boolean }>('measurements', entry)
    if (entry.bodyFatPct !== undefined && result.bodyFatSupported !== true) {
      throw new Error('Update the backend to sync body fat readings, then retry. Your reading is saved on this device.')
    }
    return result
  },
  fetchDurations: (since?: string) => get<SessionDuration[]>('durations', since ? { since } : {}),
  postDuration: (entry: SessionDuration) => post<{ saved: number }>('durations', entry),
  fetchExerciseTimes: () => get<ExerciseAverages>('exercise_times'),
  postExerciseTimes: (samples: SessionTimeSamples) =>
    post<{ saved: number }>('exercise_times', samples),
  reportIssue: (body: {
    secret: string
    title: string
    body: string
    area: string
    context: string
  }) => post<{ number: number; url: string }>('report_issue', body),
  listIssues: (secret: string) => get<TrackedIssue[]>('issues', { secret }),
  issueThread: (secret: string, number: number) =>
    get<IssueThread>('issue_thread', { secret, number: String(number) }),
  answerIssue: (body: { secret: string; number: number; answer: string }) =>
    post<{ answered: number }>('answer_issue', body),
  reportSaveError: (report: SaveErrorReport) => post<{ saved: number }>('save_error', report),
  fetchCardio: (since?: string) => get<CardioEntry[]>('cardio', since ? { since } : {}),
  postCardio: (entry: CardioEntry) => post<{ saved: number }>('cardio', entry),
  deleteCardio: (id: string) => post<{ saved: number }>('cardio', { id, deleted: true }),
  postFeedback: (message: string, build: string) =>
    post<{ saved: number }>('feedback', { message, build }),
  /**
   * Spend an invite code on a new account. Goes out before this device has a
   * key or a mode, so it's the one request that doesn't wait on isConfigured.
   */
  join: (invite: string, name: string) =>
    post<{ saved: number; token: string; name: string }>('join', {
      invite,
      name,
      // The same claim on every attempt at this code from this phone, so a join
      // whose reply was lost is answered again rather than refused as spent.
      claim: storage.joinClaim(invite),
    }),
  /** Who the backend says `key` is. Throws `Unknown account` for a key it doesn't hold. */
  account: (key: string) => get<{ name: string; owner: boolean; email?: string }>('account', { user: key }),
  /**
   * Make an account from an email and a password. Like `join`, needs no key yet.
   * An email that already has an account is signed in to instead, when the
   * password is that account's (see registerOrSignIn).
   */
  register: (email: string, password: string, name: string) =>
    registerOrSignIn(
      () => post<SignedIn>('register', { email, password, name }),
      () => post<SignedIn>('login', { email, password }),
    ),
  /** Trade an email and password for the account's key. */
  login: (email: string, password: string) => post<SignedIn>('login', { email, password }),
  /**
   * Give the owner's account an email and password, by the issue token. The
   * first time makes the owner's key, and from then on the backend refuses a
   * request that carries none.
   */
  claimOwner: (secret: string, email: string, password: string) =>
    post<SignedIn>('claim_owner', { secret, email, password }),
  /** Set or change the signed-in account's email and password. */
  setLogin: (email: string, password: string) => post<{ saved: number }>('set_login', { email, password }),
  /** Everyone with an account, with when they last used the app. Owner only. */
  people: () => get<Person[]>('people'),
  /**
   * The accounts made that the owner has not kept or declined (lib/signups).
   * Owner only, and a backend from before the route answers `Unknown route`;
   * either way this throws and the caller shows nothing.
   */
  signups: () => get<unknown>('signups'),
  /** Keep a new account: its notice goes. */
  keepSignup: (id: string) => post<{ saved: number }>('signup_keep', { id }),
  /** Decline a new account: the account, its key and its data go. */
  declineSignup: (id: string) => post<{ saved: number }>('signup_decline', { id }),
  /**
   * Whether `secret` is the owner's issue token. Asks an owner-only route,
   * which sends no account key and so works on a device not yet signed in.
   */
  checkOwnerSecret: async (secret: string): Promise<void> => {
    await get<unknown>('issues', { secret })
  },
  /** Mint a one-time invite code. Owner only: gated on the issue token. */
  invite: (secret: string) => post<{ saved: number; code: string }>('invite', { secret }),
  /**
   * The deployed backend's BACKEND_VERSION: 0 for one too old to have the route
   * (it answers `{error}`, which is why this doesn't go through `get`). Throws
   * only when the backend can't be reached at all, so offline isn't "behind".
   */
  fetchBackendVersion: async (): Promise<number> => {
    const base = baseUrl()
    if (!base) throw new Error('api not configured')
    const url = new URL(base)
    url.searchParams.set('route', 'version')
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`GET version failed: ${res.status}`)
    return liveBackendVersion(await res.json())
  },
}
