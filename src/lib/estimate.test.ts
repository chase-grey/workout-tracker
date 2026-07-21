import { describe, expect, it } from 'vitest'
import {
  estimateSecs,
  formatDuration,
  isSaneDuration,
  median,
  medianTotalSec,
  remainingSecs,
  type SessionDuration,
} from './estimate'

describe('estimateSecs', () => {
  it('sums remainingSets × (work + rest)', () => {
    expect(
      estimateSecs([
        { remainingSets: 2, workSec: 40, restSec: 60 }, // 200
        { remainingSets: 3, workSec: 10, restSec: 90 }, // 300
      ]),
    ).toBe(500)
  })
  it('ignores negative remaining sets', () => {
    expect(estimateSecs([{ remainingSets: -1, workSec: 40, restSec: 60 }])).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(500)).toBe('~8 min')
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(20)).toBe('<1 min')
  })
})

describe('median', () => {
  it('handles odd and even lengths and an empty list', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

describe('isSaneDuration', () => {
  it('rejects durations that are too short or too long', () => {
    expect(isSaneDuration(30)).toBe(false) // under 2 min
    expect(isSaneDuration(30 * 60)).toBe(true)
    expect(isSaneDuration(5 * 60 * 60)).toBe(false) // over 4 hr
  })
})

const wd = (dayType: 'push' | 'pull', totalSec: number, restSec = 0): SessionDuration => ({
  date: '2026-07-21',
  kind: 'workout',
  dayType,
  totalSec,
  restSec,
})
const sd = (totalSec: number, restSec = 0): SessionDuration => ({
  date: '2026-07-21',
  kind: 'stretch',
  totalSec,
  restSec,
})

describe('medianTotalSec', () => {
  it('returns null until there are enough matching samples', () => {
    expect(medianTotalSec([wd('push', 3000), wd('push', 3600)], { kind: 'workout', dayType: 'push' })).toBeNull()
  })
  it('returns the median once enough samples exist', () => {
    const history = [wd('push', 3000), wd('push', 3600), wd('push', 4200)]
    expect(medianTotalSec(history, { kind: 'workout', dayType: 'push' })).toBe(3600)
  })
  it('separates workout day types and ignores other kinds and insane values', () => {
    const history = [
      wd('push', 3000),
      wd('push', 3600),
      wd('push', 4200),
      wd('push', 10), // too short — ignored
      wd('pull', 1800), // wrong day type — ignored for push
      sd(1200), // stretch — ignored for workout
    ]
    expect(medianTotalSec(history, { kind: 'workout', dayType: 'push' })).toBe(3600)
  })
  it('pools all stretches (no day type)', () => {
    const history = [sd(600), sd(900), sd(1200), wd('push', 3600)]
    expect(medianTotalSec(history, { kind: 'stretch' })).toBe(900)
  })
})

describe('remainingSecs', () => {
  const fallbackItems = [{ remainingSets: 5, workSec: 40, restSec: 60 }] // 500

  it('falls back to the structural estimate without enough history', () => {
    expect(
      remainingSecs({
        history: [wd('push', 3600)],
        sel: { kind: 'workout', dayType: 'push' },
        doneSteps: 0,
        totalSteps: 10,
        fallbackItems,
      }),
    ).toBe(500)
  })

  it('scales the learned median by the fraction of steps remaining', () => {
    const history = [wd('push', 3000), wd('push', 3600), wd('push', 4200)] // median 3600
    // 4 of 10 done → 60% remaining → 2160s
    expect(
      remainingSecs({
        history,
        sel: { kind: 'workout', dayType: 'push' },
        doneSteps: 4,
        totalSteps: 10,
        fallbackItems,
      }),
    ).toBe(2160)
  })

  it('returns 0 when everything is done', () => {
    const history = [sd(600), sd(900), sd(1200)] // median 900
    expect(
      remainingSecs({
        history,
        sel: { kind: 'stretch' },
        doneSteps: 8,
        totalSteps: 8,
        fallbackItems,
      }),
    ).toBe(0)
  })
})
