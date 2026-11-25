/**
 * Which rest shapes live in components/RestShapes, and how each one is laid out.
 *
 * Separate from the components themselves only so RestTimer can build its rotation
 * out of these names without importing a module full of components' worth of
 * geometry — and so that module stays exporting nothing but a component.
 */

/** Shapes that live in the square in the middle of the rest screen. */
export const EXTRA_BOX_VARIANTS = [
  'recharge',
  'tap',
  'plates',
  'scale',
  'moon',
  'spiral',
  'ice',
  'globe',
  'icicle',
  'bulbs',
  'blackhole',
  'tree',
  'mushroom',
  'flower',
  'dandelion',
] as const

/** And the one that takes the whole width instead, running off both edges. */
export const EXTRA_FILL_VARIANTS = ['fuse', 'comet', 'comet-dissolve'] as const

export type ExtraVariant =
  | (typeof EXTRA_BOX_VARIANTS)[number]
  | (typeof EXTRA_FILL_VARIANTS)[number]

/** The boxed shapes: the five drawn in components/RestTimer, then the extras. */
export const REST_BOX_VARIANTS = [
  'sandglass',
  'waterglass',
  'tide',
  'candle',
  'pips',
  ...EXTRA_BOX_VARIANTS,
] as const
// 'perimeter' frames the screen edge; the others fill it, so they sit below the
// up-next block rather than behind it.
export const REST_FILL_VARIANTS = ['curtain', 'hourglass', 'waterclock', ...EXTRA_FILL_VARIANTS] as const
export const REST_FULL_VARIANTS = ['perimeter', ...REST_FILL_VARIANTS] as const
/** Every shape a rest can draw. A hold's countdown draws the boxed ones only. */
export const REST_VARIANTS = [...REST_BOX_VARIANTS, ...REST_FULL_VARIANTS] as const
export type RestVariant = (typeof REST_VARIANTS)[number]

/** Whether a variant name is one of the shapes RestShapes draws. */
export function isExtraVariant(v: string): v is ExtraVariant {
  return (
    (EXTRA_BOX_VARIANTS as readonly string[]).includes(v) ||
    (EXTRA_FILL_VARIANTS as readonly string[]).includes(v)
  )
}
