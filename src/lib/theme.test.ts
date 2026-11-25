import { describe, expect, it } from 'vitest'
import {
  ACCENTS,
  customScale,
  DEFAULT_PREF,
  DEFAULT_THEME,
  MODES,
  palette,
  parseThemePref,
  resolveTheme,
  rgbOf,
  rotateHue,
  SHADES,
  textOn,
} from './theme'

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

  it('keeps a colour of your own, worn or not', () => {
    expect(parseThemePref({ accent: 'custom', custom: '#FF6600', mode: 'dark' })).toEqual({
      accent: 'custom',
      custom: '#ff6600',
      mode: 'dark',
    })
    expect(parseThemePref({ accent: 'rose', custom: '#ff6600' })).toEqual({
      accent: 'rose',
      custom: '#ff6600',
      mode: 'system',
    })
  })

  it('will not wear a custom accent with no colour behind it', () => {
    expect(parseThemePref({ accent: 'custom' })).toEqual(DEFAULT_PREF)
    expect(parseThemePref({ accent: 'custom', custom: 'orange' })).toEqual(DEFAULT_PREF)
    expect(parseThemePref({ accent: 'custom', custom: '#f60' })).toEqual(DEFAULT_PREF)
  })
})

describe('resolveTheme', () => {
  it('follows the system only when asked to', () => {
    expect(resolveTheme({ accent: 'green', mode: 'system' }, true).mode).toBe('dark')
    expect(resolveTheme({ accent: 'green', mode: 'system' }, false).mode).toBe('light')
    expect(resolveTheme({ accent: 'green', mode: 'dark' }, false).mode).toBe('dark')
    expect(resolveTheme({ accent: 'rose', mode: 'light' }, true)).toEqual({ accent: 'rose', mode: 'light' })
  })

  it('carries the custom colour through', () => {
    expect(resolveTheme({ accent: 'custom', custom: '#ff6600', mode: 'system' }, true)).toEqual({
      accent: 'custom',
      custom: '#ff6600',
      mode: 'dark',
    })
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

/** Every colour a custom accent has to survive: vivid, pale, dark, and no colour at all. */
const PICKS = [
  '#ff6600', '#ffd400', '#00e5ff', '#7c3aed', '#ff00ff', '#16a34a', '#e11d48',
  '#ffe4ec', '#0b1f5c', '#3b0a0a', '#808080', '#000000', '#ffffff',
]

/** Relative luminance, 0 for black to 1 for white: how much light the colour gives off. */
const brightness = (hex: string) => {
  const [r, g, b] = rgbOf(hex).map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('customScale', () => {
  it('keeps the picked colour on the scale, untouched', () => {
    for (const pick of PICKS) expect(Object.values(customScale(pick))).toContain(pick)
  })

  it('makes it the main colour when it is neither too pale nor too dark to be one', () => {
    for (const pick of ['#ff6600', '#16a34a', '#7c3aed', '#ff00ff', '#808080']) {
      expect(customScale(pick)[600]).toBe(pick)
    }
  })

  it('runs from light to dark without a step out of order', () => {
    for (const pick of PICKS) {
      const scale = customScale(pick)
      for (let i = 1; i < SHADES.length; i++) {
        expect(brightness(scale[SHADES[i]]), `${pick} ${SHADES[i]}`).toBeLessThanOrEqual(brightness(scale[SHADES[i - 1]]))
      }
    }
  })

  it('gives every step as a colour a screen can show', () => {
    for (const pick of PICKS) {
      for (const step of SHADES) expect(customScale(pick)[step]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('leaves a main colour that can be seen on black and a deep one that can be seen on paper', () => {
    for (const pick of PICKS) {
      const scale = customScale(pick)
      expect(brightness(scale[600]), pick).toBeGreaterThan(0.025)
      expect(brightness(scale[700]), pick).toBeLessThan(0.6)
    }
  })

  it('keeps the hue: a red stays red and a blue stays blue down the whole scale', () => {
    for (const step of SHADES) {
      const [r, , b] = rgbOf(customScale('#e11d48')[step])
      expect(r).toBeGreaterThan(b)
      const [r2, , b2] = rgbOf(customScale('#2563eb')[step])
      expect(b2).toBeGreaterThan(r2)
    }
  })
})

describe('a custom accent', () => {
  it('fills every part of the palette a swatch does', () => {
    for (const custom of PICKS) {
      for (const mode of MODES) {
        const p = palette({ accent: 'custom', custom, mode })
        const steps = Object.values(p.scale)
        expect(steps).toContain(p.cold)
        expect(steps).toContain(p.overPhoto)
        expect(p.confetti).toHaveLength(4)
        expect(p.tint('#718578')).toMatch(/^#[0-9a-f]{6}$/)
        expect(p.tint('#22c55e')).toBe(p.scale[500])
      }
    }
  })

  it('puts black text on a bright fill and white on a deep one', () => {
    expect(palette({ accent: 'custom', custom: '#ffd400', mode: 'dark' }).onAccent).toBe('#000000')
    expect(palette({ accent: 'custom', custom: '#7c3aed', mode: 'dark' }).onAccent).toBe('#ffffff')
    expect(textOn('#ffffff')).toBe('#000000')
    expect(textOn('#000000')).toBe('#ffffff')
  })

  it('fades the drawn tints with a grey accent instead of turning them red', () => {
    const [r, g, b] = rgbOf(palette({ accent: 'custom', custom: '#808080', mode: 'dark' }).tint('#718578'))
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('wears green rather than nothing when the colour is missing', () => {
    expect(palette({ accent: 'custom', mode: 'dark' }).scale).toEqual(palette(DEFAULT_THEME).scale)
  })
})

describe('the swatches', () => {
  it('keep white text on the deep fill a light ground uses', () => {
    for (const accent of ACCENTS) expect(palette({ accent, mode: 'light' }).onAccentDeep).toBe('#ffffff')
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
