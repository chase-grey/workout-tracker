import type { TempoPhase } from './tempo'

/**
 * Which family of rhythm animation suits a stretch, inferred from its tempo:
 * - 'breathe': a shape that expands then contracts — suits reps that descend
 *   and return (e.g. Tailor's Pose: down · hold · up).
 * - 'descent': a shape that drives downward under effort and then releases part of
 *   the way back — suits push-and-rest stretches (e.g. Pancake Hang: push down ·
 *   passive hang), which never come out of the stretch the way a breath returns to
 *   neutral. The rest segment gives back only some of the depth, so the rep ends
 *   where the next one starts and the two halves read as work and then release.
 */
export type MotionKind = 'breathe' | 'descent'

// Words that move you deeper into a stretch vs. words that bring you back up.
// Holds keep whatever depth the last phase reached; rest phases let most of it go.
const DESCEND = /\b(down|push|lower|descend|fold|reach|sink|contract)\b/
const RISE = /\b(up|rise|return|out|expand|extend|open|lift)\b/
const REST = /\b(passive|relax|rest|slack|soften|unwind|float|easy)\b/
const HOLD = /\b(hold|pause|bottom|top|stay|hang|release|deepen|settle)\b/

/**
 * How much of the current depth a passive/rest phase keeps. Releasing all the way
 * to neutral would say you came out of the stretch; keeping some of it says you
 * stayed in and only stopped working. It also gives the resting half of a rep
 * something to animate, which is what lets the rep loop back onto itself instead
 * of freezing deep and then snapping to the top.
 */
export const REST_DEPTH_KEPT = 0.3

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
 * inferred from its label. Descend words sink to 1, rise words return to 0, rest
 * words give most of the depth back without leaving the stretch, and plain holds
 * keep the current depth exactly. Both animation families read from this signal.
 */
export function phaseDepths(phases: TempoPhase[]): number[] {
  let cur = 0
  return phases.map((p) => {
    const l = p.label.toLowerCase()
    if (DESCEND.test(l)) cur = 1
    else if (RISE.test(l)) cur = 0
    else if (REST.test(l)) cur = cur * REST_DEPTH_KEPT
    else if (HOLD.test(l)) {
      /* keep current depth */
    } else cur = cur === 0 ? 1 : 0 // unlabelled phases just alternate
    return cur
  })
}

/**
 * How hard you're working in each phase (1 = driving into the stretch, 0 = letting
 * it go). Only phases labelled as rest are rest: an isometric hold at the bottom
 * is still work, even though nothing moves. The guide reads this alongside the
 * depth so a rep looks like effort and then release, not one uniform slide.
 */
export function phaseEfforts(phases: TempoPhase[]): number[] {
  return phases.map((p) => (REST.test(p.label.toLowerCase()) ? 0 : 1))
}

/**
 * Whether a rep's depth curve moves at all. A curve that never changes value —
 * a stretch that only descends and then holds exactly there — has nothing left to
 * animate, so the guide has to reset it at the loop point (see `loopFadeIn`). Any
 * curve that moves is already continuous around the loop: its last phase ends at
 * the depth the next rep's first phase starts from, so it needs no reset.
 */
export function cycleCloses(phases: TempoPhase[]): boolean {
  return new Set(phaseDepths(phases)).size > 1
}

/** Tremor cycles per phase — a whole number, so the wobble starts and ends still. */
const STRAIN_CYCLES = 5

/**
 * A −1…1 tremor for the current moment, scaled by how hard you're working, so the
 * shape shakes faintly under load and goes still as you release. Zero at both ends
 * of a phase, which keeps it continuous across phase and rep boundaries.
 */
export function strain(effort: number, progress: number): number {
  return effort * Math.sin(progress * 2 * Math.PI * STRAIN_CYCLES)
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

/**
 * How lit the rhythm shape is: its resting brightness, a step up for the rep
 * that will close the set, and full brightness once the target is met.
 */
export type RepGlow = 'base' | 'final' | 'done'

/**
 * Brightness for the rep in progress. `endsItself` is a set that rolls into its
 * rest the moment the target rep finishes (hands-free) — there, and only there,
 * the last rep is worth calling out while it's still running: no tap is coming,
 * so the shape saying "this is the one" is the only warning the set is about to
 * close. Tapping through your own sets, that early tell would just be noise.
 */
export function repGlow(rep: number, reps: number | undefined, endsItself: boolean): RepGlow {
  if (hitRepTarget(rep, reps)) return 'done'
  if (endsItself && reps != null && reps > 0 && rep === reps) return 'final'
  return 'base'
}

/** Seconds spent dissolving the finished rep into the new one at the loop point. */
export const LOOP_FADE_SECONDS = 1

/**
 * Opacity (0–1) of the incoming rep at the loop point, for the one case that can't
 * loop on its own: a depth curve that never moves (see `cycleCloses`) ends deep and
 * the next rep has to start back at the top, so the wrap is an unavoidable jump.
 * Fading the new rep in across the first second — while the finished one dissolves
 * at full depth — hides that jump. Capped at a third of the rep so short tempos
 * still spend most of their time at full opacity.
 */
export function loopFadeIn(phases: TempoPhase[], cyclePos: number): number {
  const total = phases.reduce((sum, p) => sum + p.seconds, 0)
  if (total <= 0) return 1
  const fade = Math.min(1 / 3, LOOP_FADE_SECONDS / total)
  return Math.max(0, Math.min(1, cyclePos / fade))
}
