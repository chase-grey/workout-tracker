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
  'beads',
  'split',
  'shed',
  'gather',
] as const

/** And the one that takes the whole width instead, running off both edges. */
export const EXTRA_FILL_VARIANTS = ['fuse'] as const

export type ExtraVariant =
  | (typeof EXTRA_BOX_VARIANTS)[number]
  | (typeof EXTRA_FILL_VARIANTS)[number]

/** Whether a variant name is one of the shapes RestShapes draws. */
export function isExtraVariant(v: string): v is ExtraVariant {
  return (
    (EXTRA_BOX_VARIANTS as readonly string[]).includes(v) ||
    (EXTRA_FILL_VARIANTS as readonly string[]).includes(v)
  )
}
