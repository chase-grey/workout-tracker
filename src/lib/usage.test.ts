import { describe, expect, it } from 'vitest'
import { addUse, isUseEvent, minusUses } from './usage'

describe('addUse / minusUses', () => {
  it('counts up per feature and keeps what was counted while a tally was in flight', () => {
    let c = addUse({}, 'settings.theme')
    c = addUse(c, 'settings.theme')
    c = addUse(c, 'settings.plan')
    const sent = { ...c }
    c = addUse(c, 'settings.theme')
    expect(minusUses(c, sent)).toEqual({ 'settings.theme': 1 })
    expect(minusUses(sent, sent)).toEqual({})
  })
})

describe('isUseEvent', () => {
  const el = (tag: string, inside?: string) => ({
    closest: (sel: string) =>
      sel.split(',').map((s) => s.trim()).some((s) => s === tag || s === inside) ? {} : null,
  }) as unknown as Element

  it('counts a press of a button or link, not a tap into a field', () => {
    expect(isUseEvent('click', el('button'))).toBe(true)
    expect(isUseEvent('click', el('svg', 'button'))).toBe(true)
    expect(isUseEvent('click', el('a'))).toBe(true)
    expect(isUseEvent('click', el('input'))).toBe(false)
    expect(isUseEvent('click', el('p'))).toBe(false)
  })

  it('counts a committed change of a field', () => {
    expect(isUseEvent('change', el('input'))).toBe(true)
    expect(isUseEvent('change', el('select'))).toBe(true)
    expect(isUseEvent('input', el('input'))).toBe(false)
    expect(isUseEvent('click', null)).toBe(false)
  })
})
