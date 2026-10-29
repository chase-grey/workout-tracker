import { ATTACK_SECONDS, cycleProgress, phaseDrives } from './rhythmMotion'
import { workPhaseCount, type TempoPhase } from './tempo'

const height = (drive: number) => 50 + drive * 28

// Ease into each new level briefly, then hold it for the remaining phase.
const transitionSeconds = (phase: TempoPhase) => Math.min(ATTACK_SECONDS, phase.seconds / 3)

const totalSeconds = (phases: TempoPhase[]) => phases.reduce((sum, phase) => sum + phase.seconds, 0)

/** Width of the rounded shoulder that opens phase `i`, in wave units (100 per rep). */
const shoulderWidth = (phases: TempoPhase[], i: number) =>
  transitionSeconds(phases[i]) / totalSeconds(phases) * 100

/** Repeated cycles extend beyond both edges as the wave scrolls past the dot. */
export function rhythmWavePath(phases: TempoPhase[]): string {
  const total = totalSeconds(phases)
  if (total <= 0) return ''
  const drives = phaseDrives(phases)
  const parts = [`M -100 ${height(drives[drives.length - 1])}`]
  for (let cycle = -1; cycle <= 2; cycle++) {
    phases.forEach((_, i) => {
      const start = (cycle + cycleProgress(phases, i, 0)) * 100
      const end = (cycle + cycleProgress(phases, i, 1)) * 100
      const width = shoulderWidth(phases, i)
      const from = height(drives[(i - 1 + drives.length) % drives.length])
      const to = height(drives[i])
      // Linear x and eased y give rounded shoulders and a matching dot position.
      parts.push(`C ${start + width / 3} ${from} ${start + width * 2 / 3} ${to} ${start + width} ${to} L ${end} ${to}`)
    })
  }
  return parts.join(' ')
}

/** The dot follows the rounded wave using the instruction's phase clock. */
export function rhythmWavePoint(
  phases: TempoPhase[],
  idx: number,
  progress: number,
): readonly [number, number] {
  if (phases.length === 0) return [0, 50]
  const drives = phaseDrives(phases)
  const from = height(drives[(idx - 1 + drives.length) % drives.length])
  const to = height(drives[idx])
  const t = Math.max(0, Math.min(1, progress * phases[idx].seconds / transitionSeconds(phases[idx])))
  const eased = t * t * (3 - 2 * t)
  return [cycleProgress(phases, idx, progress) * 100, from + (to - from) * eased]
}

/**
 * The phase that opens the white stretch of wave, and how many reps ahead of the
 * one in progress it starts. Mirrors `repGlow`: a set that ends itself turns white
 * as its closing rep starts, or a rest earlier when that rep drops its trailing
 * rest; a set you tap to end turns white once the target is behind you. Null with
 * no target.
 */
function glowPhase(
  phases: TempoPhase[],
  rep: number,
  reps: number | undefined,
  endsItself: boolean,
  skipFinalRepRest: boolean,
): { repsAhead: number; phase: number } | null {
  if (phases.length === 0 || reps == null || reps <= 0) return null
  if (!endsItself) return { repsAhead: reps + 1 - rep, phase: 0 }
  if (skipFinalRepRest && reps > 1) {
    const work = workPhaseCount(phases)
    if (work < phases.length) return { repsAhead: reps - 1 - rep, phase: work }
  }
  return { repsAhead: reps - rep, phase: 0 }
}

/**
 * Where along the wave the guide turns white, in the same units as
 * `rhythmWavePoint` (100 per rep, 0 at the start of the rep in progress), so the
 * stretch of wave that will finish the set can be drawn white before the dot
 * reaches it. The guide itself brightens at the phase boundary (see `glowPhase`),
 * but the white on the wave begins where that phase's shoulder lands on its flat:
 * a colour change halfway down a slope reads as part of the slope, and on the
 * flat it reads as a place the dot arrives at.
 */
export function rhythmWaveGlowStart(
  phases: TempoPhase[],
  rep: number,
  reps: number | undefined,
  endsItself: boolean,
  skipFinalRepRest: boolean,
): number | null {
  const at = glowPhase(phases, rep, reps, endsItself, skipFinalRepRest)
  if (at == null) return null
  return (at.repsAhead + cycleProgress(phases, at.phase, 0)) * 100 + shoulderWidth(phases, at.phase)
}

/**
 * Where along the wave a set that ends itself is over, in the units of
 * `rhythmWavePoint`: the end of the target rep, or of its last working phase when
 * it drops its trailing rest. Null for a set that waits on a tap — that one has no
 * end the wave can know about — or with no target.
 */
export function rhythmWaveEnd(
  phases: TempoPhase[],
  rep: number,
  reps: number | undefined,
  endsItself: boolean,
  skipFinalRepRest: boolean,
): number | null {
  if (!endsItself || phases.length === 0 || reps == null || reps <= 0) return null
  const work = workPhaseCount(phases)
  if (skipFinalRepRest && work < phases.length) {
    return (reps - rep + cycleProgress(phases, work, 0)) * 100
  }
  return (reps + 1 - rep) * 100
}

/**
 * The wave past the end of the set, drawn from x = 0 at `rhythmWaveEnd`: one more
 * shoulder down to the resting line and then a flat run of it for as far as the
 * screen can show. Where the real wave would go on into reps that will never
 * happen, this says the set is over here. Dashed by the caller, since the dot
 * never reaches it.
 */
export function rhythmWaveTailPath(
  phases: TempoPhase[],
  endsItself: boolean,
  skipFinalRepRest: boolean,
): string {
  if (phases.length === 0 || totalSeconds(phases) <= 0) return ''
  const drives = phaseDrives(phases)
  const work = workPhaseCount(phases)
  // The phase that would have followed, whose shoulder the tail borrows.
  const next = endsItself && skipFinalRepRest && work < phases.length ? work : 0
  const from = height(drives[(next - 1 + drives.length) % drives.length])
  const width = shoulderWidth(phases, next)
  const rest = height(0)
  return `M 0 ${from} C ${width / 3} ${from} ${width * 2 / 3} ${rest} ${width} ${rest} L 1000 ${rest}`
}
