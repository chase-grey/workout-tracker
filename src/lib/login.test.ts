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

  it('wants at least eight characters of password', () => {
    expect(passwordOk('1234567')).toBe(false)
    expect(passwordOk('12345678')).toBe(true)
    expect(loginOk('me@example.com', 'short')).toBe(false)
    expect(loginOk('me@example.com', 'long enough')).toBe(true)
  })
})
