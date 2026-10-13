import { useSyncExternalStore } from 'react'
import { palette, parseTheme, SHADES, type Palette, type Theme } from './theme'

/**
 * The chosen theme, held per device: a phone in a dim gym and a desktop at noon
 * can want different grounds, so it isn't synced with the rest of settings.
 *
 * Applying it writes the accent's scale onto <html> as `--accent-<shade>` (which
 * index.css maps onto the Tailwind accent tokens) and `data-mode`, so everything
 * styled by class follows at once. Code that needs a literal colour reads
 * {@link currentPalette} at render.
 */

const KEY = 'wt:theme'

function load(): Theme {
  try {
    return parseTheme(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return parseTheme(null)
  }
}

let current: Palette = palette(load())
const listeners = new Set<() => void>()

function apply(p: Palette) {
  const root = document.documentElement
  for (const s of SHADES) root.style.setProperty(`--accent-${s}`, p.scale[s])
  root.style.setProperty('--on-accent', p.onAccent)
  root.dataset.mode = p.theme.mode
  root.style.colorScheme = p.theme.mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.ground.bg)
}

/** Paint the saved theme before the first render. */
export function initTheme() {
  apply(current)
}

export function currentPalette(): Palette {
  return current
}

export function setTheme(theme: Theme) {
  current = palette(theme)
  try {
    localStorage.setItem(KEY, JSON.stringify(theme))
  } catch {
    // Private mode / full storage: the theme still applies for this visit.
  }
  apply(current)
  for (const l of listeners) l()
}

export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current palette, re-rendering the caller when it changes. */
export function useTheme(): Palette {
  return useSyncExternalStore(onThemeChange, currentPalette)
}
