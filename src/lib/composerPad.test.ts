import { describe, expect, it } from 'vitest'
import { composerPad } from './composerPad'

describe('composerPad', () => {
  it('drops the bottom padding when the nav is below the composer', () => {
    // The nav's own space around its icons is the gap under the field; adding
    // the bar's 0.5rem on top of it is what made below read heavier than above.
    expect(composerPad(false)).toBe('pt-2 pb-0')
  })

  it('matches top and bottom when the keyboard has taken the nav away', () => {
    expect(composerPad(true)).toBe('pt-2 pb-2')
  })

  it('never pads the bottom more than the top', () => {
    for (const open of [true, false]) {
      const [top, bottom] = composerPad(open).split(' ')
      expect(Number(bottom.slice(3))).toBeLessThanOrEqual(Number(top.slice(3)))
    }
  })
})
