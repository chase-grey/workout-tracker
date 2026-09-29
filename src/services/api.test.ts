import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

vi.mock('./storage', () => ({ storage: { loadSettings: () => ({ apiUrl: 'https://example.com/api' }) } }))
afterEach(() => vi.unstubAllGlobals())
const rows = [{ session_id: 'one', exercise: 'squat', set_number: 1 }] as Parameters<typeof api.postSession>[0]
function response(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))
}
describe('save acknowledgments', () => {
  it.each([{}, null, { saved: 0 }, { saved: '1' }, { error: 'Unknown route' }, { saved: 1 }])(
    'retains a two-row save when acknowledgment is incomplete: %j', async (body) => {
      response(body)
      await expect(api.postSession([...rows, ...rows])).rejects.toThrow()
    },
  )
  it('accepts the legacy complete acknowledgment without a version field', async () => {
    response({ saved: 1 })
    await expect(api.postSession(rows)).resolves.toEqual({ saved: 1 })
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })
  it('accepts the explicit stale-settings acknowledgment', async () => {
    response({ saved: 0, stale: true })
    await expect(api.postSettings({})).resolves.toEqual({ saved: 0, stale: true })
  })
})


describe('body fat acknowledgments', () => {
  it('keeps the reading pending when an old server ignores the new field', async () => {
    response({ saved: 1 })
    await expect(api.postMeasurement({ date: '2026-09-29', waistIn: 32, neckIn: 15, bodyFatPct: 18.2 })).rejects.toThrow('Update the backend')
  })
  it('accepts a server that confirms body fat support', async () => {
    response({ saved: 1, bodyFatSupported: true })
    await expect(api.postMeasurement({ date: '2026-09-29', bodyFatPct: 18.2 })).resolves.toMatchObject({ saved: 1 })
  })
  it('still accepts legacy tape measurement saves', async () => {
    response({ saved: 1 })
    await expect(api.postMeasurement({ date: '2026-09-29', waistIn: 32, neckIn: 15 })).resolves.toEqual({ saved: 1 })
  })
})
