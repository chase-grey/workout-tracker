import type { BodyWeightEntry, WorkoutRow } from '../types'
import type { Plan } from '../config/plan'
import type { FlexEntry } from '../lib/flex'
import type { CalorieEntry } from '../lib/calories'
import type { MeasurementEntry } from '../lib/bodyComp'
import type { ExerciseAverages, SessionDuration, SessionTimeSamples } from '../lib/estimate'
import { storage } from './storage'
import { DEFAULT_API_URL } from '../config/backend'

/**
 * Thin client for the Google Apps Script web app that proxies the Sheet.
 *
 * POSTs use `text/plain` on purpose: it's a CORS "simple request", so the
 * browser skips the preflight OPTIONS that Apps Script can't answer cleanly.
 * The backend parses the raw body as JSON.
 */

// DEFAULT_API_URL is shared with vite.config.ts, which publishes to the same
// backend. A Settings value still overrides it.

function baseUrl(): string {
  // Prefer a user-configured URL (Settings), then a build-time env value, then the default.
  return (storage.loadSettings().apiUrl || import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim()
}

export function isConfigured(): boolean {
  return baseUrl().length > 0
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
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`GET ${route} failed: ${res.status}`)
  return assertOk(`GET ${route}`, (await res.json()) as T)
}

async function post<T>(route: string, body: unknown): Promise<T> {
  const base = baseUrl()
  if (!base) throw new Error('api not configured')
  const url = new URL(base)
  url.searchParams.set('route', route)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${route} failed: ${res.status}`)
  return assertOk(`POST ${route}`, (await res.json()) as T)
}

export const api = {
  isConfigured,
  fetchWorkouts: (since?: string) => get<WorkoutRow[]>('workouts', since ? { since } : {}),
  fetchBodyWeight: (since?: string) => get<BodyWeightEntry[]>('bodyweight', since ? { since } : {}),
  postSession: (rows: WorkoutRow[]) => post<{ saved: number }>('session', { rows }),
  postBodyWeight: (entry: BodyWeightEntry) => post<{ saved: number }>('bodyweight', entry),
  postBodyWeightBulk: (entries: BodyWeightEntry[]) =>
    post<{ saved: number }>('bodyweight', { entries }),
  postImport: (rows: WorkoutRow[]) => post<{ saved: number }>('import', { rows }),
  fetchFlex: (since?: string) => get<FlexEntry[]>('flexibility', since ? { since } : {}),
  postFlex: (entry: FlexEntry) => post<{ saved: number }>('flexibility', entry),
  fetchPlan: () => get<Plan | null>('plan'),
  postPlan: (plan: Plan) => post<{ saved: number }>('plan', { plan }),
  fetchCalories: (since?: string) => get<CalorieEntry[]>('calories', since ? { since } : {}),
  postCalorie: (entry: CalorieEntry) => post<{ saved: number }>('calories', entry),
  fetchMeasurements: (since?: string) =>
    get<MeasurementEntry[]>('measurements', since ? { since } : {}),
  postMeasurement: (entry: MeasurementEntry) => post<{ saved: number }>('measurements', entry),
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
}
