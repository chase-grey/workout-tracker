import { describe, it, expect } from 'vitest'
import { accountKey, accountModeOf, isLegacyDevice, mayReachBackend, type DeviceEvidence } from './account'
import type { Settings } from '../services/storage'

// The minimum a Settings object needs; everything else is optional.
function settings(over: Partial<Settings> = {}): Settings {
  return { apiUrl: '', openAiKey: '', chatToken: '', ...over }
}

const NONE: DeviceEvidence = { workouts: 0, bodyWeights: 0, calories: 0, flex: 0 }

describe('isLegacyDevice', () => {
  it('does not treat a blank device as legacy', () => {
    expect(isLegacyDevice(settings(), NONE)).toBe(false)
  })

  it('is legacy when settings have been written before', () => {
    expect(isLegacyDevice(settings({ updatedAt: '2026-03-01T00:00:00.000Z' }), NONE)).toBe(true)
  })

  it('is legacy when first-run setup was completed', () => {
    expect(isLegacyDevice(settings({ setupComplete: true }), NONE)).toBe(true)
  })

  it('is legacy when a height was recorded', () => {
    expect(isLegacyDevice(settings({ heightIn: 70 }), NONE)).toBe(true)
  })

  it('is legacy when a goal has been locked', () => {
    const lockedGoals = { someGoal: {} } as unknown as NonNullable<Settings['lockedGoals']>
    expect(isLegacyDevice(settings({ lockedGoals }), NONE)).toBe(true)
  })

  it('is legacy when any kind of cached data is present', () => {
    expect(isLegacyDevice(settings(), { ...NONE, workouts: 1 })).toBe(true)
    expect(isLegacyDevice(settings(), { ...NONE, bodyWeights: 1 })).toBe(true)
    expect(isLegacyDevice(settings(), { ...NONE, calories: 1 })).toBe(true)
    expect(isLegacyDevice(settings(), { ...NONE, flex: 1 })).toBe(true)
  })
})

describe('accountModeOf', () => {
  it('returns an explicit mode, even against legacy evidence', () => {
    expect(accountModeOf(settings({ accountMode: 'hosted' }), { ...NONE, workouts: 5 })).toBe('hosted')
    expect(accountModeOf(settings({ accountMode: 'local' }), { ...NONE, workouts: 5 })).toBe('local')
  })

  it('settles legacy evidence as legacy', () => {
    expect(accountModeOf(settings({ heightIn: 70 }), NONE)).toBe('legacy')
    expect(accountModeOf(settings(), { ...NONE, calories: 3 })).toBe('legacy')
  })

  it('is null for a device with nothing on it', () => {
    expect(accountModeOf(settings(), NONE)).toBeNull()
  })
})

describe('mayReachBackend', () => {
  it('always lets a device with a custom apiUrl reach the backend', () => {
    expect(mayReachBackend(settings({ apiUrl: 'https://example.test/api' }))).toBe(true)
    expect(mayReachBackend(settings({ apiUrl: 'https://example.test/api', accountMode: 'local' }))).toBe(true)
  })

  it('lets a legacy device reach the backend', () => {
    expect(mayReachBackend(settings({ accountMode: 'legacy' }))).toBe(true)
  })

  it('lets a hosted device reach the backend only with a non-blank token', () => {
    expect(mayReachBackend(settings({ accountMode: 'hosted', accountToken: 'tok' }))).toBe(true)
    expect(mayReachBackend(settings({ accountMode: 'hosted', accountToken: '   ' }))).toBe(false)
    expect(mayReachBackend(settings({ accountMode: 'hosted' }))).toBe(false)
  })

  it('never lets a local device, or one with no mode, reach the backend', () => {
    expect(mayReachBackend(settings({ accountMode: 'local' }))).toBe(false)
    expect(mayReachBackend(settings())).toBe(false)
  })
})

describe('accountKey', () => {
  it('returns the token trimmed', () => {
    expect(accountKey(settings({ accountToken: '  abc123  ' }))).toBe('abc123')
  })

  it('is empty when there is no token', () => {
    expect(accountKey(settings())).toBe('')
    expect(accountKey(settings({ accountToken: '   ' }))).toBe('')
  })
})
