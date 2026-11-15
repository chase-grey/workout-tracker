import { describe, expect, it } from 'vitest'
import { needsOwnerCheck, repairedOwnerProfile, settingsForSignIn } from './accountProfile'
import { mergeSettings, syncablePart } from './settingsSync'
import { calorieDayHit } from './profile'
import type { Profile } from './profile'
import type { Settings } from '../services/storage'

const base: Settings = { apiUrl: '', openAiKey: '', chatToken: '' }

// What the welcome flow saves for someone new: diet on, direction left on its
// default of "lose", a target sized for losing.
const welcomed: Profile = {
  name: 'new phone',
  pillars: ['strength', 'flexibility', 'diet'],
  dietDirection: 'lose',
  weeklyGoals: [{ from: '2026-11-09', goals: { workouts: 3, flex: 2, calDays: 6 } }],
  calorieGoals: [{ from: '2026-11-10', goal: 2200 }],
  createdAt: '2026-11-10T12:00:00.000Z',
}

describe('settingsForSignIn', () => {
  it("drops this device's profile, stamp and owner flag, and takes the account fields", () => {
    const next = settingsForSignIn(
      { ...base, profile: welcomed, updatedAt: '2026-11-10T12:00:00.000Z', accountMode: 'local', accountOwner: false, heightIn: 70 },
      { accountMode: 'hosted', accountToken: 'k', accountName: 'Chase' },
    )
    expect(next.profile).toBeUndefined()
    expect(next.updatedAt).toBeUndefined()
    expect(next.accountOwner).toBeUndefined()
    expect(next).toMatchObject({ accountMode: 'hosted', accountToken: 'k', accountName: 'Chase', heightIn: 70 })
  })

  it("leaves the owner's account without a profile, where before it kept the phone's", () => {
    const device: Settings = { ...base, profile: welcomed, updatedAt: '2026-11-10T12:00:00.000Z' }
    // The owner's synced settings: older, and carrying no profile.
    const owners = syncablePart({ ...base, heightIn: 71, updatedAt: '2026-11-01T00:00:00.000Z' })
    const fields: Partial<Settings> = { accountMode: 'hosted', accountToken: 'k' }

    const before = { ...device, ...fields }
    delete before.updatedAt
    expect(mergeSettings(before, owners).profile).toEqual(welcomed)

    expect(mergeSettings(settingsForSignIn(device, fields), owners).profile).toBeUndefined()
  })
})

describe('needsOwnerCheck', () => {
  const hosted: Settings = { ...base, accountMode: 'hosted', accountToken: 'k', profile: welcomed }

  it('asks about a hosted account holding a profile that is not marked as the owner', () => {
    expect(needsOwnerCheck(hosted)).toBe(true)
  })

  it('does not ask once the answer is known, without a profile, or for an owner-marked one', () => {
    expect(needsOwnerCheck({ ...hosted, accountOwner: false })).toBe(false)
    expect(needsOwnerCheck({ ...hosted, profile: undefined })).toBe(false)
    expect(needsOwnerCheck({ ...hosted, profile: { ...welcomed, owner: true } })).toBe(false)
  })

  it('never asks for a legacy device or one without a key', () => {
    expect(needsOwnerCheck({ ...hosted, accountMode: 'legacy' })).toBe(false)
    expect(needsOwnerCheck({ ...hosted, accountToken: ' ' })).toBe(false)
  })
})

describe('repairedOwnerProfile', () => {
  it("replaces a foreign profile on the owner's account with the owner's own", () => {
    const fixed = repairedOwnerProfile({ ...base, accountMode: 'hosted', accountOwner: true, profile: welcomed })
    expect(fixed?.owner).toBe(true)
    expect(fixed?.dietDirection).toBe('gain')
    // A 4,500 bulk day is a hit again.
    expect(calorieDayHit(4500, fixed!.calorieGoals.at(-1)!.goal, fixed!.dietDirection)).toBe(true)
  })

  it('treats a legacy device as the owner', () => {
    expect(repairedOwnerProfile({ ...base, accountMode: 'legacy', profile: welcomed })?.owner).toBe(true)
  })

  it("leaves everyone else's profile, the owner's own, and no profile alone", () => {
    expect(repairedOwnerProfile({ ...base, accountMode: 'hosted', accountOwner: false, profile: welcomed })).toBeNull()
    expect(repairedOwnerProfile({ ...base, accountMode: 'hosted', profile: welcomed })).toBeNull()
    expect(repairedOwnerProfile({ ...base, accountMode: 'hosted', accountOwner: true, profile: { ...welcomed, owner: true } })).toBeNull()
    expect(repairedOwnerProfile({ ...base, accountMode: 'hosted', accountOwner: true })).toBeNull()
  })
})
