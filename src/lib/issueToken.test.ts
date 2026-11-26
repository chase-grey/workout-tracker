import { describe, expect, it } from 'vitest'
import { issueToken } from './issueToken'
import type { Profile } from './profile'

const owner = { owner: true } as Profile
const friend = { owner: false } as Profile

describe('issueToken', () => {
  it('is the token typed into Settings when there is one', () => {
    expect(issueToken({ chatToken: ' typed ', accountMode: 'hosted', accountToken: 'key', profile: owner })).toBe('typed')
    expect(issueToken({ chatToken: 'typed', accountMode: 'legacy', profile: undefined })).toBe('typed')
  })

  it("is the owner's account key on a device that signed in and was never given the token", () => {
    expect(issueToken({ chatToken: '', accountMode: 'hosted', accountToken: ' key ', profile: owner })).toBe('key')
    // No profile yet is the owner's too (see ownerFlavour).
    expect(issueToken({ chatToken: '', accountMode: 'hosted', accountToken: 'key', profile: undefined })).toBe('key')
  })

  it("is nothing for anyone else's key, or a device with neither", () => {
    expect(issueToken({ chatToken: '', accountMode: 'hosted', accountToken: 'key', profile: friend })).toBe('')
    expect(issueToken({ chatToken: '', accountMode: 'hosted', accountToken: '', profile: owner })).toBe('')
    expect(issueToken({ chatToken: '', accountMode: 'legacy', profile: owner })).toBe('')
    expect(issueToken({ chatToken: '', accountMode: 'local', accountToken: 'key', profile: owner })).toBe('')
  })
})
