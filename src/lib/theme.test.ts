import { describe, expect, it } from 'vitest'
import { ACCENTS, DEFAULT_PREF, DEFAULT_THEME, MODES, palette, parseThemePref, pillarColours, resolveTheme, rotateHue, SHADES } from './theme'

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

  it('draws the cold readings off the accent scale, in a step the warm ones do not use', () => {
    for (const accent of ACCENTS) {
      for (const mode of MODES) {
        const p = palette({ accent, mode })
        const steps = Object.values(p.scale)
        for (const c of [p.cold, p.overPhoto]) {
          expect(steps).toContain(c)
          expect(c).not.toBe(p.scale[500])
        }
      }
    }
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

describe('pillarColours', () => {
  it('gives the three kinds of session three different colours on every theme', () => {
    for (const accent of ACCENTS) {
      for (const mode of MODES) {
        const c = pillarColours(palette({ accent, mode }))
        expect(new Set(Object.values(c)).size, `${accent} ${mode}`).toBe(3)
      }
    }
  })

  it('takes all three from the accent scale', () => {
    for (const accent of ACCENTS) {
      for (const mode of MODES) {
        const p = palette({ accent, mode })
        for (const c of Object.values(pillarColours(p))) expect(Object.values(p.scale)).toContain(c)
      }
    }
  })

  it('wears the accent for strength', () => {
    const p = palette({ accent: 'rose', mode: 'dark' })
    expect(pillarColours(p).strength).toBe(p.scale[500])
  })
})
