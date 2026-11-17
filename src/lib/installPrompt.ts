/**
 * Whether to offer installing the app, and which way. Chrome hands over a real
 * install dialog (`beforeinstallprompt`) that a tap can open; iOS has no such
 * API, so the most it gets is a pointer to Share → Add to Home Screen. An app
 * already running from the home screen offers nothing, and a dismissal holds
 * for {@link DISMISS_DAYS} before the offer comes back.
 */

export type InstallOffer = 'prompt' | 'ios' | null

export const DISMISS_DAYS = 14

export function installOffer(o: {
  standalone: boolean
  canPrompt: boolean
  ios: boolean
  dismissedAt: string | null
  now: Date
}): InstallOffer {
  if (o.standalone) return null
  if (o.dismissedAt) {
    const since = o.now.getTime() - new Date(o.dismissedAt).getTime()
    if (Number.isFinite(since) && since < DISMISS_DAYS * 86_400_000) return null
  }
  if (o.canPrompt) return 'prompt'
  if (o.ios) return 'ios'
  return null
}

/** iPhone, iPod, or an iPad — which since iPadOS 13 says it's a Mac but has touch. */
export function isIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

/** Where Safari's share button sits: the bottom bar, or the top right corner. */
export type ShareSpot = 'bottom' | 'top' | 'both'

/**
 * Where the share button is on this iOS browser. An iPad's bar is at the top
 * for both Safari and Chrome; an iPhone's Safari is at the bottom, and Chrome
 * there puts it top right. Anything else (Firefox, Edge, a web view) isn't
 * known, so both places are named.
 */
export function iosShareSpot(userAgent: string, maxTouchPoints: number): ShareSpot {
  const ipad = /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  if (ipad) return 'top'
  if (/CriOS/.test(userAgent)) return 'top'
  if (/FxiOS|EdgiOS|OPiOS/.test(userAgent)) return 'both'
  if (/Safari\//.test(userAgent)) return 'bottom'
  return 'both'
}

/**
 * Whether this is an iOS app's own web view (Instagram, Facebook, Gmail and the
 * like) rather than a browser. Those have no Add to Home Screen, so the page has
 * to be opened in Safari first.
 */
export function isIosInAppBrowser(userAgent: string, maxTouchPoints: number): boolean {
  if (!isIOS(userAgent, maxTouchPoints)) return false
  return /FBAN|FBAV|Instagram|Messenger|\bLine\/|GSA\/|Twitter|Snapchat|LinkedInApp|Pinterest|BytedanceWebview|musical_ly/.test(
    userAgent,
  )
}
