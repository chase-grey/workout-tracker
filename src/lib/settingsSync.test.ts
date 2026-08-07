import { describe, expect, it } from 'vitest'
import { mergeSettings, sameSyncedSettings, syncablePart, type SyncedSettings } from './settingsSync'
import type { Settings } from '../services/storage'
import type { LockedProjection } from './goalLock'

const base: Settings = { apiUrl: 'https://mine', openAiKey: 'sk-local', chatToken: 'tok' }

function lock(goalId: string, lockedAt: string, etaDate = '2026-12-01'): LockedProjection {
  return { goalId, lockedAt, startValue: 150, target: 180, etaDate, slopePerWeek: 1 }
}

describe('syncablePart', () => {
  it('drops the device-local fields and keeps the rest', () => {
    const part = syncablePart({ ...base, heightIn: 70, lockedGoals: { a: lock('a', '2026-01-01') } })
    expect(part).not.toHaveProperty('apiUrl')
    expect(part).not.toHaveProperty('openAiKey')
    expect(part).not.toHaveProperty('chatToken')
    expect(part.heightIn).toBe(70)
    expect(part.lockedGoals?.a.goalId).toBe('a')
  })
})

describe('mergeSettings', () => {
  it('leaves settings alone when the backend has nothing', () => {
    expect(mergeSettings(base, null)).toBe(base)
  })

  it('never takes credentials or the api url from the backend', () => {
    // The backend shouldn't hold these at all, but a hand-edited sheet might.
    const remote = { apiUrl: 'https://evil', openAiKey: 'sk-theirs', chatToken: 'theirs' } as SyncedSettings
    const merged = mergeSettings({ ...base, updatedAt: '2026-01-01T00:00:00Z' }, remote)
    expect(merged.apiUrl).toBe('https://mine')
    expect(merged.openAiKey).toBe('sk-local')
    expect(merged.chatToken).toBe('tok')
  })

  // The reinstall this module exists for: storage is gone, so the account's
  // committed goals come back rather than staying lost.
  it('restores committed goals onto a device that has never synced', () => {
    const remote: SyncedSettings = {
      updatedAt: '2026-06-01T00:00:00Z',
      heightIn: 70,
      lockedGoals: { squat: lock('squat', '2026-05-01') },
    }
    const merged = mergeSettings(base, remote)
    expect(merged.lockedGoals?.squat.lockedAt).toBe('2026-05-01')
    expect(merged.heightIn).toBe(70)
  })

  // The other half: locks made before settings synced never queued a write, so a
  // first fetch must not drop them just because the sheet is empty.
  it('keeps local commitments a never-synced device already held', () => {
    const local: Settings = { ...base, lockedGoals: { bench: lock('bench', '2026-04-01') } }
    const merged = mergeSettings(local, { updatedAt: '2026-06-01T00:00:00Z' })
    expect(merged.lockedGoals?.bench.lockedAt).toBe('2026-04-01')
  })

  it('merges commitments per goal, newest lock winning', () => {
    const local: Settings = {
      ...base,
      updatedAt: '2026-06-02T00:00:00Z',
      lockedGoals: { squat: lock('squat', '2026-06-01'), bench: lock('bench', '2026-01-01') },
    }
    const remote: SyncedSettings = {
      updatedAt: '2026-06-01T00:00:00Z',
      lockedGoals: {
        squat: lock('squat', '2026-02-01'), // older — local's stands
        bench: lock('bench', '2026-05-01'), // newer — wins
        sixPack: lock('sixPack', '2026-03-01'), // only the account has it
      },
    }
    const merged = mergeSettings(local, remote)
    expect(merged.lockedGoals?.squat.lockedAt).toBe('2026-06-01')
    expect(merged.lockedGoals?.bench.lockedAt).toBe('2026-05-01')
    expect(merged.lockedGoals?.sixPack.lockedAt).toBe('2026-03-01')
  })

  // A stale device must not erase a commitment just by having an older copy.
  it("does not let an older device's copy drop a newer commitment", () => {
    const local: Settings = { ...base, updatedAt: '2026-01-01T00:00:00Z', lockedGoals: {} }
    const remote: SyncedSettings = {
      updatedAt: '2026-06-01T00:00:00Z',
      lockedGoals: { squat: lock('squat', '2026-05-01') },
    }
    expect(mergeSettings(local, remote).lockedGoals?.squat).toBeDefined()
  })

  it('takes the newer side for plain fields', () => {
    const local: Settings = { ...base, updatedAt: '2026-06-02T00:00:00Z', heightIn: 71 }
    const remote: SyncedSettings = { updatedAt: '2026-06-01T00:00:00Z', heightIn: 70 }
    expect(mergeSettings(local, remote).heightIn).toBe(71)
    expect(mergeSettings({ ...local, updatedAt: '2026-05-01T00:00:00Z' }, remote).heightIn).toBe(70)
  })

  it('keeps a field the newer side has nothing to say about', () => {
    const local: Settings = { ...base, updatedAt: '2026-01-01T00:00:00Z', sixPackStatus: 'close' }
    const merged = mergeSettings(local, { updatedAt: '2026-06-01T00:00:00Z', heightIn: 70 })
    expect(merged.sixPackStatus).toBe('close')
    expect(merged.heightIn).toBe(70)
  })
})

describe('sameSyncedSettings', () => {
  it('ignores key order and undefined-valued keys', () => {
    const a: SyncedSettings = { heightIn: 70, updatedAt: '2026-06-01T00:00:00Z', sixPackStatus: undefined }
    const b: SyncedSettings = { updatedAt: '2026-06-01T00:00:00Z', heightIn: 70 }
    expect(sameSyncedSettings(a, b)).toBe(true)
  })

  it('sees a nested commitment change', () => {
    const a: SyncedSettings = { lockedGoals: { squat: lock('squat', '2026-01-01') } }
    const b: SyncedSettings = { lockedGoals: { squat: lock('squat', '2026-02-01') } }
    expect(sameSyncedSettings(a, b)).toBe(false)
  })
})
