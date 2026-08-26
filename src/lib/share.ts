/**
 * The address that opens this dev server on a phone.
 *
 * Served by the `share-link` plugin in vite.config.ts: this machine's LAN
 * address, which a phone on the same network loads directly. That is the whole of
 * the phone coach now — the phone runs this dev server's own build, so /api/chat
 * is same-origin and the Epic key behind it never leaves this machine.
 *
 * Which means both ends have to be on Epic private wifi, and so the phone has to
 * be an Epic-managed device. There is no public hop any more: from cell data or
 * home wifi this address answers nothing at all.
 *
 * Only meaningful in dev — the deployed GitHub Pages build has no dev server to
 * ask.
 */

export async function fetchShareUrl(): Promise<string | null> {
  if (!import.meta.env.DEV) return null
  try {
    const res = await fetch('/api/share')
    if (!res.ok) return null
    const data = (await res.json()) as { url?: string | null }
    return data.url ?? null
  } catch {
    return null
  }
}
