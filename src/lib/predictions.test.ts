import { describe, it, expect } from 'vitest'
import { project, weeklyTarget } from './predictions'

describe('project', () => {
  it('increasing bodyweight trending toward a higher target is on track', () => {
    const points = [
      { date: '2026-01-05', value: 165 },
      { date: '2026-01-12', value: 166.5 },
      { date: '2026-01-19', value: 168 },
      { date: '2026-01-26', value: 170 },
    ]
    const today = new Date(2026, 0, 26)
    const p = project(points, 180, today)

    expect(p.slopePerWeek).toBeGreaterThan(0)
    expect(p.current).toBe(170)
    expect(p.onTrack).toBe(true)
    expect(p.etaWeeks).not.toBeNull()
    expect(p.etaWeeks as number).toBeGreaterThan(0)
    expect(p.etaDate).not.toBeNull()
    // ETA date must be in the future relative to today.
    expect((p.etaDate as string) > '2026-01-26').toBe(true)
  })

  it('series moving away from a higher target is not on track', () => {
    const points = [
      { date: '2026-01-05', value: 175 },
      { date: '2026-01-12', value: 173 },
      { date: '2026-01-19', value: 171 },
      { date: '2026-01-26', value: 169 },
    ]
    const p = project(points, 180, new Date(2026, 0, 26))

    expect(p.slopePerWeek).toBeLessThan(0)
    expect(p.etaWeeks).toBeNull()
    expect(p.etaDate).toBeNull()
    expect(p.onTrack).toBe(false)
  })

  it('already at or above target reports etaWeeks 0 and onTrack true', () => {
    const points = [
      { date: '2026-01-05', value: 178 },
      { date: '2026-01-12', value: 180 },
    ]
    const today = new Date(2026, 0, 12)
    const p = project(points, 180, today)

    expect(p.etaWeeks).toBe(0)
    expect(p.onTrack).toBe(true)
    expect(p.etaDate).toBe('2026-01-12')
  })

  it('fewer than two points yields a null ETA', () => {
    const one = project([{ date: '2026-01-05', value: 165 }], 180, new Date(2026, 0, 5))
    expect(one.current).toBe(165)
    expect(one.slopePerWeek).toBe(0)
    expect(one.etaWeeks).toBeNull()
    expect(one.etaDate).toBeNull()
    expect(one.onTrack).toBe(false)

    const none = project([], 180, new Date(2026, 0, 5))
    expect(none.etaWeeks).toBeNull()
    expect(none.onTrack).toBe(false)
    expect(Number.isNaN(none.current)).toBe(true)
  })
})

describe('weeklyTarget', () => {
  it('returns the one-week required step toward the target', () => {
    expect(weeklyTarget(170, 180, 10)).toBe(171)
  })

  it('returns target when weeksOut <= 0', () => {
    expect(weeklyTarget(170, 180, 0)).toBe(180)
    expect(weeklyTarget(170, 180, -5)).toBe(180)
  })
})
