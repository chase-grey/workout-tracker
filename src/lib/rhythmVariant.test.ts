import { describe, expect, it, vi } from 'vitest'
import { createRhythmVariantSelector, isFlossVariant, type RhythmVariant } from './rhythmVariant'

describe('createRhythmVariantSelector', () => {
  it('reuses one animation for both sides, then draws again for the next set', () => {
    const draw = vi
      .fn<(tempo: string, forwardBack: boolean) => RhythmVariant>()
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
      .fn<(tempo: string, forwardBack: boolean) => RhythmVariant>()
      .mockReturnValueOnce('orb')
      .mockReturnValueOnce('rings')
    const hidden = new Set<RhythmVariant>()
    const select = createRhythmVariantSelector(draw, (v) => hidden.has(v))

    expect(select('floss:0', '3 down · 3 up')).toBe('orb')
    hidden.add('orb')
    expect(select('floss:0', '3 down · 3 up')).toBe('rings')
  })

  it('tells the draw when the set is a forward/back one, so the floss gets its own figures', () => {
    const draw = vi.fn<(tempo: string, forwardBack: boolean) => RhythmVariant>().mockReturnValue('thread')
    const select = createRhythmVariantSelector(draw)

    expect(select('floss:0', '3s forward · 3s back', true)).toBe('thread')
    expect(draw).toHaveBeenCalledWith('3s forward · 3s back', true)
    select('pike:0', '5 press down · 3 rest · 5 pull up · 3 rest')
    expect(draw).toHaveBeenLastCalledWith('5 press down · 3 rest · 5 pull up · 3 rest', false)
  })
})

describe('isFlossVariant', () => {
  it('knows the floss figures from the other families', () => {
    expect(isFlossVariant('beads')).toBe(true)
    expect(isFlossVariant('grass')).toBe(true)
    expect(isFlossVariant('capsule')).toBe(true)
    expect(isFlossVariant('orb')).toBe(false)
    expect(isFlossVariant('wave')).toBe(false)
  })
})
