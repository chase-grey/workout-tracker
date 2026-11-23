import { describe, expect, it } from 'vitest'
import { MANUAL_FIELDS, manualResult } from './manualAngle'
import { MEASURE_MODES, resultReadings } from './measure'

describe('manualResult', () => {
  it('fills the field the camera would have', () => {
    expect(manualResult('split', ['142'])).toEqual({ splitDeg: 142 })
    expect(manualResult('leg_lift_right', ['88'])).toEqual({ legLiftRightDeg: 88 })
  })

  it('wants both sides of a paired pose', () => {
    expect(manualResult('tailors', ['55', '54'])).toEqual({ tailorsLeftDeg: 55, tailorsRightDeg: 54 })
    expect(manualResult('tailors', ['55', ''])).toBeNull()
    expect(manualResult('tailors', ['55'])).toBeNull()
  })

  it('rounds to whole degrees, like a measured photo', () => {
    expect(manualResult('toe_touch', ['97.6'])).toEqual({ toeTouchDeg: 98 })
  })

  it('refuses what a photo could not have read', () => {
    expect(manualResult('split', [''])).toBeNull()
    expect(manualResult('split', ['abc'])).toBeNull()
    expect(manualResult('split', ['-5'])).toBeNull()
    expect(manualResult('split', ['181'])).toBeNull()
  })

  // The typed reading has to light up every number the pose shows, or a manual
  // entry would log less than a photo of the same pose.
  it('covers every reading each pose produces', () => {
    for (const mode of MEASURE_MODES) {
      const typed = manualResult(mode, MANUAL_FIELDS[mode].map((_, i) => String(10 + i)))!
      expect(resultReadings(mode, typed).map((r) => r.deg)).toEqual(MANUAL_FIELDS[mode].map((_, i) => 10 + i))
    }
  })
})
