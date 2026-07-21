import { describe, it, expect } from 'vitest'
import {
  navyBodyFat,
  dedupeMeasurementsByDate,
  waistSeries,
  bodyFatSeries,
  latestMeasurement,
  type MeasurementEntry,
} from './bodyComp'

describe('navyBodyFat', () => {
  it('computes a plausible BF% for lean male measurements', () => {
    // waist 32, neck 15, height 70 → ~13% (near six-pack territory).
    const bf = navyBodyFat(32, 15, 70)
    expect(bf).not.toBeNull()
    expect(bf!).toBeGreaterThan(9)
    expect(bf!).toBeLessThan(16)
  })

  it('rises as the waist grows (neck/height fixed)', () => {
    const lean = navyBodyFat(32, 15, 70)!
    const soft = navyBodyFat(38, 15, 70)!
    expect(soft).toBeGreaterThan(lean)
  })

  it('rounds to one decimal', () => {
    const bf = navyBodyFat(34, 15.5, 70)!
    expect(bf).toBe(Math.round(bf * 10) / 10)
  })

  it('returns null when waist ≤ neck (log undefined)', () => {
    expect(navyBodyFat(15, 15, 70)).toBeNull()
    expect(navyBodyFat(14, 15, 70)).toBeNull()
  })

  it('returns null for missing or non-positive inputs', () => {
    expect(navyBodyFat(32, 15, 0)).toBeNull()
    expect(navyBodyFat(NaN, 15, 70)).toBeNull()
    expect(navyBodyFat(32, -1, 70)).toBeNull()
  })
})

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

  it('bodyFatSeries computes a declining trend as waist shrinks', () => {
    const s = bodyFatSeries(entries, 70)
    expect(s).toHaveLength(3)
    expect(s[0].value).toBeGreaterThan(s[2].value)
  })

  it('bodyFatSeries skips points that can not be estimated', () => {
    const bad: MeasurementEntry[] = [
      { date: '2026-01-01', waistIn: 14, neckIn: 15 }, // waist < neck → skipped
      { date: '2026-02-01', waistIn: 32, neckIn: 15 },
    ]
    const s = bodyFatSeries(bad, 70)
    expect(s).toHaveLength(1)
    expect(s[0].date).toBe('2026-02-01')
  })

  it('bodyFatSeries yields nothing without a height', () => {
    expect(bodyFatSeries(entries, 0)).toEqual([])
  })

  it('latestMeasurement returns the newest entry, or null when empty', () => {
    expect(latestMeasurement(entries)!.date).toBe('2026-03-01')
    expect(latestMeasurement([])).toBeNull()
  })
})
