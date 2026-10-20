import type { AssetProbe, PoseLoadError, PoseProbe } from './pose'

/** The pose check in Settings, as one line. Kept apart so the wording is testable. */

/** Bytes as something readable — the sizes here run from 300 KB to 11 MB. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function assetProblem(a: AssetProbe): string {
  if (a.status === null) return `${a.name} didn't download (${a.note ?? 'no response'})`
  if (a.status !== 200) return `${a.name} didn't download (${a.status})`
  if (a.declared !== null && a.declared !== a.bytes) {
    return `${a.name} only partly downloaded (${fmtBytes(a.bytes)} of ${fmtBytes(a.declared)})`
  }
  return `${a.name} didn't download`
}

export function formatProbe(p: PoseProbe): string {
  const bad = p.assets.find((a) => !a.ok)
  if (bad) return assetProblem(bad)
  return p.build.ok ? 'working' : `didn't start: ${p.build.message}`
}

/** The stored last-failure line, or null when the last load was fine. */
export function formatLastError(err: PoseLoadError | null): string | null {
  if (!err) return null
  const when = new Date(err.at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `didn't load ${when}: ${err.message}`
}
