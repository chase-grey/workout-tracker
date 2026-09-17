import { describe, expect, it } from 'vitest'
import { currentPaceAt, expectedAt, projectedSeries, type LockedProjection } from './goalLock'

const lock: LockedProjection = {
  goalId: 'weight', lockedAt: '2026-08-01', etaDate: '2026-09-01',
  startValue: 170, target: 180, slopePerWeek: 2,
}

describe('current pace readout on merged chart dates', () => {
  const live = { ...lock, lockedAt: '2026-08-04', startValue: 172, etaDate: '2026-09-08' }
  const series = projectedSeries(live)

  it('supplies a value on dates sampled only by the committed line or history', () => {
    for (const date of ['2026-08-08', '2026-08-15', '2026-09-02']) {
      expect(series.some((p) => p.date === date)).toBe(false)
      expect(currentPaceAt(lock, series, date)).toBe(expectedAt(live, date))
    }
  })

  it('preserves the sampled values and both endpoints', () => {
    for (const p of series) expect(currentPaceAt(lock, series, p.date)).toBe(p.value)
  })

  it('does not invent a current pace outside its range or for an absent series', () => {
    expect(currentPaceAt(lock, series, '2026-08-03')).toBeUndefined()
    expect(currentPaceAt(lock, series, '2026-09-09')).toBeUndefined()
    expect(currentPaceAt(lock, [], '2026-08-15')).toBeUndefined()
  })

  it('uses the same taper for a falling projection', () => {
    const falling = { ...live, startValue: 190, target: 180, decayPerWeek: 0.98 }
    expect(currentPaceAt(falling, projectedSeries(falling), '2026-08-15'))
      .toBe(expectedAt(falling, '2026-08-15'))
  })
})
