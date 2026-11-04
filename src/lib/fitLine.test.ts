import { describe, it, expect } from 'vitest'
import { fitLine, lineAt } from './fitLine'

describe('fitLine', () => {
  it('recovers an exact line with no doubt about the slope', () => {
    const fit = fitLine([0, 1, 2, 3], [10, 12, 14, 16])
    expect(fit).not.toBeNull()
    expect(fit!.slope).toBeCloseTo(2)
    expect(fit!.intercept).toBeCloseTo(10)
    expect(fit!.slopeSE).toBeCloseTo(0)
    expect(fit!.meanY).toBe(13)
    expect(lineAt(fit!, 5)).toBeCloseTo(20)
  })

  it('is less sure of a slope the more the points scatter', () => {
    const tidy = fitLine([0, 1, 2, 3, 4, 5], [0, 1.1, 1.9, 3.1, 3.9, 5.1])!
    const messy = fitLine([0, 1, 2, 3, 4, 5], [0, 2, 1, 4, 3, 6])!
    expect(tidy.slope).toBeCloseTo(1, 1)
    expect(messy.slope).toBeCloseTo(1, 0)
    expect(messy.slopeSE).toBeGreaterThan(tidy.slopeSE * 3)
  })

  it('is more sure of a slope the longer and denser the run', () => {
    const noise = (i: number) => Math.sin(i * 2.3) * 0.5
    const short = fitLine([0, 1, 2, 3], [0, 1, 2, 3].map((x, i) => x + noise(i)))!
    const long = fitLine(
      Array.from({ length: 30 }, (_, i) => i),
      Array.from({ length: 30 }, (_, i) => i + noise(i)),
    )!
    expect(long.slopeSE).toBeLessThan(short.slopeSE)
  })

  it('has nothing to say under three points, or with every x the same', () => {
    expect(fitLine([0, 1], [1, 2])).toBeNull()
    expect(fitLine([2, 2, 2], [1, 2, 3])).toBeNull()
    expect(fitLine([], [])).toBeNull()
  })
})
