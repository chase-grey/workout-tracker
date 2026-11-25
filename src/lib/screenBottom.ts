/**
 * What the bottom of this phone's screen is, for an animation that runs along
 * it: how round the glass is there, and how far up a navigation bar reaches.
 *
 * The rest screen's perimeter traces the edge of the display, and the edge is
 * not the same thing on every phone. Chase's ruling (2026-11-25):
 *
 * - **Where the page reaches the glass, the line curves with the glass**, at
 *   the phone's own corner radius. An installed iPhone app, or an Android one
 *   drawn edge to edge behind the gesture pill.
 * - **Where a navigation bar sits under the page, the corners are square** and
 *   the line runs along the top of the bar. A page that stops above the bar is
 *   a rectangle, and a curve drawn in a rectangle's corner is a curve around
 *   nothing.
 *
 * No browser tells a page its screen's corner radius. What a page can learn is
 * whether it runs under the system's bottom strip (`env(safe-area-inset-bottom)`
 * is how far), how big the screen and the window are, and what kind of phone
 * this is. So the rule is decided from those, and the radius comes from a table
 * of iPhones by screen size, or failing that a share of the screen's width.
 */

export type BottomFacts = {
  userAgent: string
  /** The device's screen, CSS px. */
  screen: { w: number; h: number }
  dpr: number
  /** The layout viewport, CSS px. */
  inner: { w: number; h: number }
  /** `env(safe-area-inset-bottom)`, CSS px. */
  safeBottom: number
}

export type BottomEdge = {
  /** Radius of the glass's bottom corners, CSS px. 0 where the corners are square. */
  radius: number
  /** How far above the bottom of the page the edge to draw along is: a bar's height, or 0. */
  lift: number
}

export const SQUARE: BottomEdge = { radius: 0, lift: 0 }

/**
 * The tallest bottom inset that is still the glass and not a bar. An iPhone's
 * home indicator takes 34, Android's gesture pill 16 to 32; a three-button bar
 * is 48. Under this the page is drawn to the bottom of the screen with a thin
 * handle floating over it, and above it there is a bar to stay clear of.
 */
export const BAR_MIN_PX = 40

/**
 * iPhone corner radii in points, by the screen's size in points and its pixel
 * ratio. Apple doesn't publish these; they are what `_displayCornerRadius`
 * reports, as collected in github.com/kylebshr/ScreenCorners (read 2026-11-25).
 * Several phones share a screen size, and where two radii share one the larger
 * is kept: a line a little inside the corner is whole, one a little outside it
 * is cut off by the glass.
 */
const IPHONE_RADII: { w: number; h: number; dpr?: number; radius: number }[] = [
  { w: 375, h: 812, radius: 44 }, // 12 mini, 13 mini; also X, Xs, 11 Pro at 39
  { w: 414, h: 896, dpr: 2, radius: 41.5 }, // Xr, 11
  { w: 414, h: 896, dpr: 3, radius: 39 }, // Xs Max, 11 Pro Max
  { w: 390, h: 844, radius: 47.33 }, // 12, 12 Pro, 13, 13 Pro, 14, 16e
  { w: 428, h: 926, radius: 53.33 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { w: 393, h: 852, radius: 55 }, // 14 Pro, 15, 15 Pro, 16
  { w: 430, h: 932, radius: 55 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { w: 402, h: 874, radius: 62 }, // 16 Pro, 17, 17 Pro
  { w: 440, h: 956, radius: 62 }, // 16 Pro Max, 17 Pro Max
  { w: 420, h: 912, radius: 62 }, // Air
]

/** An iPhone this table doesn't know (a new one, or one on Display Zoom): the recent phones' share of width. */
const IPHONE_RADIUS_SHARE = 0.14
/**
 * Android phones don't say which they are (Firefox names no model, Chrome
 * names "K"), and their corners run from nearly square to very round. This is
 * the middle of the current ones, about 37px on a 412px screen. A guess, and
 * the one number here that is.
 */
const ANDROID_RADIUS_SHARE = 0.09
/** Anything wider than a phone that still has a home indicator is a tablet, and theirs are shallow. */
const TABLET_RADIUS = 18
const PHONE_MAX_WIDTH = 500

const isIPhone = (ua: string) => /iPhone|iPod/.test(ua)
const isAndroid = (ua: string) => /Android/.test(ua)

/** The radius of this device's screen corners, CSS px, as near as a page can know it. */
export function glassRadius(facts: Pick<BottomFacts, 'userAgent' | 'screen' | 'dpr'>): number {
  const w = Math.min(facts.screen.w, facts.screen.h)
  const h = Math.max(facts.screen.w, facts.screen.h)
  if (w > PHONE_MAX_WIDTH) return TABLET_RADIUS
  if (isIPhone(facts.userAgent)) {
    const known = IPHONE_RADII.find(
      (d) => d.w === w && d.h === h && (d.dpr === undefined || d.dpr === Math.round(facts.dpr)),
    )
    return known ? known.radius : Math.round(w * IPHONE_RADIUS_SHARE)
  }
  if (isAndroid(facts.userAgent)) return Math.round(w * ANDROID_RADIUS_SHARE)
  return 0
}

/** The bottom edge an animation should run along on this device. */
export function bottomEdge(facts: BottomFacts): BottomEdge {
  // A bar the page is drawn behind: stay above it, square.
  if (facts.safeBottom >= BAR_MIN_PX) return { radius: 0, lift: facts.safeBottom }
  // Under a home indicator or a gesture pill the page is on the glass. So is a
  // phone's page as tall as its screen, whatever its browser says of insets.
  const fillsScreen = facts.inner.h >= Math.max(facts.screen.w, facts.screen.h) - 1 && facts.inner.h > facts.inner.w
  if (facts.safeBottom > 0 || fillsScreen) return { radius: glassRadius(facts), lift: 0 }
  // Otherwise the page stops short of the screen's bottom: a navigation bar, a
  // browser's toolbar, a desktop window. A rectangle.
  return SQUARE
}
