import { describe, expect, it } from 'vitest'
import {
  createWave,
  drawBubble,
  impulseWave,
  splashStrength,
  stepWave,
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

/** Draws in the order drawBubble takes them: size, buoyancy, drift. */
const rolls =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0.5

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

describe('splashStrength', () => {
  it('keeps every splash visible but never bigger than a full one', () => {
    expect(splashStrength(0, 0)).toBeGreaterThan(0.2)
    expect(splashStrength(1, 1)).toBeCloseTo(1, 10)
  })

  it('needs both a big bubble and a fast one for the biggest splash', () => {
    const biggest = splashStrength(1, 1)
    expect(splashStrength(1, 0)).toBeLessThan(biggest)
    expect(splashStrength(0, 1)).toBeLessThan(biggest)
    // Size counts for a little more than the speed it arrived at.
    expect(splashStrength(1, 0)).toBeGreaterThan(splashStrength(0, 1))
  })

  it('grows with the bubble, holding the speed still', () => {
    const sizes = [0, 0.25, 0.5, 0.75, 1].map((s) => splashStrength(s, 0.5))
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThan(sizes[i - 1])
  })

  it('makes small splashes the common case', () => {
    const draws = Array.from({ length: 1000 }, (_, i) => splashStrength(i / 999, i / 999))
    const small = draws.filter((s) => s < 0.6).length
    const large = draws.filter((s) => s > 0.85).length
    expect(small / draws.length).toBeGreaterThan(0.4)
    expect(large / draws.length).toBeLessThan(0.2)
  })

  it('clamps a stray draw', () => {
    expect(splashStrength(-1, -1)).toBe(splashStrength(0, 0))
    expect(splashStrength(2, 2)).toBe(splashStrength(1, 1))
  })
})

describe('drawBubble', () => {
  it('keeps the surface for the buoyant few', () => {
    const bubbles = Array.from({ length: 2000 }, () => drawBubble())
    const surfaced = bubbles.filter((b) => b.surfaces).length / bubbles.length
    // Often enough to catch one in a two-minute rest, rare enough that the water
    // has time to go quiet in between.
    expect(surfaced).toBeGreaterThan(0.05)
    expect(surfaced).toBeLessThan(0.3)
  })

  it('sends a buoyant bubble all the way up, and a feeble one barely off the floor', () => {
    const buoyant = drawBubble(rolls(0.5, 1, 0.5))
    const feeble = drawBubble(rolls(0.5, 0, 0.5))
    expect(buoyant.surfaces).toBe(true)
    expect(buoyant.climb).toBeGreaterThan(0.9)
    expect(feeble.surfaces).toBe(false)
    expect(feeble.climb).toBeLessThan(0.15)
  })

  it('rushes the buoyant ones up and lets a doomed one go quickly', () => {
    const rushed = drawBubble(rolls(0.5, 1, 0.5))
    const laboured = drawBubble(rolls(0.5, 0.86, 0.5))
    expect(laboured.surfaces).toBe(true)
    expect(rushed.life).toBeLessThan(laboured.life)
    // A bubble that never makes it is done with sooner than any climb.
    expect(drawBubble(rolls(0.5, 0.5, 0.5)).life).toBeLessThan(rushed.life)
  })

  it('gives a doomed bubble no splash to speak of', () => {
    const doomed = drawBubble(rolls(1, 0.5, 0.5))
    expect(doomed.surfaces).toBe(false)
    expect(doomed.splash).toBe(0)
    expect(doomed.lift).toBe(0)
    expect(doomed.bump).toBe(0)
  })

  it('saves the biggest splash for the big buoyant bubble', () => {
    const bigAndBuoyant = drawBubble(rolls(1, 1, 0.5))
    const smallAndBuoyant = drawBubble(rolls(0, 1, 0.5))
    const bigAndJustBuoyant = drawBubble(rolls(1, 0.75, 0.5))
    expect(bigAndBuoyant.size).toBeGreaterThan(smallAndBuoyant.size * 2)
    expect(bigAndBuoyant.splash).toBeGreaterThan(smallAndBuoyant.splash)
    expect(bigAndBuoyant.splash).toBeGreaterThan(bigAndJustBuoyant.splash)
    // And it throws the surface hardest, over the widest patch, highest.
    expect(bigAndBuoyant.lift).toBeGreaterThan(smallAndBuoyant.lift)
    expect(bigAndBuoyant.bump).toBeGreaterThan(smallAndBuoyant.bump)
    expect(bigAndBuoyant.pop).toBeGreaterThan(bigAndJustBuoyant.pop)
  })

  it('sizes the wave it throws off the bubble, not off luck', () => {
    // Same buoyancy, so the only thing between these two is how big they are.
    const big = drawBubble(rolls(1, 0.9, 0.5))
    const small = drawBubble(rolls(0.1, 0.9, 0.5))
    expect(big.lift).toBeGreaterThan(small.lift)
    expect(big.bump).toBeGreaterThan(small.bump)
  })

  it('draws mostly small bubbles, and wanders each one either way', () => {
    const bubbles = Array.from({ length: 1000 }, (_, i) => drawBubble(rolls(i / 999, 0.5, i / 999)))
    const sizes = bubbles.map((b) => b.size)
    const mid = (Math.min(...sizes) + Math.max(...sizes)) / 2
    expect(sizes.filter((s) => s < mid).length / sizes.length).toBeGreaterThan(0.6)
    const drifts = bubbles.map((b) => b.drift)
    expect(Math.min(...drifts)).toBeLessThan(0)
    expect(Math.max(...drifts)).toBeGreaterThan(0)
  })
})
