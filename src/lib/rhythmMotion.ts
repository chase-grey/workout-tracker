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

/**
 * How far (0–1) through a whole rep we are, given the phase we're in and how far
 * through that phase. Phases are weighted by their duration, so this advances at
 * a steady rate across the rep rather than jumping at each phase boundary.
 */
export function cycleProgress(phases: TempoPhase[], idx: number, progress: number): number {
  const total = phases.reduce((sum, p) => sum + p.seconds, 0)
  if (total <= 0) return 0
  let before = 0
  for (let i = 0; i < idx && i < phases.length; i++) before += phases[i].seconds
  return (before + phases[idx].seconds * progress) / total
}

/**
 * Whether a set's rep target has been met, given the rep currently in progress.
 * The counter names the rep you're working on, so reading "rep 5 / 5" means the
 * last rep has only just *started* — the target isn't met until that rep is
 * finished and the count moves past it. Counting continues beyond the target,
 * so anything past it stays met.
 */
export function hitRepTarget(rep: number, reps?: number): boolean {
  return reps != null && reps > 0 && rep > reps
}

/** Seconds spent dissolving the finished rep into the new one at the loop point. */
export const LOOP_FADE_SECONDS = 1

/**
 * Opacity (0–1) of the incoming rep at the loop point. A descent rep ends deep
 * and the next has to start back at the top, so the wrap is an unavoidable jump
 * in depth. Fading the new rep in across the first second — while the finished
 * one dissolves at full depth — hides that jump, so the set reads as one
 * continuous loop instead of snapping back to the top every rep. Capped at a
 * third of the rep so short tempos still spend most of their time at full
 * opacity.
 */
export function loopFadeIn(phases: TempoPhase[], cyclePos: number): number {
  const total = phases.reduce((sum, p) => sum + p.seconds, 0)
  if (total <= 0) return 1
  const fade = Math.min(1 / 3, LOOP_FADE_SECONDS / total)
  return Math.max(0, Math.min(1, cyclePos / fade))
}
