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
 * Pure module — no React/DOM.
 */

export type Accent = 'green' | 'purple' | 'blue' | 'rose'
export type Mode = 'dark' | 'light'

export interface Theme {
  accent: Accent
  mode: Mode
}

export const DEFAULT_THEME: Theme = { accent: 'green', mode: 'dark' }

export const ACCENTS: Accent[] = ['green', 'purple', 'blue', 'rose']
export const MODES: Mode[] = ['dark', 'light']

export type Shade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
export const SHADES: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

interface AccentDef {
  scale: Record<Shade, string>
  /** Text on a solid accent fill: black where it reads, white where it doesn't. */
  onAccent: string
  /**
   * Readings that must not be mistaken for another rung of the accent ladder —
   * cold stretch lines, the companion lift's marks. Blue and violet by default;
   * a blue or purple accent gets other cool colours so the contrast survives.
   */
  cold: string
  cold2: string
  otherLift: string
}

const SKY = '#38bdf8'
const VIOLET = '#a78bfa'
const TEAL = '#2dd4bf'

const ACCENT_DEFS: Record<Accent, AccentDef> = {
  green: {
    scale: {
      50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
      500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d',
    },
    onAccent: '#000000',
    cold: SKY,
    cold2: VIOLET,
    otherLift: SKY,
  },
  purple: {
    scale: {
      50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc',
      500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8', 900: '#581c87',
    },
    onAccent: '#ffffff',
    cold: SKY,
    cold2: TEAL,
    otherLift: SKY,
  },
  blue: {
    scale: {
      50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
      500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a',
    },
    onAccent: '#ffffff',
    cold: TEAL,
    cold2: VIOLET,
    otherLift: '#e879f9',
  },
  rose: {
    scale: {
      50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185',
      500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337',
    },
    onAccent: '#ffffff',
    cold: SKY,
    cold2: VIOLET,
    otherLift: SKY,
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
    tick: '#737373', label: '#525252', zero: '#a3a3a3', text: '#171717',
    bodyBase: '#e4e4e7', noData: '#d4d4d8',
  },
}

/** Everything a component needs to draw in the current theme. */
export interface Palette {
  theme: Theme
  scale: Record<Shade, string>
  onAccent: string
  cold: string
  cold2: string
  otherLift: string
  ground: Ground
  /** Confetti and sparks: the accent's bright end, deepest first. */
  confetti: string[]
  /** A colour drawn against green, carried round to this accent's hue. */
  tint: (hex: string) => string
}

export function palette(theme: Theme): Palette {
  const def = ACCENT_DEFS[theme.accent]
  const turn = hueOf(def.scale[500]) - hueOf(ACCENT_DEFS.green.scale[500])
  return {
    theme,
    scale: def.scale,
    onAccent: def.onAccent,
    cold: def.cold,
    cold2: def.cold2,
    otherLift: def.otherLift,
    ground: GROUNDS[theme.mode],
    confetti: ([600, 500, 400, 300] as const).map((s) => def.scale[s]),
    tint:
      theme.accent === 'green'
        ? (hex) => hex
        : (hex) => {
            // A step of the green scale lands on the same step of this one, so a
            // gradient drawn from green-300 to green-700 keeps its exact stops.
            const step = SHADES.find((n) => ACCENT_DEFS.green.scale[n] === hex.toLowerCase())
            return step ? def.scale[step] : rotateHue(hex, turn)
          },
  }
}

/** Whatever was saved, or the default for any part of it that isn't a theme. */
export function parseTheme(raw: unknown): Theme {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    accent: ACCENTS.includes(o.accent as Accent) ? (o.accent as Accent) : DEFAULT_THEME.accent,
    mode: MODES.includes(o.mode as Mode) ? (o.mode as Mode) : DEFAULT_THEME.mode,
  }
}

type Hsl = [number, number, number]

function toHsl(hex: string): Hsl {
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

function fromHsl([h, s, l]: Hsl): string {
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

/** `#rrggbb` → `[r, g, b]`, for code that blends between two theme colours. */
export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
