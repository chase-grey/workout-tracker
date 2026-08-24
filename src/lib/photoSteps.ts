import type { SessionStep } from './flexSteps'
import { MEASURE_LABEL, type MeasureMode } from './measure'
import { FLEX_ROUTINES, type FlexRoutineKey } from '../config/flexRoutines'

/**
 * The photo prompts a stretch session offers. Each one is a pose measured at a
 * point in the routine — cold before anything has warmed up, warm once that pose
 * has had its full work. They're collected on their own screens (see
 * `PhotoStep`), not folded into the stretch or rest screens, so taking one never
 * competes with a running set or a draining rest clock.
 *
 * Which shots a session offers is the routine's business (see
 * config/flexRoutines): a side split measures the split and tailor's pose, head
 * to toe measures the fold and both leg lifts, and neither takes the other's
 * photos.
 */
export type PhotoKind =
  | 'cold-split'
  | 'cold-tailors'
  | 'warm-tailors'
  | 'warm-split'
  | 'cold-toe-touch'
  | 'warm-toe-touch'
  | 'cold-leg-lift-left'
  | 'cold-leg-lift-right'
  | 'warm-leg-lift-left'
  | 'warm-leg-lift-right'

/** A photo screen: the shots it offers, all of them optional. */
export type PhotoGate = { id: PhotoGateId; title: string; shots: PhotoKind[] }

/**
 * Identifies a gate for "already shown" tracking across a resumed session.
 *
 * The two routines' gates have ids of their own, so a day that runs both doesn't
 * have one routine's cold screen suppress the other's.
 */
export type PhotoGateId = 'cold' | 'warm-tailors' | 'warm-split' | 'cold-h2t' | 'warm-h2t'

export const PHOTO_SHOT: Record<PhotoKind, { label: string; mode: MeasureMode; cold: boolean }> = {
  'cold-split': { label: `${MEASURE_LABEL.split} · cold`, mode: 'split', cold: true },
  'cold-tailors': { label: `${MEASURE_LABEL.tailors} · cold`, mode: 'tailors', cold: true },
  'warm-tailors': { label: `${MEASURE_LABEL.tailors} · warm`, mode: 'tailors', cold: false },
  'warm-split': { label: `${MEASURE_LABEL.split} · warm`, mode: 'split', cold: false },
  'cold-toe-touch': { label: `${MEASURE_LABEL.toe_touch} · cold`, mode: 'toe_touch', cold: true },
  'warm-toe-touch': { label: `${MEASURE_LABEL.toe_touch} · warm`, mode: 'toe_touch', cold: false },
  'cold-leg-lift-left': {
    label: `${MEASURE_LABEL.leg_lift_left} · cold`,
    mode: 'leg_lift_left',
    cold: true,
  },
  'cold-leg-lift-right': {
    label: `${MEASURE_LABEL.leg_lift_right} · cold`,
    mode: 'leg_lift_right',
    cold: true,
  },
  'warm-leg-lift-left': {
    label: `${MEASURE_LABEL.leg_lift_left} · warm`,
    mode: 'leg_lift_left',
    cold: false,
  },
  'warm-leg-lift-right': {
    label: `${MEASURE_LABEL.leg_lift_right} · warm`,
    mode: 'leg_lift_right',
    cold: false,
  },
}

/** The cold screen a routine opens with, offering all of its cold shots. */
export function coldGate(routine: FlexRoutineKey): PhotoGate {
  return {
    id: routine === 'head_to_toe' ? 'cold-h2t' : 'cold',
    title: 'cold photos',
    shots: FLEX_ROUTINES[routine].coldShots,
  }
}

/** Indices of the flex steps in a session, in order. */
const flexIndices = (steps: SessionStep[]): number[] =>
  steps.flatMap((s, i) => (s.kind === 'flex' ? [i] : []))

/**
 * The photo screen (if any) that follows finishing the set at `index`.
 *
 * For the side split there are two moments: the warm tailor's shot after the last
 * set of Tailor's Pose, when that pose is as open as the routine will get it, and
 * the warm split after the last stretch set. If the routine's last stretch set is
 * also its last tailor's set, both shots share one screen.
 *
 * Head to toe has one, after its last stretch set: both pike exercises warm the
 * fold and the lift alike, so there's no earlier point at which one of the three
 * readings is finished and the others aren't — and one screen at the end mirrors
 * where the splits routine puts its warm split.
 *
 * Core sets never trigger one.
 */
export function gateAfterStep(
  steps: SessionStep[],
  index: number,
  routine: FlexRoutineKey = 'side_split',
): PhotoGate | null {
  const step = steps[index]
  if (!step || step.kind !== 'flex') return null

  const flexIdx = flexIndices(steps)
  if (flexIdx.length === 0) return null
  const atLastFlex = index === flexIdx[flexIdx.length - 1]

  if (routine === 'head_to_toe') {
    if (!atLastFlex) return null
    return { id: 'warm-h2t', title: 'warm photos', shots: FLEX_ROUTINES.head_to_toe.warmShots }
  }

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
