import { describe, expect, it } from 'vitest'
import { credentialFromHash, credentialFromText, signInLink, withoutCredential } from './signInLink'

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
