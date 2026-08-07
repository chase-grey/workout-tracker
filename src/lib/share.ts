/**
 * The public URL that opens this dev server on a phone.
 *
 * Served by the `share-link` plugin in vite.config.ts, which detects a running
 * Cloudflare quick tunnel (`npm run dev:tunnel`). Only meaningful in dev — the
 * deployed GitHub Pages build has no dev server to ask, and no tunnel to name.
 */

export type ShareLink = { url: string; verified: boolean }

export async function fetchShareUrl(): Promise<ShareLink | null> {
  if (!import.meta.env.DEV) return null
  try {
    const res = await fetch('/api/share')
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string | null; verified?: boolean }
    return data.url ? { url: data.url, verified: data.verified !== false } : null
  } catch {
    return null
  }
}
