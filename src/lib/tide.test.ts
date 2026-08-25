import { describe, expect, it } from 'vitest'
import {
  createWave,
  impulseWave,
  stepWave,
  waveHeightAt,
  waveSurfacePath,
  WAVE_NODES,
  type Wave,
} from './tide'

/** How far the surface is displaced anywhere, up or down. */
const peak = (y: number[]) => Math.max(...y.map(Math.abs))

/** Net water held above the flat line: what a lift that didn't pay for itself leaves. */
const volume = (y: number[]) => y.reduce((sum, n) => sum + n, 0)

/** Run `seconds` of simulation the way the render loop does — a frame at a time. */
const run = (wave: Wave, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepWave(wave, 1 / 60)
}

/** Every y coordinate in a path: the numbers land in x, y pairs. */
const pathYs = (d: string) =>
  d
    .split(' ')
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .filter((_, i) => i % 2 === 1)

const MID = Math.floor((WAVE_NODES - 1) / 2)
const BURST = 5

describe('impulseWave', () => {
  it('lifts the water most where the bubble broke through', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    // Negative is up, so the burst point is the lowest y in the row.
    expect(wave.y[MID]).toBeLessThan(-4.5)
    expect(wave.y[MID]).toBeLessThan(wave.y[MID - 4])
    // The far wall is left all but untouched — nothing but the tail of the dip.
    expect(Math.abs(wave.y[0])).toBeLessThan(BURST * 0.05)
  })

  it('puts the bump at the wall when the bubble surfaces at the edge', () => {
    const wave = createWave()
    impulseWave(wave, 0, BURST)
    expect(wave.y[0]).toBeLessThan(-4.5)
    expect(Math.abs(wave.y[WAVE_NODES - 1])).toBeLessThan(BURST * 0.05)
  })

  it('scales with the splash strength', () => {
    const small = createWave()
    const big = createWave()
    impulseWave(small, 0.5, 2)
    impulseWave(big, 0.5, 6)
    expect(peak(big.y)).toBeGreaterThan(peak(small.y) * 2)
  })

  it('lifts a wider patch of water for a bigger bubble', () => {
    const narrow = createWave()
    const wide = createWave()
    impulseWave(narrow, 0.5, BURST, 1.3)
    impulseWave(wide, 0.5, BURST, 3.8)
    // Same height at the burst, but the wide one has carried water further out.
    expect(wide.y[MID]).toBeCloseTo(narrow.y[MID], 5)
    expect(wide.y[MID - 4]).toBeLessThan(narrow.y[MID - 4] * 2)
  })

  it('moves water rather than adding it, so the level is left where it was', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    // The crest is paid for by the dip around it: plenty of water is displaced,
    // and what's left over is a rounding error next to the lift.
    expect(peak(wave.y)).toBeGreaterThan(4.5)
    expect(Math.abs(volume(wave.y))).toBeLessThan(peak(wave.y) * 0.05)
  })

  it('leaves the mean level alone through a whole rest of pops', () => {
    const wave = createWave()
    for (let i = 0; i < 12; i++) {
      impulseWave(wave, (i * 7) % 10 / 10, BURST)
      run(wave, 4)
    }
    expect(volume(wave.y) / WAVE_NODES).toBeCloseTo(0, 1)
  })
})

describe('stepWave', () => {
  it('leaves a flat surface flat', () => {
    const wave = createWave()
    run(wave, 1)
    expect(peak(wave.y)).toBe(0)
  })

  it('spreads the bump out to water the bubble never touched', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST, 1.3)
    const before = Math.abs(wave.y[0])
    run(wave, 1.5)
    expect(Math.abs(wave.y[0])).toBeGreaterThan(before + 0.05)
  })

  it('oscillates: the lifted water swings back down through flat', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    let crossed = false
    for (let t = 0; t < 4; t += 1 / 60) {
      stepWave(wave, 1 / 60)
      if (wave.y[MID] > 0) crossed = true
    }
    expect(crossed).toBe(true)
  })

  it('rolls on for seconds after the pop, the way a big body of water does', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    run(wave, 3)
    // Still plainly moving three seconds later — this is the whole reason the
    // damping is what it is.
    expect(peak(wave.y)).toBeGreaterThan(BURST * 0.15)
    run(wave, 12)
    expect(peak(wave.y)).toBeLessThan(BURST * 0.1)
  })

  it('drops the backlog after a long gap rather than replaying it', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    const before = peak(wave.y)
    stepWave(wave, 600)
    // A handful of steps at most — nowhere near 600 seconds of settling.
    expect(peak(wave.y)).toBeGreaterThan(before * 0.2)
    expect(wave.carry).toBe(0)
    expect(wave.y.every(Number.isFinite)).toBe(true)
  })

  it('advances at the same rate whatever the frame rate', () => {
    const sixty = createWave()
    const thirty = createWave()
    impulseWave(sixty, 0.5, BURST)
    impulseWave(thirty, 0.5, BURST)
    for (let i = 0; i < 60; i++) stepWave(sixty, 1 / 60)
    for (let i = 0; i < 30; i++) stepWave(thirty, 1 / 30)
    expect(peak(thirty.y)).toBeCloseTo(peak(sixty.y), 5)
  })
})

describe('waveSurfacePath', () => {
  it('spans the vessel at the water line when flat', () => {
    const path = waveSurfacePath(createWave(), 40)
    expect(path.startsWith('M 0 40')).toBe(true)
    expect(path.endsWith('L 100 40')).toBe(true)
    expect(pathYs(path).every((y) => y === 40)).toBe(true)
  })

  it('follows the bump once the water is disturbed', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, 6)
    // The curve reaches well above the water line where the bubble burst, and
    // still meets both walls near it.
    const ys = pathYs(waveSurfacePath(wave, 40))
    expect(Math.min(...ys)).toBeLessThan(36)
    expect(ys[0]).toBeCloseTo(40, 0)
    expect(ys[ys.length - 1]).toBeCloseTo(40, 0)
  })
})

describe('waveHeightAt', () => {
  it('reads flat water as flat wherever it is asked', () => {
    const wave = createWave()
    for (const at of [0, 0.13, 0.5, 0.87, 1]) expect(waveHeightAt(wave, at)).toBe(0)
  })

  it('reads the bump where the bubble burst, and the walls it never reached', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    // Negative is up: the water over the burst stands well clear of the line.
    expect(waveHeightAt(wave, 0.5)).toBeLessThan(-4.5)
    expect(Math.abs(waveHeightAt(wave, 0))).toBeLessThan(BURST * 0.05)
  })

  it('lands between the nodes either side of it', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    const step = 1 / (WAVE_NODES - 1)
    const [lo, hi] = [waveHeightAt(wave, 0.5 - step), waveHeightAt(wave, 0.5)]
    const mid = waveHeightAt(wave, 0.5 - step / 2)
    expect(mid).toBeGreaterThan(Math.min(lo, hi))
    expect(mid).toBeLessThan(Math.max(lo, hi))
  })

  it('clamps a stray reading to the wall rather than reading off the end', () => {
    const wave = createWave()
    impulseWave(wave, 0, BURST)
    expect(waveHeightAt(wave, -1)).toBe(wave.y[0])
    expect(waveHeightAt(wave, 2)).toBeCloseTo(wave.y[WAVE_NODES - 1], 10)
  })
})
