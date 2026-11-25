import { describe, expect, it } from 'vitest'
import { MIN_TAP_ZONE_PX, tapZoneCramped } from './useScreenTap'

describe('tapZoneCramped', () => {
  it('asks for the done button when the cards leave no blank space', () => {
    expect(tapZoneCramped(0)).toBe(true)
    expect(tapZoneCramped(MIN_TAP_ZONE_PX - 1)).toBe(true)
  })

  it('leaves the blank space as the target when there is room to aim at', () => {
    expect(tapZoneCramped(MIN_TAP_ZONE_PX)).toBe(false)
    expect(tapZoneCramped(400)).toBe(false)
  })
})
