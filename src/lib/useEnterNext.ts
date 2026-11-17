import { useEffect, type KeyboardEvent, type RefObject } from 'react'

const FIELDS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]), select:not([disabled])'

function fieldsOf(root: HTMLElement): (HTMLInputElement | HTMLSelectElement)[] {
  return Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(FIELDS))
}

/**
 * Make the keyboard's enter / next key move to the next field of a long form,
 * not do anything to the form itself. Every input is labelled `next` except the
 * last, which is `done` and just closes the keyboard; only the form's own button
 * submits. Returns the key handler to put on the form's root.
 *
 * The hint is set from an effect after every render because which field is last
 * changes with the sections showing.
 */
export function useEnterNext(ref: RefObject<HTMLElement | null>): (e: KeyboardEvent<HTMLElement>) => void {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const fields = fieldsOf(root)
    fields.forEach((el, i) => {
      if (el instanceof HTMLInputElement) el.enterKeyHint = i === fields.length - 1 ? 'done' : 'next'
    })
  })

  return (e) => {
    const root = ref.current
    const el = e.target
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || !root || !(el instanceof HTMLInputElement)) return
    e.preventDefault()
    const fields = fieldsOf(root)
    const next = fields[fields.indexOf(el) + 1]
    if (next) next.focus()
    else el.blur()
  }
}
