/** Parse a tempo string like "2s down · 3s hold at bottom · 1s up" into phases. */
export type TempoPhase = { seconds: number; label: string }

export function parseTempo(tempo: string): TempoPhase[] {
  if (!tempo) return []
  return tempo
    .split(/[·,;]/)
    .map((seg) => {
      const m = seg.trim().match(/^(\d+(?:\.\d+)?)\s*s\b\s*(.*)$/i)
      if (!m) return null
      const label = m[2].trim() || `${m[1]}s`
      return { seconds: Number(m[1]), label }
    })
    .filter((p): p is TempoPhase => p !== null && p.seconds > 0)
}
