import type { AssetProbe, PoseLoadError, PoseProbe } from './pose'

/**
 * Turn a pose-detector probe into lines to read on a phone.
 *
 * Kept apart from the probe itself so the wording is testable without a browser,
 * and short enough to read at arm's length in a gym: one line per file, then the
 * cache, then whether the detector actually built.
 */

/** Bytes as something readable — the sizes here run from 300 KB to 11 MB. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function assetLine(a: AssetProbe): string {
  if (a.status === null) return `${a.name} · no response · ${a.note ?? 'failed'}`
  const size = fmtBytes(a.bytes)
  if (a.status !== 200) return `${a.name} · ${a.status} · ${size}`
  if (a.declared !== null && a.declared !== a.bytes) {
    return `${a.name} · 200 · short: ${size} of ${fmtBytes(a.declared)}`
  }
  return `${a.name} · 200 · ${size}`
}

export function formatProbe(p: PoseProbe): string[] {
  return [
    ...p.assets.map(assetLine),
    p.cached.length ? `cached: ${p.cached.join(', ')}` : 'cached: nothing',
    p.build.ok ? 'detector: built' : `detector: failed at ${p.build.stage} — ${p.build.message}`,
  ]
}

/** The stored last-failure line, or null when the last load was fine. */
export function formatLastError(err: PoseLoadError | null): string | null {
  if (!err) return null
  const when = err.at.slice(0, 16).replace('T', ' ')
  const tries = err.attempts > 1 ? ` after ${err.attempts} tries` : ''
  return `${when} · failed at ${err.stage}${tries} — ${err.message}`
}
