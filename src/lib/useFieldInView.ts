import { useEffect, type RefObject } from 'react'
import { isKeyboardOpen, onKeyboardChange } from './viewport'

/** Inputs that never bring a keyboard up, so focusing one has nothing to clear. */
const NO_KEYBOARD = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'date', 'time'])

/** How long a keyboard takes to finish sliding in, as a backstop for the measured open. */
const SETTLE_MS = 600

/**
 * Keep a focused field in the middle of what the keyboard leaves on screen.
 *
 * The browser's own scroll-on-focus isn't enough on a page with a sticky
 * footer: it brings the field only as far as the keyboard's top edge, which is
 * exactly where the footer sits, and on Android it scrolls before the viewport
 * has finished shrinking, so the field ends up under the keyboard as well. This
 * centres the field once the keyboard is measured open (see lib/viewport), and
 * once more when the slide has had time to settle, which also covers a browser
 * where the open is never detected. Hopping from one field to the next with the
 * keyboard already up centres straight away.
 */
export function useFieldInView(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let timer: number | undefined
    let unsubscribe: (() => void) | undefined
    const stop = () => {
      window.clearTimeout(timer)
      unsubscribe?.()
      unsubscribe = undefined
    }
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target
      const typing =
        el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NO_KEYBOARD.has(el.type))
      if (!typing) return
      stop()
      const reveal = () => {
        if (document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
      if (isKeyboardOpen()) reveal()
      else
        unsubscribe = onKeyboardChange(() => {
          if (isKeyboardOpen()) reveal()
        })
      timer = window.setTimeout(() => {
        stop()
        reveal()
      }, SETTLE_MS)
    }
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('focusout', stop)
    return () => {
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('focusout', stop)
      stop()
    }
  }, [ref])
}
