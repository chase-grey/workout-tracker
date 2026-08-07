import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Isolate reportIssue from the network + Settings: stub the backend call and the
// token lookup so we can assert exactly what gets posted.
const { reportIssueMock, tokenRef } = vi.hoisted(() => ({
  reportIssueMock: vi.fn(),
  tokenRef: { value: '' },
}))
vi.mock('./api', () => ({ api: { reportIssue: reportIssueMock } }))
vi.mock('./chatEndpoint', () => ({ chatToken: () => tokenRef.value }))

import { reportIssue } from './issues'

beforeEach(() => {
  tokenRef.value = 'secret-tok'
  reportIssueMock.mockReset().mockResolvedValue({
    number: 42,
    url: 'https://github.com/chase-grey/workout-tracker/issues/42',
  })
  // node test env has no DOM; collectContext reads these.
  vi.stubGlobal('navigator', { userAgent: 'test-agent' })
  vi.stubGlobal('location', { href: 'https://app.example/#/chat' })
})
afterEach(() => vi.unstubAllGlobals())

describe('reportIssue', () => {
  it('refuses without a coach token, and never calls the backend', async () => {
    tokenRef.value = ''
    await expect(reportIssue({ title: 'x' })).rejects.toThrow(/coach token/i)
    expect(reportIssueMock).not.toHaveBeenCalled()
  })

  it('posts the fields + runtime context and returns the created issue', async () => {
    const res = await reportIssue(
      { title: 'timer broke', body: 'does not reset', area: 'timer' },
      'user: hi\nassistant: hey',
    )
    expect(res).toEqual({
      number: 42,
      url: 'https://github.com/chase-grey/workout-tracker/issues/42',
    })
    expect(reportIssueMock).toHaveBeenCalledTimes(1)
    const arg = reportIssueMock.mock.calls[0][0]
    expect(arg).toMatchObject({
      secret: 'secret-tok',
      title: 'timer broke',
      body: 'does not reset',
      area: 'timer',
    })
    expect(arg.context).toContain('userAgent: test-agent')
    expect(arg.context).toContain('recent chat:')
    expect(arg.context).toContain('user: hi')
  })

  it('defaults body/area to empty strings when the model omits them', async () => {
    await reportIssue({ title: 'just a title' })
    const arg = reportIssueMock.mock.calls[0][0]
    expect(arg.body).toBe('')
    expect(arg.area).toBe('')
    expect(arg.context).not.toContain('recent chat:')
  })
})
