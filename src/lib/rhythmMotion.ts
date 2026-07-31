import type { TempoPhase } from './tempo'

/**
 * Which family of rhythm animation suits a stretch, inferred from its tempo:
 * - 'breathe': a shape that expands then contracts — suits reps that descend
 *   and return (e.g. Tailor's Pose: down · hold · up).
 * - 'descent': a shape that folds/reaches downward and settles deep without
 *   springing back — suits push-and-hold stretches (e.g. Pancake Hang: push
 *   down · passive hang), where "breathing back up" would misrepresent the
 *   hold. The rep resets to the top only when the next rep begins.
 */
export type MotionKind = 'breathe' | 'descent'

// Words that move you deeper into a stretch vs. words that bring you back up.
// Holds/hangs match neither — they keep whatever depth the last phase reached.
const DESCEND = /\b(down|push|lower|descend|fold|reach|sink|contract)\b/
const RISE = /\b(up|rise|return|out|expand|extend|open|lift)\b/
const HOLD = /\b(hold|pause|bottom|top|stay|hang|release|deepen|settle)\b/

/**
 * Pick the animation family for a set of tempo phases. A stretch that pushes or
 * folds downward and never rises back (it ends in a hold/hang) reads as a
 * descent; anything with a return phase reads as a breath. Defaults to breathe
 * for shapeless tempos, since the breathing family is the general-purpose one.
 */
export function motionForPhases(phases: TempoPhase[]): MotionKind {
  const labels = phases.map((p) => p.label.toLowerCase())
  const hasDescend = labels.some((l) => DESCEND.test(l))
  const hasRise = labels.some((l) => RISE.test(l))
  return hasDescend && !hasRise ? 'descent' : 'breathe'
}

/**
 * Depth target (0 = neutral/top, 1 = deepest into the stretch) for each phase,
 * inferred from its label. Descend words sink to 1, rise words return to 0, and
 * holds/hangs keep the current depth — so a passive hang stays deep rather than
 * drifting back up. Both animation families read from this one signal.
 */
export function phaseDepths(phases: TempoPhase[]): number[] {
  let cur = 0
  return phases.map((p) => {
    const l = p.label.toLowerCase()
    if (DESCEND.test(l)) cur = 1
    else if (RISE.test(l)) cur = 0
    else if (HOLD.test(l)) {
      /* keep current depth */
    } else cur = cur === 0 ? 1 : 0 // unlabelled phases just alternate
    return cur
  })
}
