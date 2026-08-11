/**
 * The Tailwind padding classes for the coach composer, top and bottom.
 *
 * Top is a flat 0.5rem: the frosted bar's own border is the line above the
 * field, and that's the gap the eye measures against. Bottom has to match what
 * you *see* under the field, which is this padding plus whatever the next thing
 * down brings with it. With the keyboard closed that next thing is the bottom
 * nav, whose buttons already hold ~0.6rem of blank above their icons (56px tall
 * around a ~37px icon-and-label stack) — add 0.5rem of our own and the space
 * under the field reads twice the space over it. So the bar keeps none, and the
 * nav's inset is the whole gap.
 *
 * With the keyboard up the nav stands down (see App's `typingToCoach`) and the
 * keys butt straight against the bar, so the 0.5rem has to come back or the
 * field sits flush on the keyboard.
 */
export function composerPad(keyboardOpen: boolean): string {
  return keyboardOpen ? 'pt-2 pb-2' : 'pt-2 pb-0'
}
