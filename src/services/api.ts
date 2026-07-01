import type { BodyWeightEntry, WorkoutRow } from '../types'
import { storage } from './storage'

/**
 * Thin client for the Google Apps Script web app that proxies the Sheet.
 *
 * POSTs use `text/plain` on purpose: it's a CORS "simple request", so the
 * browser skips the preflight OPTIONS that Apps Script can't answer cleanly.
 * The backend parses the raw body as JSON.
 */

function baseUrl(): string {
  // Prefer a user-configured URL (Settings) over the build-time env value.
  return (storage.loadSettings().apiUrl || import.meta.env.VITE_API_URL || '').trim()
}

export function isConfigured(): boolean {
  return baseUrl().length > 0
}

async function get<T>(route: string, params: Record<string, string> = {}): Promise<T> {
  const base = baseUrl()
  if (!base) throw new Error('API not configured')
  const url = new URL(base)
  url.searchParams.set('route', route)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`GET ${route} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function post<T>(route: string, body: unknown): Promise<T> {
  const base = baseUrl()
  if (!base) throw new Error('API not configured')
  const url = new URL(base)
  url.searchParams.set('route', route)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${route} failed: ${res.status}`)
  return res.json() as Promise<T>
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
}
