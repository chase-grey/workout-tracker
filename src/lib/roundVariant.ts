/**
 * The left and right of one round wear the same animation. Everywhere.
 *
 * A per-side round is two steps and two mounts — the left leg's hold and then
 * the right's — but it is one set, and the shape on screen is how that set is
 * read. Two different shapes for its two halves read as two different things to
 * do, and the second one has to be learned again from the floor. So a shape is
 * drawn once per round and both sides show it; the next round has another key
 * and takes the next draw from the rotation (see lib/variantRotation), which is
 * where the variety belongs.
 *
 * Anything a session mounts that picks its own look goes through one of these
 * selectors, keyed by the round and never by the step: the rhythm guide
 * (lib/rhythmVariant), a hold's countdown (components/RestTimer's
 * createHoldVariantSelector), and whatever comes next. Both HoldTimer and
 * RhythmGuide take their `variant` as a required prop for that reason — a
 * session cannot mount one without saying which round it belongs to. The round
 * keys are `flexRoundKey` (lib/flexSteps) for a stretch and `sidedRoundKey`
 * (lib/sidePair) for a lift.
 *
 * A shape hidden from the kebab mid-round is the one exception to "drawn once":
 * the side on screen swaps to a fresh shape on the spot, tells the selector
 * (`keep`), and the other side follows the swap rather than the original. A
 * shape hidden between the sides is redrawn for the second one, since bringing
 * a hidden shape back is worse than a mismatch.
 */
export type RoundVariantSelector<T, A extends unknown[]> = {
  /** The round's shape: drawn on the first ask, the same on every ask after. */
  (roundKey: string, ...args: A): T
  /** The shape a round is showing now, after the one drawn for it was swapped out. */
  keep: (roundKey: string, variant: T) => void
}

export function createRoundVariantSelector<T, A extends unknown[]>(
  draw: (...args: A) => T,
  hidden: (variant: T) => boolean = () => false,
): RoundVariantSelector<T, A> {
  const selected = new Map<string, T>()
  const select = (roundKey: string, ...args: A): T => {
    if (selected.has(roundKey)) {
      const existing = selected.get(roundKey) as T
      if (!hidden(existing)) return existing
    }
    const chosen = draw(...args)
    selected.set(roundKey, chosen)
    return chosen
  }
  select.keep = (roundKey: string, variant: T) => {
    selected.set(roundKey, variant)
  }
  return select
}
