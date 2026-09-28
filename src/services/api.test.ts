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
