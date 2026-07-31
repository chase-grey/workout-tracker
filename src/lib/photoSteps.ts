import type { SessionStep } from './flexSteps'
import { MEASURE_LABEL, type MeasureMode } from './measure'

/**
 * The photo prompts a stretch session offers. Each one is a pose measured at a
 * point in the routine — cold before anything has warmed up, warm once that pose
 * has had its full work. They're collected on their own screens (see
 * `PhotoStep`), not folded into the stretch or rest screens, so taking one never
 * competes with a running set or a draining rest clock.
 */
export type PhotoKind = 'cold-split' | 'cold-tailors' | 'warm-tailors' | 'warm-split'

/** A photo screen: the shots it offers, all of them optional. */
export type PhotoGate = { id: PhotoGateId; title: string; shots: PhotoKind[] }

/** Identifies a gate for "already shown" tracking across a resumed session. */
export type PhotoGateId = 'cold' | 'warm-tailors' | 'warm-split'

export const PHOTO_SHOT: Record<PhotoKind, { label: string; mode: MeasureMode; cold: boolean }> = {
  'cold-split': { label: `${MEASURE_LABEL.split} · cold`, mode: 'split', cold: true },
  'cold-tailors': { label: `${MEASURE_LABEL.tailors} · cold`, mode: 'tailors', cold: true },
  'warm-tailors': { label: `${MEASURE_LABEL.tailors} · warm`, mode: 'tailors', cold: false },
  'warm-split': { label: `${MEASURE_LABEL.split} · warm`, mode: 'split', cold: false },
}

/** Both cold shots, offered once at the very top of the session. */
export const COLD_GATE: PhotoGate = {
  id: 'cold',
  title: 'cold photos',
  shots: ['cold-split', 'cold-tailors'],
}

/**
 * The photo screen (if any) that follows finishing the set at `index`:
 *   - the warm tailor's shot after the last set of Tailor's Pose, when that
 *     pose is as open as the routine will get it;
 *   - the warm split after the last stretch set, before the core block.
 * If the routine's last stretch set is also its last tailor's set, both shots
 * share one screen. Core sets never trigger one.
 */
export function gateAfterStep(steps: SessionStep[], index: number): PhotoGate | null {
  const step = steps[index]
  if (!step || step.kind !== 'flex') return null

  const flexIdx = steps.flatMap((s, i) => (s.kind === 'flex' ? [i] : []))
  if (flexIdx.length === 0) return null
  const atLastFlex = index === flexIdx[flexIdx.length - 1]
  const atLastTailors =
    index ===
    [...flexIdx].reverse().find((i) => steps[i].exKey.toLowerCase().includes('tailor'))

  if (atLastFlex && atLastTailors) {
    return { id: 'warm-split', title: 'warm photos', shots: ['warm-tailors', 'warm-split'] }
  }
  if (atLastTailors) return { id: 'warm-tailors', title: "warm tailor's photo", shots: ['warm-tailors'] }
  if (atLastFlex) return { id: 'warm-split', title: 'warm split photo', shots: ['warm-split'] }
  return null
}
