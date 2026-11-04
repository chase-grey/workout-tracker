import { describe, expect, it } from 'vitest'
import { FEATHER, spreadMode, spreadStyle, type SpreadMode } from './glowSpread'
import type { RhythmVariant } from './rhythmVariant'

const ALL: RhythmVariant[] = [
  'orb', 'square', 'rings', 'tide', 'petals', 'bars', 'halo',
  'reach', 'fold', 'dive', 'drip', 'stairs', 'press',
  'anvil', 'chevrons', 'gauge', 'wave',
  'beads', 'thread', 'wake', 'grass', 'slats', 'tiles', 'capsule', 'kite', 'helix', 'fill', 'scan',
]
const MASKED: SpreadMode[] = ['bloom', 'rise', 'fall', 'sweep', 'clock', 'split']

/** The stop positions of a mask, in order, with whether each is shown. */
function stops(mask: string): [number, boolean][] {
  const inner = mask.slice(mask.indexOf('(') + 1, -1)
  return inner
    .split(', ')
    .slice(1)
    .map((stop) => {
      const [colour, pos] = stop.split(' ')
      return [parseFloat(pos), colour === '#000']
    })
}

describe('spreadMode', () => {
  it('gives every shape a way for the white to arrive', () => {
    for (const v of ALL) expect(spreadMode(v)).toBeTruthy()
  })
  it('leaves the wave to paint its own', () => {
    expect(spreadMode('wave')).toBe('own')
  })
})

describe('spreadStyle', () => {
  it('has nothing to add for a shape that paints its own', () => {
    expect(spreadStyle('own', 0.5, 'white')).toEqual({})
    expect(spreadStyle('own', 0.5, 'accent')).toEqual({})
  })

  it('crossfades a dissolve, the two drawings adding up to one', () => {
    expect(spreadStyle('dissolve', 0.3, 'white').opacity).toBeCloseTo(0.3)
    expect(spreadStyle('dissolve', 0.3, 'accent').opacity).toBeCloseTo(0.7)
    expect(spreadStyle('dissolve', 0, 'white').opacity).toBe(0)
    expect(spreadStyle('dissolve', 1, 'accent').opacity).toBe(0)
  })

  it.each(MASKED)('%s: at 0 the white is wholly off the frame, at 1 wholly on it', (mode) => {
    const atStart = stops(spreadStyle(mode, 0, 'white').maskImage!)
    if (mode === 'split') {
      // The band has no height: every stop sits on the centre line.
      expect(atStart.every(([pos]) => pos === 50)).toBe(true)
    } else {
      // Nowhere inside the frame is the white solid.
      for (const [pos, white] of atStart) if (white) expect(pos).toBeLessThanOrEqual(0)
      expect(atStart[1]).toEqual([0, false])
    }
    const atEnd = stops(spreadStyle(mode, 1, 'white').maskImage!)
    if (mode === 'split') {
      expect(atEnd.map(([pos]) => pos)).toEqual([0, 0, 100, 100])
    } else {
      expect(atEnd[0]).toEqual([mode === 'clock' ? 360 : 100, true])
    }
  })

  it.each(MASKED)('%s: the accent drawing is the white one turned inside out', (mode) => {
    const white = stops(spreadStyle(mode, 0.4, 'white').maskImage!)
    const accent = stops(spreadStyle(mode, 0.4, 'accent').maskImage!)
    expect(accent.map(([pos]) => pos)).toEqual(white.map(([pos]) => pos))
    expect(accent.map(([, on]) => on)).toEqual(white.map(([, on]) => !on))
  })

  it.each(MASKED)('%s: the white only grows', (mode) => {
    let last = -Infinity
    for (let s = 0; s <= 1.001; s += 0.1) {
      const shown = stops(spreadStyle(mode, s, 'white').maskImage!)
      // How far the white reaches: where it stops being solid, or for the split
      // how tall its band is.
      const reach = mode === 'split' ? shown[2][0] - shown[1][0] : shown[0][0]
      expect(reach).toBeGreaterThanOrEqual(last)
      last = reach
    }
  })

  it('keeps a soft edge a feather wide', () => {
    const [[solid], [clear]] = stops(spreadStyle('rise', 0.5, 'white').maskImage!)
    expect(clear - solid).toBeCloseTo(FEATHER)
  })

  it('sets both mask spellings', () => {
    const style = spreadStyle('bloom', 0.5, 'white')
    expect(style.WebkitMaskImage).toBe(style.maskImage)
  })

  it('clamps an amount past either end', () => {
    expect(spreadStyle('dissolve', 1.5, 'white').opacity).toBe(1)
    expect(spreadStyle('bloom', -1, 'white')).toEqual(spreadStyle('bloom', 0, 'white'))
  })
})
