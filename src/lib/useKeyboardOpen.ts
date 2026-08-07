import { useSyncExternalStore } from 'react'
import { isKeyboardOpen, onKeyboardChange } from './viewport'

/**
 * Whether the on-screen keyboard is up, as measured in src/lib/viewport.ts.
 *
 * Geometry rather than input focus: Android's back button dismisses the keyboard
 * without blurring the field, so a focus flag would stay stuck on with nothing on
 * screen to show for it. It also keeps the answer honest across a tap on a button
 * next to the composer — focus would drop the instant the finger lands, moving the
 * layout out from under the tap before the click resolves.
 */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(onKeyboardChange, isKeyboardOpen, () => false)
}
