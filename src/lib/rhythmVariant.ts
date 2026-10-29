import { motionForPhases, type MotionKind } from './rhythmMotion'
import { parseTempo } from './tempo'
import { createRotation, type Rotation } from './variantRotation'
import { isAnimationHidden } from './hiddenAnimations'

const BREATHE_VARIANTS = ['orb', 'square', 'rings', 'tide', 'petals', 'bars', 'halo'] as const
const DESCENT_VARIANTS = ['reach', 'fold', 'dive', 'drip', 'stairs', 'press'] as const
// Fewer shapes here than in the other families, and all four say the same thing
// the same way round: the direction has to be unmistakable at a glance.
const PUSHPULL_VARIANTS = ['anvil', 'chevrons', 'gauge', 'wave'] as const
// The floss glides forward and back rather than down and up, so it has figures of
// its own (see components/FlossGuide): four drawn from nature, three from geometry.
// As in the push/pull family, every one of them says the heading the same way: by
// leaning into it.
const FLOSS_VARIANTS = ['beads', 'thread', 'wake', 'grass', 'slats', 'tiles', 'capsule'] as const

export type FlossVariant = (typeof FLOSS_VARIANTS)[number]

export type RhythmVariant =
  | (typeof BREATHE_VARIANTS)[number]
  | (typeof DESCENT_VARIANTS)[number]
  | (typeof PUSHPULL_VARIANTS)[number]
  | FlossVariant

export const isFlossVariant = (variant: string): variant is FlossVariant =>
  (FLOSS_VARIANTS as readonly string[]).includes(variant)

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
const flossRotation = createRotation(FLOSS_VARIANTS, Math.random, notHidden)

export function rhythmVariantForMotion(kind: MotionKind): RhythmVariant {
  return rotations[kind].next()
}

/** The next floss figure: the forward/back sets draw from their own family. */
export function nextFlossVariant(): FlossVariant {
  return flossRotation.next()
}

/**
 * Draw the animation for a set before its guide mounts. A forward/back set is the
 * floss, whatever words its tempo was saved with, and draws a floss figure.
 */
export function nextRhythmVariant(tempo: string, forwardBack = false): RhythmVariant {
  return forwardBack ? nextFlossVariant() : rhythmVariantForMotion(motionForPhases(parseTempo(tempo)))
}

/**
 * Keep one draw per session round, including both halves of a per-side round —
 * unless the shape was hidden in between, in which case the second side draws
 * fresh rather than bringing it back.
 */
export function createRhythmVariantSelector(
  draw: (tempo: string, forwardBack: boolean) => RhythmVariant = nextRhythmVariant,
  hidden: (variant: RhythmVariant) => boolean = rhythmHidden,
) {
  const selected = new Map<string, RhythmVariant>()
  return (roundKey: string, tempo: string, forwardBack = false): RhythmVariant => {
    const existing = selected.get(roundKey)
    if (existing && !hidden(existing)) return existing
    const chosen = draw(tempo, forwardBack)
    selected.set(roundKey, chosen)
    return chosen
  }
}
