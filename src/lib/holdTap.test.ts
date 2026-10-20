import { describe, expect, it } from 'vitest'
import { HOLD_SECOND_TAP_MS, isSecondTap } from './holdTap'

describe('isSecondTap', () => {
  it('needs a first tap to pair with', () => {
    expect(isSecondTap(null, 1000)).toBe(false)
  })

  it('ends the hold on a second tap inside the window', () => {
    expect(isSecondTap(1000, 1000 + HOLD_SECOND_TAP_MS - 1)).toBe(true)
    expect(isSecondTap(1000, 1000 + HOLD_SECOND_TAP_MS)).toBe(true)
  })

  it('treats a tap after the window as a fresh first one', () => {
    expect(isSecondTap(1000, 1000 + HOLD_SECOND_TAP_MS + 1)).toBe(false)
  })
})
