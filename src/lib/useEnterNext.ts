import { useEffect, type KeyboardEvent, type RefObject } from 'react'

const FIELDS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), select:not([disabled])'

function fieldsOf(root: HTMLElement): (HTMLInputElement | HTMLSelectElement)[] {
  return Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(FIELDS))
}

/**
 * What the keyboard's enter key does in the field at `index` of `count`: move on
 * to the next field, or — in the last — close the keyboard (`done`), or close it
 * and act (`go`) when the form has something for its last field to set off.
 */
export function enterKeyRole(index: number, count: number, acts: boolean): 'next' | 'done' | 'go' {
  if (index < count - 1) return 'next'
  return acts ? 'go' : 'done'
}

/**
 * Make the keyboard's enter / next key move to the next field of a long form,
 * not do anything to the form itself. Every input is labelled `next` except the
 * last, which is `done` and just closes the keyboard; only the form's own button
 * submits. Returns the key handler to put on the form's root.
 *
 * `onLast` is for the one kind of form whose last field does carry on: a session's
 * set card, where enter in the last number is the set finished, as a tap on the
 * screen around the card would be. That field is labelled `go`; the keyboard is
 * closed first and `onLast` is called directly, so nothing depends on a click
 * finding its way back to a control after the page reflows (see usePressAction).
 *
 * The hint is set from an effect after every render because which field is last
 * changes with the sections showing.
 */
export function useEnterNext(
  ref: RefObject<HTMLElement | null>,
  onLast?: () => void,
): (e: KeyboardEvent<HTMLElement>) => void {
  const acts = onLast != null
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const fields = fieldsOf(root)
    fields.forEach((el, i) => {
      if (el instanceof HTMLInputElement) el.enterKeyHint = enterKeyRole(i, fields.length, acts)
    })
  })

  return (e) => {
    const root = ref.current
    const el = e.target
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || !root || !(el instanceof HTMLInputElement)) return
    e.preventDefault()
    const fields = fieldsOf(root)
    const at = fields.indexOf(el)
    const role = enterKeyRole(at, fields.length, acts)
    if (role === 'next') {
      fields[at + 1].focus()
      return
    }
    el.blur()
    if (role === 'go') onLast?.()
  }
}
