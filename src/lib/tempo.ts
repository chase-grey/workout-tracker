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

/**
 * Target scale (0.55–1) for a breathing/rhythm orb per phase, inferred from the
 * phase label so the shape shrinks as you descend, holds, and grows on the way up.
 */
export function phaseScales(phases: TempoPhase[]): number[] {
  const MIN = 0.55
  const MAX = 1
  let cur = MAX
  return phases.map((p) => {
    const l = p.label.toLowerCase()
    if (/\b(down|push|lower|descend|in|contract)\b/.test(l)) cur = MIN
    // "hang"/"release" is the passive ease-off phase — grow back toward the top
    // so a two-phase push/hang stretch (e.g. the pancake) visibly breathes.
    else if (/\b(up|rise|return|release|out|expand|extend|hang)\b/.test(l)) cur = MAX
    else if (/\b(hold|pause|bottom|top|stay)\b/.test(l)) {
      /* keep current */
    } else cur = cur === MAX ? MIN : MAX
    return cur
  })
}
