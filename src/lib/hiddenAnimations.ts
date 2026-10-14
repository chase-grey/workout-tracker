/**
 * Animations marked bad from a session's kebab, and kept out of every rotation
 * after that.
 *
 * Stored in settings as `family:variant` ids, so they sync with the rest of the
 * account and a shape hidden on the phone stays hidden on the next one. The family
 * is part of the id because names repeat across sets — there is a rest 'tide' and
 * a breathing 'tide', and they look nothing alike. The rest shapes and a hold's
 * countdown draw the same art, so they share a family: hiding one hides both.
 */

import { storage } from '../services/storage'

export type AnimationFamily = 'rest' | 'rhythm'

export function animationId(family: AnimationFamily, variant: string): string {
  return `${family}:${variant}`
}

/**
 * Whether a shape has been hidden. Read straight from storage on every draw: the
 * rotations live at module scope, outside React, and a settings write lands in
 * storage before the menu that made it closes.
 */
export function isAnimationHidden(family: AnimationFamily, variant: string): boolean {
  return (storage.loadSettings().hiddenAnimations ?? []).includes(animationId(family, variant))
}

/** `hidden` with `id` added, unchanged if it was already there. */
export function withHidden(hidden: readonly string[] | undefined, id: string): string[] {
  const list = hidden ?? []
  return list.includes(id) ? [...list] : [...list, id]
}

/**
 * Two devices' hidden lists folded together. A union rather than last-write-wins:
 * hiding is the only edit there is, so a shape either device marked bad stays
 * gone instead of coming back because the other one synced later.
 */
export function unionHidden(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): string[] | undefined {
  if (!a && !b) return undefined
  return [...new Set([...(a ?? []), ...(b ?? [])])]
}
