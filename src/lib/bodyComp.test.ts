import { describe, it, expect } from 'vitest'
import {
  dedupeMeasurementsByDate,
  waistSeries,
  bodyFatSeries,
  latestMeasurement,
  effectiveBodyFat,
  visibilityObservations,
  personalSixPackTarget,
  SIX_PACK_BF,
  type MeasurementEntry,
} from './bodyComp'

describe('dedupeMeasurementsByDate', () => {
  it('keeps the last entry per date and sorts ascending', () => {
    const entries: MeasurementEntry[] = [
      { date: '2026-02-01', waistIn: 34, neckIn: 15 },
      { date: '2026-01-01', waistIn: 36, neckIn: 15 },
      { date: '2026-02-01', waistIn: 33, neckIn: 15 }, // later wins for 02-01
    ]
    const out = dedupeMeasurementsByDate(entries)
    expect(out.map((e) => e.date)).toEqual(['2026-01-01', '2026-02-01'])
    expect(out[1].waistIn).toBe(33)
  })
})

describe('series helpers', () => {
  const entries: MeasurementEntry[] = [
    { date: '2026-01-01', waistIn: 36, neckIn: 15 },
    { date: '2026-02-01', waistIn: 34, neckIn: 15 },
    { date: '2026-03-01', waistIn: 32, neckIn: 15 },
  ]

  it('waistSeries returns waist over time, sorted', () => {
    expect(waistSeries(entries)).toEqual([
      { date: '2026-01-01', value: 36 },
      { date: '2026-02-01', value: 34 },
      { date: '2026-03-01', value: 32 },
    ])
  })

  it('does not calculate body fat from tape measurements', () => {
    expect(bodyFatSeries(entries)).toEqual([])
  })

  it('plots recorded readings without height, skipping invalid percentages', () => {
    expect(bodyFatSeries([
      { date: '2026-03-01', bodyFatPct: 18.2 },
      { date: '2026-02-01', waistIn: 32, neckIn: 15 },
      { date: '2026-01-01', bodyFatPct: 20.5 },
      { date: '2026-04-01', bodyFatPct: 100 },
    ])).toEqual([
      { date: '2026-01-01', value: 20.5 },
      { date: '2026-03-01', value: 18.2 },
    ])
  })

  it('latestMeasurement returns the newest entry, or null when empty', () => {
    expect(latestMeasurement(entries)!.date).toBe('2026-03-01')
    expect(latestMeasurement([])).toBeNull()
  })
})

describe('effectiveBodyFat', () => {
  it.each([0, -1, 100, 101, NaN, Infinity])('rejects invalid reading %s', (bodyFatPct) => {
    expect(effectiveBodyFat({ date: '2026-01-01', bodyFatPct })).toBeNull()
  })

  it('uses a directly recorded bodyFatPct', () => {
    const e: MeasurementEntry = { date: '2025-10-31', bodyFatPct: 11 }
    expect(effectiveBodyFat(e)).toBe(11)
  })

  it('ignores waist and neck without a direct reading', () => {
    const e: MeasurementEntry = { date: '2026-01-01', waistIn: 32, neckIn: 15 }
    expect(effectiveBodyFat(e)).toBeNull()
  })

  it('is null without a valid reading', () => {
    expect(effectiveBodyFat({ date: '2026-01-01', waistIn: 32, neckIn: 15 })).toBeNull()
    expect(effectiveBodyFat({ date: '2026-01-01' })).toBeNull()
  })
})

describe('visibilityObservations + personalSixPackTarget', () => {
  it('falls back to the generic target with no visibility data', () => {
    const entries: MeasurementEntry[] = [{ date: '2026-01-01', waistIn: 32, neckIn: 15 }]
    expect(visibilityObservations(entries, 70)).toEqual([])
    expect(personalSixPackTarget(entries, 70).target).toBe(SIX_PACK_BF)
  })

  it('aims ~2% below the leanest point when abs were not visible there', () => {
    const entries: MeasurementEntry[] = [
      { date: '2025-10-31', bodyFatPct: 11, absVisibility: 'none' },
    ]
    const { target, leanest } = personalSixPackTarget(entries, 70)
    expect(leanest!.bodyFat).toBe(11)
    expect(target).toBe(9) // 11 - 2
  })

  it('aims ~1% below a faint observation', () => {
    const entries: MeasurementEntry[] = [
      { date: '2026-02-01', bodyFatPct: 10, absVisibility: 'faint' },
    ]
    expect(personalSixPackTarget(entries, 70).target).toBe(9)
  })

  it('holds at the BF% where abs were already clear', () => {
    const entries: MeasurementEntry[] = [
      { date: '2026-03-01', bodyFatPct: 9, absVisibility: 'clear' },
    ]
    expect(personalSixPackTarget(entries, 70).target).toBe(9)
  })

  it('uses the leanest observation across multiple entries', () => {
    const entries: MeasurementEntry[] = [
      { date: '2025-10-31', bodyFatPct: 11, absVisibility: 'none' },
      { date: '2026-03-01', bodyFatPct: 9.5, absVisibility: 'faint' },
    ]
    const { target, leanest } = personalSixPackTarget(entries, 70)
    expect(leanest!.bodyFat).toBe(9.5)
    expect(target).toBe(8.5) // 9.5 - 1 (faint)
  })
})
