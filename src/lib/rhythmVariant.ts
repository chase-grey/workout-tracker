import { motionForPhases, type MotionKind } from './rhythmMotion'
import { parseTempo } from './tempo'
import { createRotation, type Rotation } from './variantRotation'
import { isAnimationHidden } from './hiddenAnimations'

const BREATHE_VARIANTS = ['orb', 'square', 'rings', 'tide', 'petals', 'bars', 'halo'] as const
const DESCENT_VARIANTS = ['reach', 'fold', 'dive', 'drip', 'stairs', 'press'] as const
// Fewer shapes here than in the other families, and all four say the same thing
// the same way round: the direction has to be unmistakable at a glance.
const PUSHPULL_VARIANTS = ['anvil', 'chevrons', 'gauge', 'wave'] as const

export type RhythmVariant =
  | (typeof BREATHE_VARIANTS)[number]
  | (typeof DESCENT_VARIANTS)[number]
  | (typeof PUSHPULL_VARIANTS)[number]

// One rotation per family, held across mounted guides: the order stays random,
// but a shape never follows itself and none sits out for long. Shapes marked bad
// from the kebab sit out for good (see lib/hiddenAnimations).
const rhythmHidden = (v: RhythmVariant) => isAnimationHidden('rhythm', v)
const notHidden = (v: RhythmVariant) => !rhythmHidden(v)
const rotations: Record<MotionKind, Rotation<RhythmVariant>> = {
  breathe: createRotation(BREATHE_VARIANTS, Math.random, notHidden),
  descent: createRotation(DESCENT_VARIANTS, Math.random, notHidden),
  pushpull: createRotation(PUSHPULL_VARIANTS, Math.random, notHidden),
}

export function rhythmVariantForMotion(kind: MotionKind): RhythmVariant {
  return rotations[kind].next()
}

/** Draw the animation for a set before its guide mounts. */
export function nextRhythmVariant(tempo: string): RhythmVariant {
  return rhythmVariantForMotion(motionForPhases(parseTempo(tempo)))
}

/**
 * Keep one draw per session round, including both halves of a per-side round —
 * unless the shape was hidden in between, in which case the second side draws
 * fresh rather than bringing it back.
 */
export function createRhythmVariantSelector(
  draw: (tempo: string) => RhythmVariant = nextRhythmVariant,
  hidden: (variant: RhythmVariant) => boolean = rhythmHidden,
) {
  const selected = new Map<string, RhythmVariant>()
  return (roundKey: string, tempo: string): RhythmVariant => {
    const existing = selected.get(roundKey)
    if (existing && !hidden(existing)) return existing
    const chosen = draw(tempo)
    selected.set(roundKey, chosen)
    return chosen
  }
}
