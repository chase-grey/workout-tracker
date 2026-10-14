import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, palette, parseTheme, rotateHue, SHADES } from './theme'

describe('parseTheme', () => {
  it('keeps a saved theme', () => {
    expect(parseTheme({ accent: 'purple', mode: 'light' })).toEqual({ accent: 'purple', mode: 'light' })
  })

  it('falls back part by part on anything it does not know', () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME)
    expect(parseTheme({ accent: 'chartreuse', mode: 'light' })).toEqual({ accent: 'green', mode: 'light' })
    expect(parseTheme({ accent: 'rose', mode: 'dim' })).toEqual({ accent: 'rose', mode: 'dark' })
  })
})

describe('palette', () => {
  it('leaves every colour alone on green', () => {
    const p = palette({ accent: 'green', mode: 'dark' })
    expect(p.tint('#718578')).toBe('#718578')
    expect(p.scale[600]).toBe('#16a34a')
  })

  it('lands a green-scale step on the same step of the accent', () => {
    const green = palette(DEFAULT_THEME)
    const purple = palette({ accent: 'purple', mode: 'dark' })
    for (const s of SHADES) expect(purple.tint(green.scale[s])).toBe(purple.scale[s])
  })

  it('turns an off-scale tint away from green toward the accent', () => {
    const purple = palette({ accent: 'purple', mode: 'dark' })
    const moss = purple.tint('#718578')
    expect(moss).not.toBe('#718578')
    // Purple carries more blue than green, and less green, than the moss did.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(moss.slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(g)
  })

  it('keeps the cool readings clear of a cool accent', () => {
    for (const accent of ['purple', 'blue'] as const) {
      const p = palette({ accent, mode: 'dark' })
      expect([p.cold, p.cold2]).not.toContain(p.scale[400])
      expect(p.cold).not.toBe(p.cold2)
    }
    expect(palette({ accent: 'blue', mode: 'dark' }).cold).not.toBe('#38bdf8')
  })

  it('swaps the ground with the mode', () => {
    expect(palette({ accent: 'green', mode: 'light' }).ground.surface).toBe('#ffffff')
    expect(palette({ accent: 'green', mode: 'dark' }).ground.bg).toBe('#0a0a0a')
  })
})

describe('rotateHue', () => {
  it('round-trips a full turn', () => {
    expect(rotateHue('#22c55e', 360)).toBe('#22c55e')
  })

  it('leaves greys grey', () => {
    expect(rotateHue('#737373', 120)).toBe('#737373')
  })
})
