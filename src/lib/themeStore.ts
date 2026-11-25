import { useSyncExternalStore } from 'react'
import {
  palette,
  parseThemePref,
  resolveTheme,
  SHADES,
  type Palette,
  type ThemePref,
} from './theme'

/**
 * The chosen theme, held per device: a phone in a dim gym and a desktop at noon
 * can want different grounds, so it isn't synced with the rest of settings.
 *
 * What's saved is a preference, and its ground defaults to `system`: until you
 * pick dark or light, the app wears whatever the phone is wearing, and turns
 * over with it when the phone switches at sunset.
 *
 * Applying it writes the accent's scale onto <html> as `--accent-<shade>` (which
 * index.css maps onto the Tailwind accent tokens) and `data-mode`, so everything
 * styled by class follows at once. Code that needs a literal colour reads
 * {@link currentPalette} at render.
 */

const KEY = 'wt:theme'

function load(): ThemePref {
  try {
    return parseThemePref(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return parseThemePref(null)
  }
}

const systemDark =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const isSystemDark = () => systemDark?.matches ?? true

let pref: ThemePref = load()
let current: Palette = palette(resolveTheme(pref, isSystemDark()))
const listeners = new Set<() => void>()

function apply(p: Palette) {
  const root = document.documentElement
  for (const s of SHADES) root.style.setProperty(`--accent-${s}`, p.scale[s])
  root.style.setProperty('--on-accent', p.onAccent)
  root.style.setProperty('--on-accent-deep', p.onAccentDeep)
  root.dataset.mode = p.theme.mode
  root.style.colorScheme = p.theme.mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.ground.bg)
}

function refresh() {
  current = palette(resolveTheme(pref, isSystemDark()))
  apply(current)
  for (const l of listeners) l()
}

/** Paint the saved theme before the first render, and follow the system after. */
export function initTheme() {
  apply(current)
  systemDark?.addEventListener('change', () => {
    if (pref.mode === 'system') refresh()
  })
}

export function currentPalette(): Palette {
  return current
}

export function currentThemePref(): ThemePref {
  return pref
}

export function setTheme(next: ThemePref) {
  pref = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private mode / full storage: the theme still applies for this visit.
  }
  refresh()
}

export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current palette, re-rendering the caller when it changes. */
export function useTheme(): Palette {
  return useSyncExternalStore(onThemeChange, currentPalette)
}

/** The saved preference — what the picker shows pressed. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(onThemeChange, currentThemePref)
}
