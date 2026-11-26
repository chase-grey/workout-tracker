import { describe, expect, it } from 'vitest'
import { issueProofs, issueToken, withProof } from './issueToken'
import type { Profile } from './profile'

const owner = { owner: true } as Profile
const friend = { owner: false } as Profile

describe('issueProofs', () => {
  it("leads with the owner's account key, ahead of a token typed into Settings", () => {
    const signedIn = { chatToken: ' typed ', accountMode: 'hosted' as const, accountToken: ' key ', profile: owner }
    expect(issueProofs(signedIn)).toEqual(['key', 'typed'])
    expect(issueToken(signedIn)).toBe('key')
    // No profile yet is the owner's too (see ownerFlavour).
    expect(issueToken({ chatToken: '', accountMode: 'hosted', accountToken: 'key', profile: undefined })).toBe('key')
  })

  it('is the typed token alone on a device with no key', () => {
    expect(issueProofs({ chatToken: 'typed', accountMode: 'legacy', profile: undefined })).toEqual(['typed'])
    expect(issueProofs({ chatToken: 'typed', accountMode: 'hosted', accountToken: '', profile: owner })).toEqual(['typed'])
  })

  it("never offers anyone else's key", () => {
    expect(issueProofs({ chatToken: '', accountMode: 'hosted', accountToken: 'key', profile: friend })).toEqual([])
    expect(issueProofs({ chatToken: '', accountMode: 'local', accountToken: 'key', profile: owner })).toEqual([])
    expect(issueToken({ chatToken: '', accountMode: 'legacy', profile: owner })).toBe('')
  })

  it('offers one proof when the key and the token are the same', () => {
    expect(issueProofs({ chatToken: 'same', accountMode: 'hosted', accountToken: 'same', profile: owner })).toEqual(['same'])
  })
})

describe('withProof', () => {
  const refuse = () => Promise.reject(new Error('POST report_issue failed: Bad chat secret'))

  it('files with the key on a phone whose typed token is wrong', async () => {
    // The owner's phone on 2026-11-25: signed in, with a token the backend no longer takes.
    const proofs = issueProofs({ chatToken: 'stale', accountMode: 'hosted', accountToken: 'key', profile: owner })
    const tried: string[] = []
    const filed = await withProof(proofs, (p) => {
      tried.push(p)
      return p === 'key' ? Promise.resolve({ number: 53 }) : refuse()
    })
    expect(filed).toEqual({ number: 53 })
    expect(tried).toEqual(['key'])
  })

  it('falls back to the token when the key is the one refused', async () => {
    const tried: string[] = []
    const filed = await withProof(['key', 'typed'], (p) => {
      tried.push(p)
      return p === 'typed' ? Promise.resolve('ok') : refuse()
    })
    expect(filed).toBe('ok')
    expect(tried).toEqual(['key', 'typed'])
  })

  it('says so when every proof is refused', async () => {
    await expect(withProof(['key', 'typed'], refuse)).rejects.toThrow('Bad chat secret')
  })

  it('never tries again after any other failure, so a report is not filed twice', async () => {
    const tried: string[] = []
    await expect(
      withProof(['key', 'typed'], (p) => {
        tried.push(p)
        return Promise.reject(new Error('POST report_issue failed: GitHub post /issues failed (502)'))
      }),
    ).rejects.toThrow('502')
    expect(tried).toEqual(['key'])
  })
})
