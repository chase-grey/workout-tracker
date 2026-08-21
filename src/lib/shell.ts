/**
 * The box the app shell lays a screen's content out in.
 *
 * Shared rather than written twice because the rest screen is a full-viewport
 * overlay drawn *outside* the shell, and what it puts at the top is the session's
 * own toolbar — the progress bar, the move you're on, its controls. Laid out
 * against anything but the shell's own box, that toolbar shifts by a few pixels
 * the moment rest opens over the set, which is exactly the jump these exist to
 * prevent. Change one of these and both move together.
 */

/** Centred, and never wider than a phone. */
export const SHELL_WIDTH = 'mx-auto max-w-md'

/** The side gutters a screen's content sits inside. */
export const SHELL_PAD_X = 'px-4'

/** Where the top of a screen starts — clear of the status bar / notch. */
export const SHELL_PAD_TOP = 'pt-[calc(1.25rem+env(safe-area-inset-top))]'
