/**
 * How long after the first tap on a stretch hold the second one still ends it.
 *
 * A hold closes itself on target, and a single stray tap shouldn't cut ninety
 * seconds of it short. But a hold you've already done — feet rolled out while
 * the get-ready count ran — needs a way past it. Two taps is that way: the first
 * only marks the screen, and a second inside this window means it.
 */
export const HOLD_SECOND_TAP_MS = 1500

/** Whether a tap at `now` is the second of a pair begun by one at `armedAt`. */
export function isSecondTap(armedAt: number | null, now: number): boolean {
  return armedAt != null && now - armedAt <= HOLD_SECOND_TAP_MS
}
