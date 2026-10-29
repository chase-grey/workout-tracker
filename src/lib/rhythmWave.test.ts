import { describe, expect, it } from 'vitest'
import { parseTempo } from './tempo'
import {
  rhythmWaveEnd,
  rhythmWaveGlowStart,
  rhythmWavePath,
  rhythmWavePoint,
  rhythmWaveTailPath,
} from './rhythmWave'
import { repGlow } from './rhythmMotion'

describe('push/pull waveform', () => {
  const phases = parseTempo('5s press down ; 5s rest ; 5s pull up ; 5s rest')

  it('holds down, neutral, up, neutral after each short rounded transition', () => {
    for (const [idx, y] of [78, 50, 22, 50].entries()) {
      for (const progress of [0.12, 0.5, 0.99, 1]) {
        const [x, actualY] = rhythmWavePoint(phases, idx, progress)
        expect(x).toBeCloseTo((idx + progress) * 25)
        expect(actualY).toBe(y)
      }
    }
  })

  it('starts each transition at the phase boundary and eases into its new level', () => {
    expect(rhythmWavePoint(phases, 0, 0)).toEqual([0, 50])
    expect(rhythmWavePoint(phases, 0, 0.06)).toEqual([1.5, 64])
    expect(rhythmWavePoint(phases, 0, 0.12)).toEqual([3, 78])
    for (let i = 1; i < phases.length; i++) {
      expect(rhythmWavePoint(phases, i, 0)).toEqual(rhythmWavePoint(phases, i - 1, 1))
    }
  })

  it('loops without a vertical jump and scrolls by exactly one cycle', () => {
    const [endX, endY] = rhythmWavePoint(phases, 3, 1)
    const [startX, startY] = rhythmWavePoint(phases, 0, 0)
    expect(endY).toBe(startY)
    expect(endX - startX).toBe(100)

    // Copies outside the viewport replace each other when the clock wraps.
    const path = rhythmWavePath(phases)
    expect(path).toContain('C 1 50 2 78 3 78 L 25 78')
    expect(path).toContain('C 101 50 102 78 103 78 L 125 78')
    expect(path.startsWith('M -100 50')).toBe(true)
    expect(path.endsWith('L 300 50')).toBe(true)
  })

  it('keeps horizontal motion proportional to elapsed time for uneven phases', () => {
    const uneven = parseTempo('2s push down ; 1s rest ; 4s pull up ; 3s rest')
    expect(rhythmWavePoint(uneven, 1, 0)).toEqual([20, 78])
    expect(rhythmWavePoint(uneven, 2, 0)).toEqual([30, 50])
    expect(rhythmWavePoint(uneven, 2, 0.5)).toEqual([50, 22])
    expect(rhythmWavePoint(uneven, 3, 0)).toEqual([70, 22])
  })
})

describe('where the wave turns white', () => {
  const phases = parseTempo('5s press down ; 5s rest ; 5s pull up ; 5s rest')
  // The shoulder into a phase: 0.6 s of a 20 s rep, so 3 wave units.
  const shoulder = 3

  it('starts on the flat of the rest before the closing rep when that rep drops its own', () => {
    expect(rhythmWaveGlowStart(phases, 1, 5, true, true)).toBe(375 + shoulder)
    expect(rhythmWaveGlowStart(phases, 4, 5, true, true)).toBe(75 + shoulder)
    expect(rhythmWaveGlowStart(phases, 5, 5, true, true)).toBe(-25 + shoulder)
    // The wave has already landed on the resting line where the white begins.
    const [x, y] = rhythmWavePoint(phases, 3, shoulder / 25)
    expect(x).toBe(75 + shoulder)
    expect(y).toBe(50)
  })

  it('starts at the closing rep, or past the target for a tapped set', () => {
    expect(rhythmWaveGlowStart(phases, 3, 5, true, false)).toBe(200 + shoulder)
    expect(rhythmWaveGlowStart(phases, 3, 5, false, false)).toBe(300 + shoulder)
    expect(rhythmWaveGlowStart(phases, 1, 1, true, true)).toBe(shoulder)
    expect(rhythmWaveGlowStart(phases, 3, undefined, true, true)).toBeNull()
  })

  it('is reached by the dot one shoulder after the guide turns white', () => {
    for (const [endsItself, skip] of [[true, true], [true, false], [false, false]] as const) {
      for (let rep = 1; rep <= 6; rep++) {
        for (let idx = 0; idx < phases.length; idx++) {
          for (const progress of [0, 0.5]) {
            const [x] = rhythmWavePoint(phases, idx, progress)
            const start = rhythmWaveGlowStart(phases, rep, 5, endsItself, skip)!
            const lit = repGlow(rep, 5, endsItself, skip && idx >= 3) === 'done'
            expect(x >= start - shoulder).toBe(lit)
          }
        }
      }
    }
  })
})

describe('where the wave ends', () => {
  const phases = parseTempo('5s press down ; 5s rest ; 5s pull up ; 5s rest')

  it('ends with the last working phase when the closing rep drops its rest', () => {
    expect(rhythmWaveEnd(phases, 1, 5, true, true)).toBe(475)
    expect(rhythmWaveEnd(phases, 5, 5, true, true)).toBe(75)
    expect(rhythmWaveEnd(phases, 1, 1, true, true)).toBe(75)
  })

  it('ends with the closing rep otherwise, and not at all for a tapped set', () => {
    expect(rhythmWaveEnd(phases, 3, 5, true, false)).toBe(300)
    expect(rhythmWaveEnd(phases, 3, 5, false, false)).toBeNull()
    expect(rhythmWaveEnd(phases, 3, undefined, true, true)).toBeNull()
  })

  it('always lies past where the white begins', () => {
    for (const skip of [true, false]) {
      for (const reps of [1, 2, 5]) {
        for (let rep = 1; rep <= reps; rep++) {
          const start = rhythmWaveGlowStart(phases, rep, reps, true, skip)!
          expect(rhythmWaveEnd(phases, rep, reps, true, skip)!).toBeGreaterThan(start)
        }
      }
    }
  })

  it('tails off from the level the set ends at onto the resting line', () => {
    // Dropping the rest, the set ends at the top of the pull; the tail borrows the
    // rest's shoulder to come down.
    expect(rhythmWaveTailPath(phases, true, true)).toBe('M 0 22 C 1 22 2 50 3 50 L 1000 50')
    // Ending on the rest, it is already there.
    expect(rhythmWaveTailPath(phases, true, false)).toBe('M 0 50 C 1 50 2 50 3 50 L 1000 50')
  })
})
