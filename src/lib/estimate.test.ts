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

const dur = (dayType: 'push' | 'pull', seconds: number): SessionDuration => ({
  date: '2026-07-21',
  dayType,
  seconds,
})

describe('medianTotalSec', () => {
  it('returns null until there are enough samples for that day type', () => {
    const history = [dur('push', 3000), dur('push', 3600)]
    expect(medianTotalSec(history, 'push')).toBeNull()
  })
  it('returns the median once enough samples exist', () => {
    const history = [dur('push', 3000), dur('push', 3600), dur('push', 4200)]
    expect(medianTotalSec(history, 'push')).toBe(3600)
  })
  it('ignores implausible durations and other day types', () => {
    const history = [
      dur('push', 3000),
      dur('push', 3600),
      dur('push', 4200),
      dur('push', 10), // too short — ignored
      dur('pull', 1800), // wrong day — ignored
    ]
    expect(medianTotalSec(history, 'push')).toBe(3600)
  })
})

describe('remainingSecs', () => {
  const fallbackItems = [{ remainingSets: 5, workSec: 40, restSec: 60 }] // 500

  it('falls back to the structural estimate without enough history', () => {
    expect(
      remainingSecs({
        history: [dur('push', 3600)],
        dayType: 'push',
        doneSets: 0,
        totalSets: 10,
        fallbackItems,
      }),
    ).toBe(500)
  })

  it('scales the learned median by the fraction of sets remaining', () => {
    const history = [dur('push', 3000), dur('push', 3600), dur('push', 4200)] // median 3600
    // 4 of 10 sets done → 60% remaining → 2160s
    expect(
      remainingSecs({ history, dayType: 'push', doneSets: 4, totalSets: 10, fallbackItems }),
    ).toBe(2160)
  })

  it('returns 0 when all sets are done', () => {
    const history = [dur('push', 3000), dur('push', 3600), dur('push', 4200)]
    expect(
      remainingSecs({ history, dayType: 'push', doneSets: 10, totalSets: 10, fallbackItems }),
    ).toBe(0)
  })
})
