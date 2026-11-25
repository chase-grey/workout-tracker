import { describe, expect, it } from 'vitest'
import { BAR_MIN_PX, SQUARE, bottomEdge, glassRadius, type BottomFacts } from './screenBottom'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 17; Mobile; rv:160.0) Gecko/160.0 Firefox/160.0'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const facts = (over: Partial<BottomFacts>): BottomFacts => ({
  userAgent: DESKTOP,
  screen: { w: 1920, h: 1080 },
  dpr: 1,
  inner: { w: 1200, h: 900 },
  safeBottom: 0,
  ...over,
})

describe('bottomEdge', () => {
  it("is square on Chase's phone, whose page stops above the navigation bar", () => {
    // Firefox for Android, installed: 363x731 of page, no bottom inset reported.
    const edge = bottomEdge(
      facts({ userAgent: FIREFOX_ANDROID, screen: { w: 363, h: 787 }, dpr: 2.975, inner: { w: 363, h: 731 } }),
    )
    expect(edge).toEqual(SQUARE)
  })

  it('curves with the glass on an installed iPhone', () => {
    // Installed, the window is short of the screen by the status bar, and the
    // home indicator is what says the page is on the glass.
    const edge = bottomEdge(
      facts({ userAgent: IPHONE, screen: { w: 393, h: 852 }, dpr: 3, inner: { w: 393, h: 793 }, safeBottom: 34 }),
    )
    expect(edge).toEqual({ radius: 55, lift: 0 })
  })

  it('is square in an iPhone browser tab, above the toolbar', () => {
    const edge = bottomEdge(
      facts({ userAgent: IPHONE, screen: { w: 393, h: 852 }, dpr: 3, inner: { w: 393, h: 659 }, safeBottom: 0 }),
    )
    expect(edge).toEqual(SQUARE)
  })

  it('is square on an iPhone with a home button', () => {
    const edge = bottomEdge(
      facts({ userAgent: IPHONE, screen: { w: 375, h: 667 }, dpr: 2, inner: { w: 375, h: 647 }, safeBottom: 0 }),
    )
    expect(edge).toEqual(SQUARE)
  })

  it('curves on an Android page drawn behind the gesture pill', () => {
    const edge = bottomEdge(
      facts({ userAgent: CHROME_ANDROID, screen: { w: 412, h: 915 }, dpr: 2.625, inner: { w: 412, h: 915 }, safeBottom: 24 }),
    )
    expect(edge.lift).toBe(0)
    expect(edge.radius).toBeGreaterThan(20)
  })

  it('runs square along the top of a three-button bar the page is drawn behind', () => {
    const edge = bottomEdge(
      facts({ userAgent: CHROME_ANDROID, screen: { w: 412, h: 915 }, dpr: 2.625, inner: { w: 412, h: 915 }, safeBottom: 48 }),
    )
    expect(edge).toEqual({ radius: 0, lift: 48 })
  })

  it('curves on a phone whose page is the whole screen even with no inset reported', () => {
    const edge = bottomEdge(
      facts({ userAgent: FIREFOX_ANDROID, screen: { w: 363, h: 787 }, dpr: 2.975, inner: { w: 363, h: 787 } }),
    )
    expect(edge.radius).toBeGreaterThan(20)
  })

  it('is square in a desktop window, full screen or not', () => {
    expect(bottomEdge(facts({}))).toEqual(SQUARE)
    expect(bottomEdge(facts({ inner: { w: 1920, h: 1080 } }))).toEqual(SQUARE)
  })

  it('draws the line between a handle and a bar where no phone puts either', () => {
    expect(BAR_MIN_PX).toBeGreaterThan(34)
    expect(BAR_MIN_PX).toBeLessThan(48)
  })
})

describe('glassRadius', () => {
  const iphone = (w: number, h: number, dpr = 3) => glassRadius({ userAgent: IPHONE, screen: { w, h }, dpr })

  it('knows each iPhone screen', () => {
    expect(iphone(414, 896, 2)).toBe(41.5)
    expect(iphone(414, 896, 3)).toBe(39)
    expect(iphone(390, 844)).toBe(47.33)
    expect(iphone(428, 926)).toBe(53.33)
    expect(iphone(430, 932)).toBe(55)
    expect(iphone(402, 874)).toBe(62)
    expect(iphone(440, 956)).toBe(62)
  })

  it('keeps the larger radius where two phones share a screen', () => {
    expect(iphone(375, 812)).toBe(44)
  })

  it('reads a phone held sideways the same', () => {
    expect(iphone(852, 393)).toBe(55)
  })

  it('scales with the width on an iPhone it has not met', () => {
    const r = iphone(410, 890)
    expect(r).toBeGreaterThan(50)
    expect(r).toBeLessThan(65)
  })

  it('gives a tablet its shallow corner', () => {
    expect(glassRadius({ userAgent: IPHONE, screen: { w: 820, h: 1180 }, dpr: 2 })).toBe(18)
  })
})
