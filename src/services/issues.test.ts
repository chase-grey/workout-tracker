import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Isolate reportIssue from the network + Settings: stub the backend call and the
// token lookup so we can assert exactly what gets posted.
const { reportIssueMock, listIssuesMock, tokenRef } = vi.hoisted(() => ({
  reportIssueMock: vi.fn(),
  listIssuesMock: vi.fn(),
  tokenRef: { value: '' },
}))
vi.mock('./api', () => ({ api: { reportIssue: reportIssueMock, listIssues: listIssuesMock } }))
vi.mock('./chatEndpoint', () => ({ chatToken: () => tokenRef.value }))

import { reportIssue, listIssues } from './issues'

beforeEach(() => {
  tokenRef.value = 'secret-tok'
  reportIssueMock.mockReset().mockResolvedValue({
    number: 42,
    url: 'https://github.com/chase-grey/workout-tracker/issues/42',
  })
  listIssuesMock.mockReset().mockResolvedValue([])
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

describe('listIssues', () => {
  it('refuses without a coach token, and never calls the backend', async () => {
    tokenRef.value = ''
    await expect(listIssues()).rejects.toThrow(/coach token/i)
    expect(listIssuesMock).not.toHaveBeenCalled()
  })

  it('passes the token and returns the tracked issues', async () => {
    listIssuesMock.mockResolvedValue([
      { number: 7, title: 'timer broke', url: 'u', state: 'open', createdAt: 't' },
    ])
    const res = await listIssues()
    expect(listIssuesMock).toHaveBeenCalledWith('secret-tok')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ number: 7, state: 'open' })
  })
})
