import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emailOk, loginOk, normEmail, passwordOk } from './login'

describe('login checks', () => {
  it('normalises an email the way the backend stores it', () => {
    expect(normEmail('  Me@Example.COM ')).toBe('me@example.com')
  })

  it('takes a plain address and refuses what plainly is not one', () => {
    expect(emailOk('me@example.com')).toBe(true)
    expect(emailOk(' me@example.com ')).toBe(true)
    for (const e of ['', 'me', 'me@', 'me@example', '@example.com', 'm e@example.com']) expect(emailOk(e)).toBe(false)
  })

  it('takes the addresses people have', () => {
    for (const e of ['me+gym@example.com', 'first.last@mail.example.co.uk', 'a_b-c%d@ex-ample.io', '_me@example.com', '7up@example.com', 'a@b.co']) {
      expect(emailOk(e), e).toBe(true)
    }
  })

  it('refuses one that opens like a formula or carries what no address needs', () => {
    for (const e of [
      '=me@example.com', '+me@example.com', '-me@example.com', '@me@example.com', '.me@example.com',
      '"me"@example.com', "o'brien@example.com", 'me&you@example.com', 'me(x)@example.com', 'me)@example.com',
      'me=x@example.com', 'me@exa mple.com', 'me@example.com"', 'me@-example.com', 'me@example-.com', 'me@example..com',
      'me@example.com.', 'me@@example.com', 'me@exam_ple.com', 'me@example.com<', 'mé@example.com',
    ]) {
      expect(emailOk(e), e).toBe(false)
    }
  })

  it('agrees with the backend on what an address is', () => {
    const backend = readFileSync('SimpleBackend.gs', 'utf8').match(/^const EMAIL_PATTERN = (\/.+\/)\r?$/m)?.[1]
    const app = readFileSync('src/lib/login.ts', 'utf8').match(/^const EMAIL_PATTERN = (\/.+\/)\r?$/m)?.[1]
    expect(backend).toBeTruthy()
    expect(app).toBe(backend)
  })

  it('wants at least eight characters of password', () => {
    expect(passwordOk('1234567')).toBe(false)
    expect(passwordOk('12345678')).toBe(true)
    expect(loginOk('me@example.com', 'short')).toBe(false)
    expect(loginOk('me@example.com', 'long enough')).toBe(true)
  })
})
