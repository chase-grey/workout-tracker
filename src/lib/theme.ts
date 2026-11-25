/**
 * The app's colour themes: an accent hue and a light or dark ground.
 *
 * Everything that used to be a hard-coded green reads from here instead — the
 * Tailwind accent tokens (via the CSS variables themeStore writes on <html>),
 * and the hexes that can't be a CSS variable because they're handed to an SVG
 * attribute, a canvas, Recharts or the confetti: chart lines, the comet's
 * gradients, the muscle map's ramp.
 *
 * Each accent is a full ten-step scale so a design written against green-300 or
 * green-700 has a real counterpart to land on. The bespoke tints the animations
 * were drawn with — the comet's mossy rock, the teal planet — aren't on any
 * scale, so {@link tint} turns them round the colour wheel by the same distance
 * the accent moved from green, which keeps their lightness and how grey they are.
 *
 * A custom accent is any one colour; {@link customScale} grows the other nine
 * steps from it, so everything above holds for it without a second code path.
 *
 * Pure module — no React/DOM.
 */

export type Preset = 'green' | 'purple' | 'blue' | 'rose' | 'amber' | 'teal'
/** A swatch, or `custom`: the colour in the theme's `custom`. */
export type Accent = Preset | 'custom'
export type Mode = 'dark' | 'light'

export interface Theme {
  accent: Accent
  mode: Mode
  /**
   * The colour of your own, `#rrggbb`. Kept while a swatch is worn, so going
   * back to it doesn't mean mixing it again.
   */
  custom?: string
}

export const DEFAULT_THEME: Theme = { accent: 'green', mode: 'dark' }

export const ACCENTS: Preset[] = ['green', 'teal', 'blue', 'purple', 'rose', 'amber']
export const MODES: Mode[] = ['dark', 'light']

/**
 * What the picker saves: a ground, or `system` to wear whichever one the phone
 * is wearing. Unset means `system` — a light phone opens a light app.
 */
export type ModePref = Mode | 'system'
export const MODE_PREFS: ModePref[] = ['system', 'dark', 'light']

export interface ThemePref {
  accent: Accent
  mode: ModePref
  custom?: string
}

export const DEFAULT_PREF: ThemePref = { accent: 'green', mode: 'system' }

/** The theme a preference comes to, given whether the system is dark. */
export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  return {
    accent: pref.accent,
    mode: pref.mode === 'system' ? (systemDark ? 'dark' : 'light') : pref.mode,
    ...(pref.custom ? { custom: pref.custom } : {}),
  }
}

export type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
export const SHADES: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

interface AccentDef {
  scale: Record<Shade, string>
  /** Text on a solid accent fill: black where it reads, white where it doesn't. */
  onAccent: string
}

const ACCENT_DEFS: Record<Preset, AccentDef> = {
  green: {
    scale: {
      50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
      500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
    },
    onAccent: '#000000',
  },
  purple: {
    scale: {
      50: '#f7f5fa', 100: '#eeeaf3', 200: '#ddd6e7', 300: '#c4b9d4', 400: '#a798bd',
      500: '#8b7aa6', 600: '#74648e', 700: '#5f5275', 800: '#4c425e', 900: '#3b344a',
    },
    onAccent: '#ffffff',
  },
  blue: {
    scale: {
      50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
      500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
    },
    onAccent: '#ffffff',
  },
  rose: {
    scale: {
      50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185',
      500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337',
    },
    onAccent: '#ffffff',
  },
  amber: {
    scale: {
      50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
      500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f',
    },
    onAccent: '#000000',
  },
  teal: {
    scale: {
      50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
      500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a',
    },
    onAccent: '#000000',
  },
}

/** The ground colours charts and SVGs need as literal values. */
export interface Ground {
  bg: string
  surface: string
  surface2: string
  border: string
  /** Axis tick labels. */
  tick: string
  /** Tooltip header text. */
  label: string
  /** A zero line drawn through a chart. */
  zero: string
  text: string
  /** The muscle map's silhouette and its untrained muscles. */
  bodyBase: string
  noData: string
}

const GROUNDS: Record<Mode, Ground> = {
  dark: {
    bg: '#0a0a0a', surface: '#171717', surface2: '#262626', border: '#333333',
    tick: '#737373', label: '#a3a3a3', zero: '#404040', text: '#fafafa',
    bodyBase: '#26262b', noData: '#3f3f46',
  },
  light: {
    bg: '#f5f5f5', surface: '#ffffff', surface2: '#e5e5e5', border: '#d4d4d4',
    tick: '#525252', label: '#262626', zero: '#a3a3a3', text: '#0a0a0a',
    bodyBase: '#e4e4e7', noData: '#d4d4d8',
  },
}

/** Everything a component needs to draw in the current theme. */
export interface Palette {
  theme: Theme
  scale: Record<Shade, string>
  onAccent: string
  /** Text on the deeper fill a light ground uses (step 700). */
  onAccentDeep: string
  /**
   * A cold stretch reading where it's set as type or a pill beside a warm one:
   * the accent stepped away from the ground — paler on black, deeper on paper —
   * so it is the same colour in a second weight, never a second hue.
   */
  cold: string
  /** Text on a solid {@link cold} fill. */
  onCold: string
  /**
   * The second colour drawn over a photo — the right arm, a cold pill. A photo
   * is neither ground, so this is the same pale step in both.
   */
  overPhoto: string
  ground: Ground
  /** Confetti and sparks: the accent's bright end, deepest first. */
  confetti: string[]
  /** A colour drawn against green, carried round to this accent's hue. */
  tint: (hex: string) => string
}

export function palette(theme: Theme): Palette {
  const def = accentDef(theme)
  const [hue, sat] = toHsl(def.scale[500])
  const turn = hue - hueOf(ACCENT_DEFS.green.scale[500])
  // A swatch is never grey, but a colour of your own can be, and a grey has no
  // hue to turn the moss toward: it fades with the accent instead.
  const fade = theme.accent === 'custom' ? Math.min(1, sat / 0.2) : 1
  const light = theme.mode === 'light'
  return {
    theme,
    scale: def.scale,
    onAccent: def.onAccent,
    onAccentDeep: textOn(def.scale[700]),
    cold: def.scale[light ? 800 : 300],
    onCold: light ? '#ffffff' : '#000000',
    overPhoto: def.scale[200],
    ground: GROUNDS[theme.mode],
    confetti: ([600, 500, 400, 300] as const).map((s) => def.scale[s]),
    tint:
      theme.accent === 'green'
        ? (hex) => hex
        : (hex) => {
            // A step of the green scale lands on the same step of this one, so a
            // gradient drawn from green-300 to green-700 keeps its exact stops.
            const step = SHADES.find((n) => ACCENT_DEFS.green.scale[n] === hex.toLowerCase())
            if (step) return def.scale[step]
            const [h, s, l] = toHsl(hex)
            return fromHsl([(((h + turn) % 360) + 360) % 360, s * fade, l])
          },
  }
}

function accentDef(theme: Theme): AccentDef {
  if (theme.accent !== 'custom') return ACCENT_DEFS[theme.accent]
  const hex = parseHex(theme.custom)
  if (!hex) return ACCENT_DEFS.green
  const scale = customScale(hex)
  return { scale, onAccent: textOn(scale[600]) }
}

/** `#rrggbb` in lower case, or null for anything that isn't one. */
export function parseHex(raw: unknown): string | null {
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null
}

/** Black or white, whichever reads better on a solid fill of this colour. */
export function textOn(hex: string): string {
  const [r, g, b] = rgbOf(hex).map((v) => linear(v / 255))
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Where black's contrast against the fill overtakes white's.
  return y > 0.179 ? '#000000' : '#ffffff'
}

/**
 * How light each step of a scale is and how much colour it carries, read off
 * the green one (OKLCH lightness; chroma as a share of step 600's). A custom
 * scale keeps these proportions around whatever colour it is handed.
 */
const LADDER: Record<Shade, [lightness: number, chroma: number]> = {
  50: [0.98, 0.09], 100: [0.96, 0.23], 200: [0.925, 0.43], 300: [0.87, 0.77], 400: [0.79, 1.05],
  500: [0.72, 1.1], 600: [0.63, 1], 700: [0.53, 0.8], 800: [0.45, 0.65], 900: [0.39, 0.52],
}

/**
 * The step a colour of your own takes on its scale. It is the app's main colour,
 * step 600, whenever it can be: the buttons are then exactly what was picked.
 * One too pale leaves no room above it for the bright steps, and one too dark
 * is a button nobody can see on black, so those sit on the rung that matches
 * how light they are and the main colour is grown from them.
 */
function anchorStep(lightness: number): Shade {
  if (lightness >= 0.5 && lightness <= 0.75) return 600
  const rungs: Shade[] = lightness > 0.75 ? [300, 400] : [700, 800]
  return rungs.reduce((a, b) => (Math.abs(LADDER[b][0] - lightness) < Math.abs(LADDER[a][0] - lightness) ? b : a))
}

/**
 * Ten steps grown from one colour. The colour itself is one of them, untouched;
 * the others keep its hue and step lighter and darker by the same proportions
 * the green scale does, each as rich as its place on the ladder allows. Worked
 * in OKLCH, where an equal step in lightness looks equal whatever the hue —
 * in HSL a yellow and a blue of the same "lightness" are nowhere near.
 */
export function customScale(hex: string): Record<Shade, string> {
  const [l0, c0, h] = toOklch(hex)
  const anchor = anchorStep(l0)
  const [la, ca] = LADDER[anchor]
  const scale = {} as Record<Shade, string>
  for (const step of SHADES) {
    const [ls, cs] = LADDER[step]
    const l = ls >= la ? 1 - ((1 - l0) * (1 - ls)) / (1 - la) : (l0 * ls) / la
    scale[step] = step === anchor ? hex.toLowerCase() : fromOklch([l, (c0 * cs) / ca, h])
  }
  return scale
}

/** Whatever was saved, or the default for any part of it that isn't a preference. */
export function parseThemePref(raw: unknown): ThemePref {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const custom = parseHex(o.custom)
  const accent: Accent =
    o.accent === 'custom' && custom
      ? 'custom'
      : ACCENTS.includes(o.accent as Preset)
        ? (o.accent as Preset)
        : DEFAULT_PREF.accent
  return {
    accent,
    mode: MODE_PREFS.includes(o.mode as ModePref) ? (o.mode as ModePref) : DEFAULT_PREF.mode,
    ...(custom ? { custom } : {}),
  }
}

export type Hsl = [hue: number, saturation: number, lightness: number]

export function toHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

export function fromHsl([h, s, l]: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function hueOf(hex: string): number {
  return toHsl(hex)[0]
}

export function rotateHue(hex: string, degrees: number): string {
  const [h, s, l] = toHsl(hex)
  return fromHsl([(((h + degrees) % 360) + 360) % 360, s, l])
}

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const gamma = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

type Oklch = [lightness: number, chroma: number, hue: number]

function toOklch(hex: string): Oklch {
  const [r, g, b] = rgbOf(hex).map((v) => linear(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(a, bb), Math.atan2(bb, a)]
}

function oklchToRgb([L, c, h]: Oklch): [number, number, number] {
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** The nearest colour a screen can show: the same lightness and hue, less rich. */
function fromOklch([L, c, h]: Oklch): string {
  const l = Math.min(1, Math.max(0, L))
  const fits = (chroma: number) => oklchToRgb([l, chroma, h]).every((v) => v >= -0.0005 && v <= 1.0005)
  let chroma = c
  if (!fits(chroma)) {
    let lo = 0
    let hi = c
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
    chroma = lo
  }
  const hex = (v: number) => Math.round(gamma(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, '0')
  return '#' + oklchToRgb([l, chroma, h]).map(hex).join('')
}

/** `#rrggbb` → `[r, g, b]`, for code that blends between two theme colours. */
export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
