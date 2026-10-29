import type { AssetProbe, PoseLoadError, PoseProbe } from './pose'

/** The pose check in Settings, as one line. Kept apart so the wording is testable. */

/** Bytes as something readable — the sizes here run from 300 KB to 11 MB. */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** How much of an error fits on the Settings line before it stops being read. */
const LINE_MAX = 120

/**
 * The part of a load error that fits on one line of Settings.
 *
 * What the detector throws is written for a console: Emscripten wraps whatever
 * it died on in `Aborted(...)` and a hint to rebuild with assertions, and a
 * MediaPipe graph error runs to paragraphs. On a phone that is a wall of text
 * under a label. The whole message is still kept, for copying; this is the
 * line that gets read.
 */
export function shortMessage(message: string): string {
  let m = message.trim().replace(/\.?\s*Build with -sASSERTIONS for more info\.?$/, '')
  const aborted = /^(?:RuntimeError:\s*)?Aborted\((.*)\)$/s.exec(m)
  if (aborted) m = aborted[1].trim()
  m = m.replace(/\s+/g, ' ')
  if (m.length > LINE_MAX) m = `${m.slice(0, LINE_MAX - 1).trimEnd()}…`
  return m
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
  return p.build.ok ? 'working' : `didn't start: ${shortMessage(p.build.message ?? '')}`
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
  return `didn't load ${when}: ${shortMessage(err.message)}`
}

/**
 * Everything known about the failure, for copying off the phone: a probe file
 * by file with the build error whole, or else the stored error whole. The one
 * way to get the real text to someone who can read it, until the backend has
 * it. Null when there is nothing wrong to copy.
 */
export function formatDetail(probe: PoseProbe | null, err: PoseLoadError | null): string | null {
  if (probe) {
    if (probe.build.ok && probe.assets.every((a) => a.ok)) return null
    const files = probe.assets.map((a) => {
      const got = a.status ?? a.note ?? 'no response'
      const size =
        a.declared !== null && a.declared !== a.bytes
          ? `${fmtBytes(a.bytes)} of ${fmtBytes(a.declared)}`
          : fmtBytes(a.bytes)
      return `${a.name}: ${got}, ${size}`
    })
    const build = probe.build.ok
      ? 'build: ok'
      : `build failed at ${probe.build.stage ?? 'model'}: ${probe.build.message ?? ''}`
    return [...files, build].join('\n')
  }
  if (err) return `${err.stage} ${err.at}\n${err.message}`
  return null
}
