import { describe, expect, it } from 'vitest'
import { DEFAULT_PREF, DEFAULT_THEME, palette, parseThemePref, resolveTheme, rotateHue, SHADES } from './theme'

describe('parseThemePref', () => {
  it('keeps a saved preference', () => {
    expect(parseThemePref({ accent: 'purple', mode: 'light' })).toEqual({ accent: 'purple', mode: 'light' })
    expect(parseThemePref({ accent: 'blue', mode: 'system' })).toEqual({ accent: 'blue', mode: 'system' })
  })

  it('falls back part by part on anything it does not know, to the system ground', () => {
    expect(parseThemePref(null)).toEqual(DEFAULT_PREF)
    expect(parseThemePref({ accent: 'chartreuse', mode: 'light' })).toEqual({ accent: 'green', mode: 'light' })
    expect(parseThemePref({ accent: 'rose', mode: 'dim' })).toEqual({ accent: 'rose', mode: 'system' })
    expect(parseThemePref({ accent: 'rose' })).toEqual({ accent: 'rose', mode: 'system' })
  })
})

describe('resolveTheme', () => {
  it('follows the system only when asked to', () => {
    expect(resolveTheme({ accent: 'green', mode: 'system' }, true).mode).toBe('dark')
    expect(resolveTheme({ accent: 'green', mode: 'system' }, false).mode).toBe('light')
    expect(resolveTheme({ accent: 'green', mode: 'dark' }, false).mode).toBe('dark')
    expect(resolveTheme({ accent: 'rose', mode: 'light' }, true)).toEqual({ accent: 'rose', mode: 'light' })
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
    for (const accent of ['purple', 'blue', 'teal'] as const) {
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
