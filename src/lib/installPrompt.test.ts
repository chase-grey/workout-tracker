import { describe, expect, it } from 'vitest'
import { installOffer, iosShareSpot, isIOS, isIosInAppBrowser } from './installPrompt'

const now = new Date('2026-11-15T12:00:00Z')
const base = { standalone: false, canPrompt: false, ios: false, dismissedAt: null, now }

describe('installOffer', () => {
  it('offers the Chrome dialog when one is waiting', () => {
    expect(installOffer({ ...base, canPrompt: true })).toBe('prompt')
  })
  it('points iOS at Add to Home Screen', () => {
    expect(installOffer({ ...base, ios: true })).toBe('ios')
  })
  it('offers nothing with no dialog and no iOS', () => {
    expect(installOffer(base)).toBeNull()
  })
  it('offers nothing once running from the home screen', () => {
    expect(installOffer({ ...base, standalone: true, canPrompt: true, ios: true })).toBeNull()
  })
  it('holds a dismissal for two weeks, then offers again', () => {
    const recent = new Date(now.getTime() - 13 * 86_400_000).toISOString()
    const old = new Date(now.getTime() - 15 * 86_400_000).toISOString()
    expect(installOffer({ ...base, canPrompt: true, dismissedAt: recent })).toBeNull()
    expect(installOffer({ ...base, canPrompt: true, dismissedAt: old })).toBe('prompt')
  })
  it('ignores a garbled dismissal', () => {
    expect(installOffer({ ...base, canPrompt: true, dismissedAt: 'nonsense' })).toBe('prompt')
  })
})

describe('isIOS', () => {
  it('knows an iPhone', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true)
  })
  it('knows an iPad posing as a Mac', () => {
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
  })
  it('leaves a real Mac and Android alone', () => {
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isIOS('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 5)).toBe(false)
  })
})

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1'
const IPAD_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.30.109 (iPhone15,2; iOS 18_0)'
const IPHONE_FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0.0;]'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'

describe('iosShareSpot', () => {
  it('puts Safari on an iPhone at the bottom', () => {
    expect(iosShareSpot(IPHONE_SAFARI, 5)).toBe('bottom')
  })
  it('puts Chrome on an iPhone at the top right', () => {
    expect(iosShareSpot(IPHONE_CHROME, 5)).toBe('top')
  })
  it('puts an iPad at the top, Safari or not', () => {
    expect(iosShareSpot('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Safari/604.1', 0)).toBe('top')
    expect(iosShareSpot(IPAD_SAFARI, 5)).toBe('top')
  })
  it('names both places for a browser it does not know', () => {
    expect(iosShareSpot(IPHONE_INSTAGRAM, 5)).toBe('both')
    expect(iosShareSpot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) FxiOS/130.0 Mobile/15E148', 5)).toBe('both')
  })
})

describe('isIosInAppBrowser', () => {
  it('knows an in-app browser on iOS', () => {
    expect(isIosInAppBrowser(IPHONE_INSTAGRAM, 5)).toBe(true)
    expect(isIosInAppBrowser(IPHONE_FACEBOOK, 5)).toBe(true)
  })
  it('leaves Safari and Chrome on iOS alone', () => {
    expect(isIosInAppBrowser(IPHONE_SAFARI, 5)).toBe(false)
    expect(isIosInAppBrowser(IPHONE_CHROME, 5)).toBe(false)
    expect(isIosInAppBrowser(IPAD_SAFARI, 5)).toBe(false)
  })
  it('leaves Android in-app browsers alone', () => {
    expect(isIosInAppBrowser(`${ANDROID_CHROME} Instagram 320.0.0.30.109`, 5)).toBe(false)
  })
})
