/** Parse a tempo string like "2s down · 3s hold at bottom · 1s up" into phases. */
export type TempoPhase = { seconds: number; label: string }

/** End a final rep after its last effort, leaving trailing rest to the set break. */
export function workPhaseCount(phases: TempoPhase[]): number {
  let count = phases.length
  while (count > 0 && /^rest$/i.test(phases[count - 1].label)) count--
  return count || phases.length
}

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
