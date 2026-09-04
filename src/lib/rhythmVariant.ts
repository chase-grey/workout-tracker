import { motionForPhases, type MotionKind } from './rhythmMotion'
import { parseTempo } from './tempo'
import { createRotation, type Rotation } from './variantRotation'

const BREATHE_VARIANTS = ['orb', 'square', 'rings', 'tide', 'petals', 'bars', 'halo'] as const
const DESCENT_VARIANTS = ['reach', 'fold', 'dive', 'drip', 'stairs', 'press'] as const
// Fewer shapes here than in the other families, and all three say the same thing
// the same way round: the direction has to be unmistakable at a glance.
const PUSHPULL_VARIANTS = ['anvil', 'chevrons', 'gauge'] as const

export type RhythmVariant =
  | (typeof BREATHE_VARIANTS)[number]
  | (typeof DESCENT_VARIANTS)[number]
  | (typeof PUSHPULL_VARIANTS)[number]

// One rotation per family, held across mounted guides: the order stays random,
// but a shape never follows itself and none sits out for long.
const rotations: Record<MotionKind, Rotation<RhythmVariant>> = {
  breathe: createRotation(BREATHE_VARIANTS),
  descent: createRotation(DESCENT_VARIANTS),
  pushpull: createRotation(PUSHPULL_VARIANTS),
}

export function rhythmVariantForMotion(kind: MotionKind): RhythmVariant {
  return rotations[kind].next()
}

/** Draw the animation for a set before its guide mounts. */
export function nextRhythmVariant(tempo: string): RhythmVariant {
  return rhythmVariantForMotion(motionForPhases(parseTempo(tempo)))
}

/** Keep one draw per session round, including both halves of a per-side round. */
export function createRhythmVariantSelector(
  draw: (tempo: string) => RhythmVariant = nextRhythmVariant,
) {
  const selected = new Map<string, RhythmVariant>()
  return (roundKey: string, tempo: string): RhythmVariant => {
    const existing = selected.get(roundKey)
    if (existing) return existing
    const chosen = draw(tempo)
    selected.set(roundKey, chosen)
    return chosen
  }
}
