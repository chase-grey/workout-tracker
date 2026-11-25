import { bottomEdge } from '../lib/screenBottom'
import { trimFacts, type Box, type ScreenFacts } from '../lib/screenReport'
import { readBottomFacts } from '../lib/useBottomEdge'
import type { SaveErrorReport } from '../lib/saveErrorReport'
import { shownAnimationIds } from '../lib/useShownAnimation'
import { APP_COMMIT } from '../lib/version'
import { api } from './api'
import { storage } from './storage'

/**
 * The parts of a screen whose position is what a visual complaint is about:
 * the shell and its scroller, the nav, a session's root, the animation in it,
 * a chart. Every match is reported, up to a few of each.
 */
const PARTS = [
  '.app-shell',
  'main',
  'nav',
  '.session-type',
  '.rhythm-guide',
  '.rhythm-shape',
  '.hold-visual',
  '.countdown-shape',
  '.recharts-wrapper',
  '.fixed.inset-0',
  'canvas',
]
const PER_PART = 4

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

/** Read the screen as it stands. */
export function gatherScreen(screen: string): ScreenFacts {
  const vv = window.visualViewport
  const main = document.querySelector('main')
  const boxes: ScreenFacts['boxes'] = []
  const bottom = readBottomFacts()
  for (const sel of PARTS) {
    const found = [...document.querySelectorAll(sel)].slice(0, PER_PART)
    found.forEach((el, i) => boxes.push({ name: found.length > 1 ? `${sel} ${i + 1}` : sel, box: boxOf(el) }))
  }
  return trimFacts({
    screen,
    userAgent: navigator.userAgent,
    inner: { w: window.innerWidth, h: window.innerHeight },
    visual: vv ? { w: vv.width, h: vv.height, top: vv.offsetTop, left: vv.offsetLeft, scale: vv.scale } : null,
    device: { w: window.screen.width, h: window.screen.height, dpr: window.devicePixelRatio },
    bottom: { safe: bottom.safeBottom, ...bottomEdge(bottom) },
    display: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    mode: document.documentElement.dataset.mode ?? 'dark',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    tab: document.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label') ?? null,
    animations: shownAnimationIds(),
    boxes,
    scroll: main ? { top: main.scrollTop, height: main.scrollHeight, client: main.clientHeight } : null,
    text: [document.body.innerText],
  })
}

/**
 * Post what the screen looks like to the backend's save_errors tab, where
 * `npm run save-errors` reads it. It goes as one more report on the route the
 * failed saves already use (see services/saveErrors), so the backend needed
 * nothing new. Returns whether it landed.
 */
export async function sendScreenReport(screen: string): Promise<boolean> {
  if (!api.isConfigured()) return false
  const report: SaveErrorReport = {
    build: APP_COMMIT,
    route: 'screen_report',
    writeId: 'screen_report',
    message: `screen report: ${screen}`,
    pending: storage.loadQueue().length,
    payload: gatherScreen(screen),
  }
  try {
    await api.reportSaveError(report)
    return true
  } catch {
    return false
  }
}

/** How long a menu takes to get out of the way of the screen it was opened over. */
const MENU_CLOSE_MS = 400

/**
 * Report the screen a moment from now: once the menu that asked has closed, or
 * (from Settings) once you have gone to the screen you mean.
 */
export function sendScreenReportSoon(screen: string | null, delayMs: number = MENU_CLOSE_MS): Promise<boolean> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const where =
        screen ??
        (document.querySelector('.session-type')
          ? 'session'
          : (document.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label') ?? 'unknown'))
      void sendScreenReport(where).then(resolve)
    }, delayMs)
  })
}
