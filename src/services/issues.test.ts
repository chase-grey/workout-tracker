import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Isolate reportIssue from the network + Settings: stub the backend call and the
// token lookup so we can assert exactly what gets posted.
const { reportIssueMock, listIssuesMock, tokenRef, cacheRef } = vi.hoisted(() => ({
  reportIssueMock: vi.fn(),
  listIssuesMock: vi.fn(),
  tokenRef: { value: '' },
  // Stands in for localStorage, which the node test env doesn't have.
  cacheRef: { value: null as unknown },
}))
vi.mock('./api', () => ({ api: { reportIssue: reportIssueMock, listIssues: listIssuesMock } }))
vi.mock('./chatEndpoint', () => ({ chatToken: () => tokenRef.value }))
vi.mock('./storage', () => ({
  storage: {
    loadIssues: () => cacheRef.value,
    saveIssues: (v: unknown) => {
      cacheRef.value = v
    },
  },
}))

import { reportIssue, listIssues, cachedIssues, issueProgress } from './issues'
import type { TrackedIssue } from './issues'

beforeEach(() => {
  tokenRef.value = 'secret-tok'
  reportIssueMock.mockReset().mockResolvedValue({
    number: 42,
    url: 'https://github.com/chase-grey/workout-tracker/issues/42',
  })
  listIssuesMock.mockReset().mockResolvedValue([])
  cacheRef.value = null
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

describe('issueProgress', () => {
  const issue = (over: Partial<TrackedIssue> = {}): TrackedIssue => ({
    number: 7,
    title: 'timer broke',
    url: 'u',
    state: 'open',
    createdAt: 't',
    ...over,
  })

  it('is open for a filed issue nothing has touched yet', () => {
    expect(issueProgress(issue({ labels: ['from-app', 'auto-fix'] }))).toBe('open')
  })

  it('is working once the fixer claims it', () => {
    expect(issueProgress(issue({ labels: ['auto-fix', 'autofix-running'] }))).toBe('working')
  })

  it('is stalled when the fixer gave up and left it for a human', () => {
    expect(issueProgress(issue({ labels: ['auto-fix', 'autofix-failed'] }))).toBe('stalled')
  })

  it('is closed even if a claim label was left behind on a hand-closed issue', () => {
    expect(issueProgress(issue({ state: 'closed', labels: ['autofix-running'] }))).toBe('closed')
  })

  it('falls back to open/closed for a cached entry read before labels existed', () => {
    expect(issueProgress(issue())).toBe('open')
    expect(issueProgress(issue({ state: 'closed' }))).toBe('closed')
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

  it('caches what it read, so the next visit paints before the refresh lands', async () => {
    expect(cachedIssues()).toBeNull()
    listIssuesMock.mockResolvedValue([
      { number: 7, title: 'timer broke', url: 'u', state: 'open', createdAt: 't' },
    ])
    await listIssues()
    expect(cachedIssues()).toEqual([
      { number: 7, title: 'timer broke', url: 'u', state: 'open', createdAt: 't' },
    ])
  })

  it('replaces the cache rather than merging, so a closed issue stops reading open', async () => {
    listIssuesMock.mockResolvedValue([
      { number: 7, title: 'timer broke', url: 'u', state: 'open', createdAt: 't' },
    ])
    await listIssues()
    listIssuesMock.mockResolvedValue([
      { number: 7, title: 'timer broke', url: 'u', state: 'closed', createdAt: 't', closedAt: 'c' },
    ])
    await listIssues()
    expect(cachedIssues()).toHaveLength(1)
    expect(cachedIssues()?.[0]).toMatchObject({ number: 7, state: 'closed' })
  })

  it('keeps the labels, which is how the fixer’s progress reaches the UI', async () => {
    listIssuesMock.mockResolvedValue([
      {
        number: 7,
        title: 'timer broke',
        url: 'u',
        state: 'open',
        createdAt: 't',
        labels: ['from-app', 'auto-fix', 'autofix-running'],
      },
    ])
    const res = await listIssues()
    expect(res[0].labels).toContain('autofix-running')
  })

  it('leaves the cache alone when the fetch fails', async () => {
    listIssuesMock.mockResolvedValue([
      { number: 7, title: 'timer broke', url: 'u', state: 'open', createdAt: 't' },
    ])
    await listIssues()
    listIssuesMock.mockRejectedValue(new Error('offline'))
    await expect(listIssues()).rejects.toThrow('offline')
    expect(cachedIssues()).toHaveLength(1)
  })
})
