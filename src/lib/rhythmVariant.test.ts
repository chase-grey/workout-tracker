import { describe, expect, it, vi } from 'vitest'
import { createRhythmVariantSelector, type RhythmVariant } from './rhythmVariant'

describe('createRhythmVariantSelector', () => {
  it('reuses one animation for both sides, then draws again for the next set', () => {
    const draw = vi
      .fn<(tempo: string) => RhythmVariant>()
      .mockReturnValueOnce('orb')
      .mockReturnValueOnce('square')
    const select = createRhythmVariantSelector(draw)

    expect(select('floss:0', '3 down · 3 up')).toBe('orb')
    expect(select('floss:0', '3 down · 3 up')).toBe('orb')
    expect(select('floss:1', '3 down · 3 up')).toBe('square')
    expect(draw).toHaveBeenCalledTimes(2)
  })

  it("draws again for the second side when the first side's shape was hidden", () => {
    const draw = vi
      .fn<(tempo: string) => RhythmVariant>()
      .mockReturnValueOnce('orb')
      .mockReturnValueOnce('rings')
    const hidden = new Set<RhythmVariant>()
    const select = createRhythmVariantSelector(draw, (v) => hidden.has(v))

    expect(select('floss:0', '3 down · 3 up')).toBe('orb')
    hidden.add('orb')
    expect(select('floss:0', '3 down · 3 up')).toBe('rings')
  })
})
