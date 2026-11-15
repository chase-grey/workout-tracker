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
