import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_NOT_MADE, emailOk, loginOk, normEmail, passwordOk, registerOrSignIn } from './login'

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

  it('names the refusal the way the backend does', () => {
    expect(readFileSync('SimpleBackend.gs', 'utf8')).toContain(`const ACCOUNT_NOT_MADE = '${ACCOUNT_NOT_MADE}'`)
  })

  it('wants at least eight characters of password', () => {
    expect(passwordOk('1234567')).toBe(false)
    expect(passwordOk('12345678')).toBe(true)
    expect(loginOk('me@example.com', 'short')).toBe(false)
    expect(loginOk('me@example.com', 'long enough')).toBe(true)
  })
})

describe('making an account that may already be there', () => {
  const made = { saved: 1, token: 'new', name: 'Ann', owner: false }
  const held = { saved: 1, token: 'held', name: 'Ann', owner: false }
  const refusal = () => Promise.reject(new Error(`POST register failed: ${ACCOUNT_NOT_MADE}`))

  it('makes the account and never signs in when the email is free', async () => {
    let signIns = 0
    const who = await registerOrSignIn(() => Promise.resolve(made), () => { signIns++; return Promise.resolve(held) })
    expect(who).toBe(made)
    expect(signIns).toBe(0)
  })

  it('signs in with the same email and password when the account is already there', async () => {
    expect(await registerOrSignIn(refusal, () => Promise.resolve(held))).toBe(held)
  })

  it('reports the refusal, not the failed sign-in, when the password is not that account\'s', async () => {
    const wrong = () => Promise.reject(new Error('POST login failed: Wrong email or password'))
    await expect(registerOrSignIn(refusal, wrong)).rejects.toThrow(ACCOUNT_NOT_MADE)
    await expect(registerOrSignIn(refusal, wrong)).rejects.not.toThrow(/Wrong email/)
  })

  it('does not sign in after any other failure', async () => {
    let signIns = 0
    const signIn = () => { signIns++; return Promise.resolve(held) }
    for (const message of ["POST register failed: That email doesn't look right", 'POST register failed: 500', 'The operation timed out']) {
      await expect(registerOrSignIn(() => Promise.reject(new Error(message)), signIn)).rejects.toThrow(message)
    }
    expect(signIns).toBe(0)
  })
})
