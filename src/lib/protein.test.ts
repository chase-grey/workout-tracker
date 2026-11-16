import { describe, expect, it } from 'vitest'
import { proteinGoalOn, proteinTargetForWeight } from './protein'

describe('proteinTargetForWeight', () => {
  it('sets 1.8 g/kg to the nearest 5 g', () => {
    expect(proteinTargetForWeight(174)).toBe(140)
    expect(proteinTargetForWeight(220)).toBe(180)
    expect(proteinTargetForWeight(130)).toBe(105)
  })
})

describe('proteinGoalOn', () => {
  const weights = [
    { date: '2026-10-01', weightLbs: 170 },
    { date: '2026-11-01', weightLbs: 180 },
  ]

  it('follows the latest weigh-in on or before the day', () => {
    expect(proteinGoalOn('2026-10-15', weights, null)).toBe(proteinTargetForWeight(170))
    expect(proteinGoalOn('2026-11-10', weights, null)).toBe(proteinTargetForWeight(180))
  })

  it('uses the first weigh-in for a day before any', () => {
    expect(proteinGoalOn('2026-09-01', weights, null)).toBe(proteinTargetForWeight(170))
  })

  it("prefers the profile's own target", () => {
    expect(proteinGoalOn('2026-11-10', weights, { proteinGoal: 160 })).toBe(160)
  })

  it('falls back to the target weight, then to nothing', () => {
    expect(proteinGoalOn('2026-11-10', [], { targetWeightLbs: 150 })).toBe(proteinTargetForWeight(150))
    expect(proteinGoalOn('2026-11-10', [], {})).toBeNull()
    expect(proteinGoalOn('2026-11-10', [], null)).toBeNull()
  })

  it('ignores an unusable own target or weigh-in', () => {
    expect(proteinGoalOn('2026-11-10', [{ date: '2026-11-01', weightLbs: NaN }], { proteinGoal: 0 })).toBeNull()
  })
})
