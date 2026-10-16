import { describe, expect, it } from 'vitest'
import { HOLD_TAP_GRACE_SEC, holdTakesTap } from './holdTap'

describe('holdTakesTap', () => {
  it('takes a tap as the hold comes on screen', () => {
    expect(holdTakesTap(0)).toBe(true)
    expect(holdTakesTap(HOLD_TAP_GRACE_SEC - 0.5)).toBe(true)
  })

  it('ignores one once the hold is under way', () => {
    expect(holdTakesTap(HOLD_TAP_GRACE_SEC)).toBe(false)
    expect(holdTakesTap(60)).toBe(false)
  })
})
