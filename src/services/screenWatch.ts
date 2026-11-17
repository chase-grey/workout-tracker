import {
  appendEvent,
  blankReason,
  loadVerdict,
  type ScreenProbe,
  type TrailEvent,
} from '../lib/backTrail'
import { reportDeviceFailure } from './saveErrors'

/**
 * Watches for the screen going blank and says how it got there.
 *
 * CrashScreen catches a render that throws. This is for everything it can't
 * see: a tree that mounted and drew nothing, a script that threw before React
 * existed, an asset that never arrived, a back press that walked out of the
 * document. Each is reported to the save_errors tab with the back trail (see
 * lib/backTrail) and what the app believed was on screen, because none of them
 * leaves anything on the phone to read.
 */

const TRAIL_KEY = 'wt:back-trail'
/** Left by index.html's watchdog when a load never mounted anything. */
const BOOT_KEY = 'wt:boot-trouble'

/** A blank screen has to still be blank this long after it was first seen. */
const FIRST_LOOK_MS = 700
const SECOND_LOOK_MS = 1800

let trail: TrailEvent[] = []
/** What the app last said it was showing (see App's `noteScreen`). */
let screen: Record<string, unknown> = {}

function loadTrail(): TrailEvent[] {
  try {
    const raw = localStorage.getItem(TRAIL_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as TrailEvent[]) : []
  } catch {
    return []
  }
}

/** Where the history stack stands right now — what a back press is about to walk. */
function historySnapshot() {
  const state = window.history.state as { backGuard?: unknown } | null
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation
  return {
    len: window.history.length,
    guard: state?.backGuard ?? null,
    touched: activation?.isActive ?? null,
    vis: document.visibilityState,
  }
}

/** Add one event to the back trail. Never throws. */
export function note(e: string, detail: Record<string, unknown> = {}): void {
  try {
    trail = appendEvent(trail, { t: Date.now(), e, ...historySnapshot(), ...detail })
    localStorage.setItem(TRAIL_KEY, JSON.stringify(trail))
  } catch {
    /* a trail that can't be kept costs only the trail */
  }
}

/** The app's own account of what is on screen, sent along with any report. */
export function noteScreen(state: Record<string, unknown>): void {
  screen = state
}

function describe(el: Element): string {
  const cls = typeof el.className === 'string' ? el.className.trim().slice(0, 80) : ''
  return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase()
}

/** Look at the screen: what is mounted, and whether any of it has something in it. */
function probe(): { probe: ScreenProbe; top: string[] } {
  const root = document.getElementById('root')
  const shell = document.querySelector('.app-shell')
  const w = window.innerWidth
  const h = window.innerHeight
  const structural = (el: Element) =>
    el === document.documentElement || el === document.body || el === root || el === shell || el.tagName === 'MAIN'
  const top = new Set<string>()
  let sampled = 0
  let drawn = 0
  for (const fy of [0.12, 0.3, 0.5, 0.7, 0.88]) {
    for (const fx of [0.2, 0.5, 0.8]) {
      const el = document.elementFromPoint(w * fx, h * fy)
      if (!el) continue
      sampled++
      top.add(describe(el))
      if (structural(el)) continue
      const picture = 'svg, canvas, img, video, input, textarea'
      if (el.textContent?.trim() || el.closest(picture) || el.querySelector(picture)) drawn++
    }
  }
  return {
    probe: {
      rootChildren: root?.childElementCount ?? 0,
      shellHeight: shell ? shell.getBoundingClientRect().height : null,
      viewportHeight: h,
      sampled,
      drawn,
    },
    top: [...top],
  }
}

/**
 * Look at the screen shortly after something that could have blanked it, and
 * again a moment later: only a screen blank both times is reported, so a frame
 * caught between two screens isn't.
 */
function lookSoon(why: string): void {
  window.setTimeout(() => {
    if (document.visibilityState !== 'visible' || !blankReason(probe().probe)) return
    window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return
      const seen = probe()
      const reason = blankReason(seen.probe)
      if (!reason) return
      note('blank', { reason, why })
      void reportDeviceFailure('blank_screen', `${reason} after ${why}`, {
        ...seen,
        screen,
        mainChildren: [...(document.querySelector('main')?.children ?? [])].map(describe),
        ...context(),
      })
    }, SECOND_LOOK_MS)
  }, FIRST_LOOK_MS)
}

/** What every report from here carries: the trail, and how this page was reached. */
function context() {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return {
    trail,
    navigation: nav?.type,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    userAgent: navigator.userAgent,
  }
}

/** Start watching. Call first thing at startup, before anything that could throw. */
export function watchScreen(): void {
  const previous = loadTrail()
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  const verdict = loadVerdict(previous, nav?.type, Date.now())
  trail = previous
  note('load', { nav: nav?.type })
  if (verdict) void reportDeviceFailure('back_reload', verdict, context())

  // A load that never got as far as this module said so on its way out.
  try {
    const boot = localStorage.getItem(BOOT_KEY)
    if (boot) {
      localStorage.removeItem(BOOT_KEY)
      void reportDeviceFailure('boot_failed', 'a load mounted nothing', {
        boot: JSON.parse(boot) as unknown,
        ...context(),
      })
    }
  } catch {
    /* unreadable: nothing to pass on */
  }

  // Capture phase, so a script or stylesheet that failed to load is seen too —
  // those errors don't bubble, and a missing chunk is one way to draw nothing.
  window.addEventListener(
    'error',
    (ev) => {
      const target = ev.target as (EventTarget & { src?: string; href?: string; tagName?: string }) | null
      if (target && target !== window && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        const url = target.src || target.href || ''
        note('asset-error', { url })
        void reportDeviceFailure('asset_error', `failed to load ${url}`, context())
      } else if (ev instanceof ErrorEvent) {
        note('error', { message: ev.message })
        void reportDeviceFailure('js_error', ev.message || 'error', {
          stack: (ev.error as Error | undefined)?.stack,
          at: `${ev.filename}:${ev.lineno}:${ev.colno}`,
          screen,
          ...context(),
        })
      }
    },
    true,
  )

  window.addEventListener('popstate', () => lookSoon('back'))
  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return
    // Brought back whole from the back/forward cache: no load, so say so here.
    note('restored')
    lookSoon('a restore from the back/forward cache')
  })
  document.addEventListener('visibilitychange', () => {
    const shown = document.visibilityState === 'visible'
    note(shown ? 'shown' : 'hidden')
    if (shown) lookSoon('coming back to the app')
  })
  lookSoon('load')
}
