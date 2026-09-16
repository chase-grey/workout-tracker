import { describe, expect, it } from 'vitest'
import { parseTempo } from './tempo'
import { rhythmWavePath, rhythmWavePoint } from './rhythmWave'

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

