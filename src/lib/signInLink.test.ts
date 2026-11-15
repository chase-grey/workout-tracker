import { describe, expect, it } from 'vitest'
import {
  credentialFromHash,
  credentialFromText,
  isHandheld,
  isSignedInAs,
  signInLanding,
  signInLink,
  withoutCredential,
} from './signInLink'

const APP = 'https://chase-grey.github.io/workout-tracker/'
const hashOf = (link: string) => new URL(link).hash

describe('signInLink', () => {
  it('puts the credential in the fragment, never the query', () => {
    const link = signInLink(APP, { kind: 'key', key: 'abc123' })
    expect(link).toBe(`${APP}#key=abc123`)
    expect(new URL(link).search).toBe('')
  })

  it('round-trips an account key with characters a URL would mangle', () => {
    const link = signInLink(APP, { kind: 'key', key: ' a+b/c=d&e ' })
    expect(credentialFromHash(hashOf(link))).toEqual({ kind: 'key', key: 'a+b/c=d&e' })
  })

  it('round-trips the owner secret as its own kind', () => {
    const link = signInLink(APP, { kind: 'owner', secret: 's3cr#t' })
    expect(credentialFromHash(hashOf(link))).toEqual({ kind: 'owner', secret: 's3cr#t' })
  })

  it('replaces any fragment already on the app url', () => {
    expect(signInLink(`${APP}#old`, { kind: 'key', key: 'k' })).toBe(`${APP}#key=k`)
  })
})

describe('credentialFromHash', () => {
  it('is undefined without a credential', () => {
    for (const h of ['', '#', '#key=', '#owner=%20', '#other=1']) expect(credentialFromHash(h)).toBeUndefined()
  })
})

describe('withoutCredential', () => {
  it('drops the credential and an emptied fragment', () => {
    expect(withoutCredential(`${APP}?invite=X#key=k`)).toBe(`${APP}?invite=X`)
    expect(withoutCredential(`${APP}#owner=s`)).toBe(APP)
  })

  it('keeps the rest of the fragment', () => {
    expect(withoutCredential(`${APP}#key=k&a=1`)).toBe(`${APP}#a=1`)
  })

  it('leaves a url without a credential alone', () => {
    expect(withoutCredential(`${APP}#a=1`)).toBe(`${APP}#a=1`)
  })
})

describe('credentialFromText', () => {
  it('reads a pasted sign-in link', () => {
    expect(credentialFromText(` ${APP}#owner=s `)).toEqual({ kind: 'owner', secret: 's' })
    expect(credentialFromText(`${APP}#key=k`)).toEqual({ kind: 'key', key: 'k' })
  })

  it('takes anything else as an account key', () => {
    expect(credentialFromText(' abc ')).toEqual({ kind: 'key', key: 'abc' })
  })

  it('is undefined for blank text or a link without a credential', () => {
    expect(credentialFromText('  ')).toBeUndefined()
    expect(credentialFromText(`${APP}#a=1`)).toBeUndefined()
  })
})

describe('isSignedInAs', () => {
  const base = { chatToken: '' }
  it('matches a hosted account by its key', () => {
    expect(isSignedInAs({ ...base, accountMode: 'hosted', accountToken: 'k' }, { kind: 'key', key: 'k' })).toBe(true)
    expect(isSignedInAs({ ...base, accountMode: 'hosted', accountToken: 'j' }, { kind: 'key', key: 'k' })).toBe(false)
  })

  it('matches the owner by mode and issue token', () => {
    const owner = { kind: 'owner', secret: 's' } as const
    expect(isSignedInAs({ accountMode: 'legacy', chatToken: ' s ' }, owner)).toBe(true)
    expect(isSignedInAs({ accountMode: 'legacy', chatToken: '' }, owner)).toBe(false)
    expect(isSignedInAs({ accountMode: 'local', chatToken: 's' }, owner)).toBe(false)
  })
})

describe('isHandheld', () => {
  it('knows phones and tablets, including an iPad posing as a Mac', () => {
    expect(isHandheld('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true)
    expect(isHandheld('Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile', 5)).toBe(true)
    expect(isHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
  })

  it('takes a laptop for a laptop', () => {
    expect(isHandheld('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isHandheld('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 10)).toBe(false)
  })
})

describe('signInLanding', () => {
  it('offers the home screen only to a handheld still in the browser', () => {
    expect(signInLanding({ handheld: true, standalone: false })).toBe('install')
    expect(signInLanding({ handheld: true, standalone: true })).toBe('today')
    expect(signInLanding({ handheld: false, standalone: false })).toBe('today')
  })
})
