import { describe, expect, it } from 'vitest'
import { installOffer, isIOS } from './installPrompt'

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
