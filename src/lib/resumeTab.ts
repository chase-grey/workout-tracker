import type { Tab } from '../components/BottomNav'

const KEY = 'wt:resume-tab'
const TABS: readonly Tab[] = ['today', 'progress', 'coach', 'settings']

/**
 * Which tab to land on after a reload the app triggers itself — right now only
 * "check for updates & reload", which otherwise dumps you back on Today.
 *
 * sessionStorage rather than localStorage: it dies with the tab, so a self-
 * triggered reload keeps your place while opening the app fresh still starts
 * on Today.
 */
export function stashResumeTab(tab: Tab): void {
  try {
    sessionStorage.setItem(KEY, tab)
  } catch {
    // Storage can be blocked (private mode, locked-down webview) — the reload
    // just lands on Today.
  }
}

/** Read the stashed tab and clear it: it's good for the next load only. */
export function takeResumeTab(): Tab | null {
  try {
    const tab = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return TABS.includes(tab as Tab) ? (tab as Tab) : null
  } catch {
    return null
  }
}
