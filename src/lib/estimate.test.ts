import { describe, expect, it } from 'vitest'
import { estimateSecs, formatDuration } from './estimate'

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
