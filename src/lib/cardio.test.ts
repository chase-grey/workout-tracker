import { describe, it, expect } from 'vitest'
import {
  cardioDates,
  cardioMinutesByWeek,
  cardioSummary,
  mergeCardio,
  type CardioEntry,
} from './cardio'

function entry(over: Partial<CardioEntry> & Pick<CardioEntry, 'id' | 'date'>): CardioEntry {
  return { kind: 'run', minutes: 30, ...over }
}

describe('cardioDates', () => {
  it('returns distinct dates, ascending', () => {
    const entries = [
      entry({ id: 'a', date: '2026-07-09' }),
      entry({ id: 'b', date: '2026-07-06' }),
      entry({ id: 'c', date: '2026-07-09' }),
      entry({ id: 'd', date: '2026-07-08' }),
    ]
    expect(cardioDates(entries)).toEqual(['2026-07-06', '2026-07-08', '2026-07-09'])
  })

  it('is empty with no entries', () => {
    expect(cardioDates([])).toEqual([])
  })
})

describe('cardioMinutesByWeek', () => {
  it('keys each week by its Monday', () => {
    const weeks = cardioMinutesByWeek([
      entry({ id: 'a', date: '2026-07-06', minutes: 20 }), // Monday
      entry({ id: 'b', date: '2026-07-12', minutes: 25 }), // Sunday, same week
      entry({ id: 'c', date: '2026-07-13', minutes: 40 }), // next Monday
    ])
    expect([...weeks.keys()].sort()).toEqual(['2026-07-06', '2026-07-13'])
    expect(weeks.get('2026-07-13')).toBe(40)
  })

  it('sums two entries in the same week', () => {
    const weeks = cardioMinutesByWeek([
      entry({ id: 'a', date: '2026-07-07', minutes: 20 }),
      entry({ id: 'b', date: '2026-07-10', minutes: 35 }),
    ])
    expect(weeks.get('2026-07-06')).toBe(55)
  })

  it('is empty with no entries', () => {
    expect(cardioMinutesByWeek([]).size).toBe(0)
  })
})

describe('mergeCardio', () => {
  it('lets a fetched copy replace the local one with the same id', () => {
    const local = [entry({ id: 'x', date: '2026-07-06', minutes: 20 })]
    const fetched = [entry({ id: 'x', date: '2026-07-06', minutes: 45 })]
    const merged = mergeCardio(local, fetched)
    expect(merged).toHaveLength(1)
    expect(merged[0].minutes).toBe(45)
  })

  it('keeps local entries the fetch does not have', () => {
    const merged = mergeCardio(
      [entry({ id: 'local', date: '2026-07-06' })],
      [entry({ id: 'remote', date: '2026-07-07' })],
    )
    expect(merged.map((e) => e.id).sort()).toEqual(['local', 'remote'])
  })

  it('orders newest date first', () => {
    const merged = mergeCardio(
      [entry({ id: 'a', date: '2026-07-01' }), entry({ id: 'b', date: '2026-07-20' })],
      [entry({ id: 'c', date: '2026-07-10' })],
    )
    expect(merged.map((e) => e.date)).toEqual(['2026-07-20', '2026-07-10', '2026-07-01'])
  })
})

describe('cardioSummary', () => {
  it('shows just the minutes without a distance', () => {
    expect(cardioSummary({ minutes: 32 })).toBe('32 min')
  })

  it('shows minutes and distance', () => {
    expect(cardioSummary({ minutes: 32, distanceMi: 3.1 })).toBe('32 min · 3.1 mi')
  })

  it('trims the distance to at most two decimals', () => {
    expect(cardioSummary({ minutes: 32, distanceMi: 3.456 })).toBe('32 min · 3.46 mi')
    expect(cardioSummary({ minutes: 32, distanceMi: 2 })).toBe('32 min · 2 mi')
  })

  it('rounds the minutes to a whole number', () => {
    expect(cardioSummary({ minutes: 31.6 })).toBe('32 min')
  })
})
