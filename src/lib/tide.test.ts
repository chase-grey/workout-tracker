import { describe, expect, it } from 'vitest'
import {
  createWave,
  impulseWave,
  splashStrength,
  stepWave,
  waveSurfacePath,
  WAVE_NODES,
  type Wave,
} from './tide'

/** How far the surface is displaced anywhere, up or down. */
const peak = (y: number[]) => Math.max(...y.map(Math.abs))

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
    expect(wave.y[0]).toBeCloseTo(0, 3)
  })

  it('puts the bump at the wall when the bubble surfaces at the edge', () => {
    const wave = createWave()
    impulseWave(wave, 0, BURST)
    expect(wave.y[0]).toBeLessThan(-4.5)
    expect(wave.y[WAVE_NODES - 1]).toBeCloseTo(0, 3)
  })

  it('scales with the splash strength', () => {
    const small = createWave()
    const big = createWave()
    impulseWave(small, 0.5, 2)
    impulseWave(big, 0.5, 6)
    expect(peak(big.y)).toBeGreaterThan(peak(small.y) * 2)
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
    impulseWave(wave, 0.5, BURST)
    expect(wave.y[0]).toBeCloseTo(0, 3)
    run(wave, 0.4)
    expect(Math.abs(wave.y[0])).toBeGreaterThan(0.01)
  })

  it('oscillates: the lifted water swings back down through flat', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    let crossed = false
    for (let t = 0; t < 1.5; t += 1 / 60) {
      stepWave(wave, 1 / 60)
      if (wave.y[MID] > 0) crossed = true
    }
    expect(crossed).toBe(true)
  })

  it('is still moving shortly after the pop and settled a few seconds later', () => {
    const wave = createWave()
    impulseWave(wave, 0.5, BURST)
    run(wave, 0.25)
    expect(peak(wave.y)).toBeGreaterThan(BURST * 0.05)
    run(wave, 3)
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
    // still meets both walls at it.
    const ys = pathYs(waveSurfacePath(wave, 40))
    expect(Math.min(...ys)).toBeLessThan(36)
    expect(ys[0]).toBeCloseTo(40, 1)
    expect(ys[ys.length - 1]).toBeCloseTo(40, 1)
  })
})

describe('splashStrength', () => {
  it('keeps every splash visible but never bigger than a full one', () => {
    expect(splashStrength(0)).toBeGreaterThan(0.2)
    expect(splashStrength(1)).toBeCloseTo(1, 10)
  })

  it('makes small splashes the common case', () => {
    const draws = Array.from({ length: 1000 }, (_, i) => splashStrength(i / 999))
    const small = draws.filter((s) => s < 0.6).length
    const large = draws.filter((s) => s > 0.85).length
    expect(small / draws.length).toBeGreaterThan(0.6)
    expect(large / draws.length).toBeLessThan(0.15)
  })

  it('clamps a stray draw', () => {
    expect(splashStrength(-1)).toBe(splashStrength(0))
    expect(splashStrength(2)).toBe(splashStrength(1))
  })
})
