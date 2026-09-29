import { describe, expect, it } from 'vitest'
import { goalChartEnd } from './chart'
import { currentPaceAt, projectedSeries, type LockedProjection } from './goalLock'

describe('goal chart horizon', () => {
  const lock: LockedProjection = {
    goalId: 'weight', lockedAt: '2026-08-01', etaDate: '2026-12-01',
    startValue: 170, target: 180, slopePerWeek: 1,
  }

  it('ends at the commitment even when current pace takes five years', () => {
    const currentPace = projectedSeries({ ...lock, etaDate: '2031-08-01' })
    const goal = { lock, currentPace }
    const end = goalChartEnd([{ date: '2026-09-01' }], [goal])
    expect(end).toBe('2026-12-01')
    const visible = currentPace.filter((p) => p.date <= end)
    expect(visible.every((p) => p.date <= lock.etaDate)).toBe(true)
    // Read the original curve at the boundary; clipping must not accelerate it.
    expect(currentPaceAt(lock, currentPace, end)).toBeLessThan(lock.target)
    expect(currentPace.at(-1)?.date).toBe('2031-08-01')
  })

  it('includes the last commitment on a shared chart regardless of order', () => {
    const later = { lock: { etaDate: '2027-02-01' } }
    expect(goalChartEnd([], [{ lock }, later])).toBe('2027-02-01')
    expect(goalChartEnd([], [later, { lock }])).toBe('2027-02-01')
  })

  it('keeps measurements after an overdue goal visible', () => {
    expect(goalChartEnd([{ date: '2027-01-01' }], [{ lock }])).toBe('2027-01-01')
  })

  it('uses history alone when no goals have dates', () => {
    expect(goalChartEnd([{ date: '2026-09-10' }, { date: '2026-08-01' }], [{}]))
      .toBe('2026-09-10')
    expect(goalChartEnd([], [])).toBe('')
  })
})
