import { describe, it, expect } from 'vitest'
import { LOCAL_MIN_POINTS, fitLine, lineAt, localDiffSE, localTrend } from './fitLine'

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

describe('localTrend', () => {
  const xs = Array.from({ length: 40 }, (_, i) => i)

  it('reads an exact line back anywhere, with no scatter', () => {
    const t = localTrend(xs, xs.map((x) => 100 + 0.5 * x), 10)!
    expect(t.at(0).value).toBeCloseTo(100)
    expect(t.at(20).value).toBeCloseTo(110)
    expect(t.at(39).value).toBeCloseTo(119.5)
    expect(t.at(39).slope).toBeCloseTo(0.5)
    expect(t.sigma2).toBeCloseTo(0)
    expect(t.at(7).kernel.reduce((s, k) => s + k, 0)).toBeCloseTo(1)
  })

  it('ends where the latest points are, not where the whole span would put them', () => {
    // Flat for a month, then two pounds on in the last ten days.
    const ys = xs.map((x) => (x < 30 ? 180 : 180 + 0.2 * (x - 30)))
    const local = localTrend(xs, ys, 10)!
    const whole = fitLine(xs, ys)!
    expect(local.at(39).value).toBeCloseTo(181.8, 1)
    expect(lineAt(whole, 39)).toBeLessThan(181.3)
    expect(local.at(10).value).toBeCloseTo(180, 1)
  })

  it('opens the window out until it holds enough points', () => {
    // Readings a week apart with a two-day window: still a line through six of them.
    const weekly = Array.from({ length: 8 }, (_, i) => i * 7)
    const t = localTrend(weekly, weekly.map((x) => 20 - x / 70), 2)!
    expect(t.at(49).value).toBeCloseTo(19.3, 2)
    expect(t.at(49).kernel.filter((k) => k !== 0).length).toBeGreaterThanOrEqual(LOCAL_MIN_POINTS)
  })

  it('knows two readings close together share their doubt', () => {
    const noise = (i: number) => Math.sin(i * 2.3) * 0.8
    const t = localTrend(xs, xs.map((x, i) => 180 + 0.1 * x + noise(i)), 10)!
    const a = t.at(5)
    expect(localDiffSE(t, a, a)).toBe(0)
    const near = localDiffSE(t, t.at(6), a)
    const far = localDiffSE(t, t.at(35), a)
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near * 3)
    expect(t.sigma2).toBeGreaterThan(0.1)
  })

  it('has nothing to say under three points, or with every x the same', () => {
    expect(localTrend([0, 1], [1, 2], 5)).toBeNull()
    expect(localTrend([2, 2, 2], [1, 2, 3], 5)).toBeNull()
  })
})
