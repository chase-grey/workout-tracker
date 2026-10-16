import { ATTACK_SECONDS, cycleProgress, phaseDrives } from './rhythmMotion'
import { workPhaseCount, type TempoPhase } from './tempo'

const height = (drive: number) => 50 + drive * 28

// Ease into each new level briefly, then hold it for the remaining phase.
const transitionSeconds = (phase: TempoPhase) => Math.min(ATTACK_SECONDS, phase.seconds / 3)

/** Repeated cycles extend beyond both edges as the wave scrolls past the dot. */
export function rhythmWavePath(phases: TempoPhase[]): string {
  const total = phases.reduce((sum, phase) => sum + phase.seconds, 0)
  if (total <= 0) return ''
  const drives = phaseDrives(phases)
  const parts = [`M -100 ${height(drives[drives.length - 1])}`]
  for (let cycle = -1; cycle <= 2; cycle++) {
    phases.forEach((phase, i) => {
      const start = (cycle + cycleProgress(phases, i, 0)) * 100
      const end = (cycle + cycleProgress(phases, i, 1)) * 100
      const width = transitionSeconds(phase) / total * 100
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
 * Where along the wave the guide turns white, in the same units as
 * `rhythmWavePoint` (100 per rep, 0 at the start of the rep in progress), so the
 * stretch of wave that will finish the set can be drawn white before the dot
 * reaches it. Mirrors `repGlow`: a set that ends itself turns white as its closing
 * rep starts, or a rest earlier when that rep drops its trailing rest; a set you
 * tap to end turns white once the target is behind you. Null with no target.
 */
export function rhythmWaveGlowStart(
  phases: TempoPhase[],
  rep: number,
  reps: number | undefined,
  endsItself: boolean,
  skipFinalRepRest: boolean,
): number | null {
  if (phases.length === 0 || reps == null || reps <= 0) return null
  if (!endsItself) return (reps + 1 - rep) * 100
  if (skipFinalRepRest && reps > 1) {
    const work = workPhaseCount(phases)
    if (work < phases.length) return (reps - 1 - rep + cycleProgress(phases, work, 0)) * 100
  }
  return (reps - rep) * 100
}
