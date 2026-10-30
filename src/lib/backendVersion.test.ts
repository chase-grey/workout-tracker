import { describe, expect, it } from 'vitest'
import { backendBehind, backendBehindText, liveBackendVersion } from './backendVersion'

describe('liveBackendVersion', () => {
  it('reads the number a current backend answers', () => {
    expect(liveBackendVersion({ version: 3 })).toBe(3)
  })
  it('reads a backend without the route as version 0', () => {
    expect(liveBackendVersion({ error: 'Unknown route' })).toBe(0)
    expect(liveBackendVersion(null)).toBe(0)
    expect(liveBackendVersion({ version: 'three' })).toBe(0)
    expect(liveBackendVersion({ version: -1 })).toBe(0)
  })
})

describe('backendBehind', () => {
  it('is quiet until a live version is known', () => {
    expect(backendBehind(null, 2)).toBe(false)
  })
  it('fires only when the live backend is older than this build needs', () => {
    expect(backendBehind(0, 1)).toBe(true)
    expect(backendBehind(1, 2)).toBe(true)
    expect(backendBehind(2, 2)).toBe(false)
    expect(backendBehind(3, 2)).toBe(false)
  })
})

it('names both versions and the fix', () => {
  expect(backendBehindText(0, 1)).toBe(
    'Deployed backend is version 0; this app needs 1. Redeploy SimpleBackend.gs.',
  )
})
