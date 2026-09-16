import { ATTACK_SECONDS, cycleProgress, phaseDrives } from './rhythmMotion'
import type { TempoPhase } from './tempo'

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
