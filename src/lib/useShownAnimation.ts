import { useEffect, useRef, useSyncExternalStore } from 'react'
import { animationId, type AnimationFamily } from './hiddenAnimations'

/**
 * Which animation is on screen right now, so the session's kebab can offer to
 * hide it. The animation registers itself rather than the session passing it
 * down: rest, a hold's countdown and the rhythm guide each pick their own shape,
 * and the kebab sits in a top bar both sessions build separately (see CLAUDE.md
 * on keeping the two in step) — one registry reaches both without touching either.
 *
 * A stack, newest on top: rest opens over a set whose hold is still mounted
 * behind it, and the shape you're looking at is the one that came up last.
 */
export type ShownAnimation = {
  id: string
  /** Swap to another shape on the spot, the hidden one being out of the rotation. */
  replace: () => void
}

let stack: ShownAnimation[] = []
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const l of listeners) l()
}

const top = () => stack[stack.length - 1] ?? null

/** The animation the kebab would hide, or null when none is on screen. */
export function useTopAnimation(): ShownAnimation | null {
  return useSyncExternalStore(subscribe, top, top)
}

/**
 * Register the shape this component is drawing for as long as it draws it. A null
 * `variant` registers nothing, for a component drawing something that isn't one
 * of the rotated shapes.
 */
export function useShownAnimation(
  family: AnimationFamily,
  variant: string | null,
  replace: () => void,
) {
  const replaceRef = useRef(replace)
  replaceRef.current = replace

  useEffect(() => {
    if (variant == null) return
    const entry: ShownAnimation = {
      id: animationId(family, variant),
      replace: () => replaceRef.current(),
    }
    stack = [...stack, entry]
    emit()
    return () => {
      stack = stack.filter((e) => e !== entry)
      emit()
    }
  }, [family, variant])
}
