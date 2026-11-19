import { useLayoutEffect, useRef, type RefObject } from 'react'
import { usePrefersReducedMotion } from './useReducedMotion'
import {
  SCREEN_MOVE_EASING,
  SCREEN_MOVE_MS,
  screenMove,
  screenMoveKeyframes,
  type Screen,
} from './motion'

/**
 * Play the arrival for whatever the shell just switched to (see lib/motion).
 *
 * Run on the element rather than by remounting it under a key: a session set
 * aside stays mounted inside this same box with its clocks running, and a new
 * key would restart them. The animation is the browser's own, started before
 * the first paint of the new screen and dropped when it ends, so the box is
 * left with no transform of its own — a sheet opened from it a moment later is
 * laid out against the screen again, not against a box that was moving.
 */
export function useScreenMove(
  ref: RefObject<HTMLElement | null>,
  screen: Screen,
  tabs: readonly string[],
) {
  const reducedMotion = usePrefersReducedMotion()
  const prev = useRef(screen)
  const { tab, immersive, session } = screen
  const order = tabs.join(',')

  useLayoutEffect(() => {
    const move = screenMove(prev.current, { tab, immersive, session }, order.split(','))
    prev.current = { tab, immersive, session }
    if (!move || reducedMotion) return
    const animation = ref.current?.animate?.(screenMoveKeyframes(move), {
      duration: SCREEN_MOVE_MS,
      easing: SCREEN_MOVE_EASING,
    })
    // A second tab tapped mid-move replaces the first instead of stacking on it.
    return () => animation?.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, immersive, session])
}
