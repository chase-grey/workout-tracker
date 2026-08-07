/**
 * Finding the chat coach from an installed phone app.
 *
 * The coach lives behind whichever laptop is running `npm run dev:tunnel` — only
 * that machine holds the Epic key and can reach the internal Epic LLM host. Its
 * Cloudflare quick tunnel gets a new hostname every run, which an installed app
 * can't chase. So the laptop leaves its current address on the Apps Script
 * backend and we read it from there, letting the app stay installed from a
 * GitHub Pages URL that never changes.
 *
 * The address is only served to a caller holding the shared token (entered once
 * in Settings), because the backend URL itself is public in this bundle. See
 * getChatEndpoint in SimpleBackend.gs.
 */
import { storage } from './storage'
import { DEFAULT_API_URL } from '../config/backend'

export type ChatEndpoint = { url: string; updatedAt?: string }

// A lookup per chat message would add a round trip to every send, so hold the
// answer for a few minutes. Short enough that restarting the laptop mid-session
// recovers on its own.
const TTL_MS = 5 * 60 * 1000
let cache: { at: number; value: ChatEndpoint | null } | null = null

function backendUrl(): string {
  return (storage.loadSettings().apiUrl || import.meta.env.VITE_API_URL || DEFAULT_API_URL).trim()
}

/** The token entered in Settings, which both finds the coach and calls it. */
export function chatToken(): string {
  return storage.loadSettings().chatToken.trim()
}

/** Drop the cached address — used after the token changes, or a send fails. */
export function forgetChatEndpoint(): void {
  cache = null
}

/** The coach's current address, or null if none is published or reachable. */
export async function fetchChatEndpoint(): Promise<ChatEndpoint | null> {
  const token = chatToken()
  if (!token) return null
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value

  let value: ChatEndpoint | null = null
  try {
    const res = await fetch(
      `${backendUrl()}?route=chat_endpoint&secret=${encodeURIComponent(token)}`,
    )
    if (res.ok) {
      const data = (await res.json()) as { url?: string | null; updatedAt?: string; error?: string }
      if (data.url) value = { url: data.url, updatedAt: data.updatedAt }
    }
  } catch {
    /* offline, or the backend is unreachable — no coach right now */
  }
  cache = { at: Date.now(), value }
  return value
}
