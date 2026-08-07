import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Isolate reportIssue from the network + Settings: stub the backend call and the
// token lookup so we can assert exactly what gets posted.
const { reportIssueMock, listIssuesMock, issueThreadMock, answerIssueMock, tokenRef, cacheRef } =
  vi.hoisted(() => ({
    reportIssueMock: vi.fn(),
    listIssuesMock: vi.fn(),
    issueThreadMock: vi.fn(),
    answerIssueMock: vi.fn(),
    tokenRef: { value: '' },
    // Stands in for localStorage, which the node test env doesn't have.
    cacheRef: { value: null as unknown },
  }))
vi.mock('./api', () => ({
  api: {
    reportIssue: reportIssueMock,
    listIssues: listIssuesMock,
    issueThread: issueThreadMock,
    answerIssue: answerIssueMock,
  },
}))
vi.mock('./chatEndpoint', () => ({ chatToken: () => tokenRef.value }))
vi.mock('./storage', () => ({
  storage: {
    loadIssues: () => cacheRef.value,
    saveIssues: (v: unknown) => {
      cacheRef.value = v
    },
  },
}))

import {
  reportIssue,
  listIssues,
  cachedIssues,
  issueProgress,
  issuesAwaitingAnswer,
  fetchIssueThread,
  answerIssue,
  latestQuestion,
  partitionIssues,
} from './issues'
import type { IssueThread, TrackedIssue } from './issues'

beforeEach(() => {
  tokenRef.value = 'secret-tok'
  reportIssueMock.mockReset().mockResolvedValue({
    number: 42,
    url: 'https://github.com/chase-grey/workout-tracker/issues/42',
  })
  listIssuesMock.mockReset().mockResolvedValue([])
  issueThreadMock.mockReset().mockResolvedValue({
    number: 7,
    title: 'timer broke',
    state: 'open',
    labels: ['from-app', 'needs-input'],
    comments: [],
  })
  answerIssueMock.mockReset().mockResolvedValue({ answered: 7 })
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

  it('asks once the fixer has posted a question and parked the issue', () => {
    expect(issueProgress(issue({ labels: ['from-app', 'needs-input'] }))).toBe('asks')
  })

  it('still asks if the running label was left on alongside the question', () => {
    expect(issueProgress(issue({ labels: ['autofix-running', 'needs-input'] }))).toBe('asks')
  })

  it('stops asking once the answer takes the label back off', () => {
    expect(issueProgress(issue({ labels: ['from-app', 'auto-fix'] }))).toBe('open')
  })

  it('is closed even if a claim label was left behind on a hand-closed issue', () => {
    expect(issueProgress(issue({ state: 'closed', labels: ['autofix-running'] }))).toBe('closed')
  })

  it('falls back to open/closed for a cached entry read before labels existed', () => {
    expect(issueProgress(issue())).toBe('open')
    expect(issueProgress(issue({ state: 'closed' }))).toBe('closed')
  })
})

describe('issuesAwaitingAnswer', () => {
  const issue = (number: number, labels: string[]): TrackedIssue => ({
    number,
    title: 't',
    url: 'u',
    state: 'open',
    createdAt: 't',
    labels,
  })

  it('picks out only the issues waiting on an answer', () => {
    const list = [
      issue(1, ['auto-fix']),
      issue(2, ['needs-input']),
      issue(3, ['autofix-running']),
      issue(4, ['needs-input']),
    ]
    expect(issuesAwaitingAnswer(list).map((i) => i.number)).toEqual([2, 4])
  })

  it('is empty before a list has ever been read', () => {
    expect(issuesAwaitingAnswer(null)).toEqual([])
  })

  it('ignores a closed issue still carrying the label', () => {
    const closed: TrackedIssue = { ...issue(9, ['needs-input']), state: 'closed' }
    expect(issuesAwaitingAnswer([closed])).toEqual([])
  })
})

describe('partitionIssues', () => {
  const issue = (number: number, over: Partial<TrackedIssue> = {}): TrackedIssue => ({
    number,
    title: 't',
    url: 'u',
    state: 'open',
    createdAt: 't',
    ...over,
  })

  it('splits the closed issues out from everything still live', () => {
    const { active, closed } = partitionIssues([
      issue(1),
      issue(2, { state: 'closed' }),
      issue(3, { labels: ['needs-input'] }),
      issue(4, { state: 'closed', closedAt: 'c' }),
    ])
    expect(active.map((i) => i.number)).toEqual([1, 3])
    expect(closed.map((i) => i.number)).toEqual([2, 4])
  })

  it('keeps a working or stalled issue out of the closed pile', () => {
    const { active, closed } = partitionIssues([
      issue(1, { labels: ['autofix-running'] }),
      issue(2, { labels: ['autofix-failed'] }),
    ])
    expect(active).toHaveLength(2)
    expect(closed).toEqual([])
  })

  it('files a hand-closed issue that kept its running label as closed', () => {
    const { active, closed } = partitionIssues([
      issue(9, { state: 'closed', labels: ['autofix-running'] }),
    ])
    expect(active).toEqual([])
    expect(closed.map((i) => i.number)).toEqual([9])
  })

  it('gives back two empty lists for an empty list', () => {
    expect(partitionIssues([])).toEqual({ active: [], closed: [] })
  })
})

describe('latestQuestion', () => {
  const thread = (bodies: string[]): IssueThread => ({
    number: 7,
    title: 't',
    state: 'open',
    labels: ['needs-input'],
    comments: bodies.map((body, i) => ({ id: i, author: 'me', body, createdAt: 't' })),
  })

  it('takes the newest comment — while an issue asks, that is the question', () => {
    expect(latestQuestion(thread(['an older note', 'which day?']))).toBe('which day?')
  })

  it('drops the bold marker line both sides prefix their comments with', () => {
    const body = '**Auto-fix needs a bit more to go on:**\n\nWhich day is this on?'
    expect(latestQuestion(thread([body]))).toBe('Which day is this on?')
  })

  it('keeps bold text that is part of the question rather than a marker line', () => {
    expect(latestQuestion(thread(['Should **both** days change?']))).toBe(
      'Should **both** days change?',
    )
  })

  it('is empty on a thread with no comments at all', () => {
    expect(latestQuestion(thread([]))).toBe('')
  })
})

describe('fetchIssueThread', () => {
  it('refuses without a coach token, and never calls the backend', async () => {
    tokenRef.value = ''
    await expect(fetchIssueThread(7)).rejects.toThrow(/coach token/i)
    expect(issueThreadMock).not.toHaveBeenCalled()
  })

  it('passes the token and the number', async () => {
    const thread = await fetchIssueThread(7)
    expect(issueThreadMock).toHaveBeenCalledWith('secret-tok', 7)
    expect(thread.number).toBe(7)
  })
})

describe('answerIssue', () => {
  it('refuses without a coach token, and never calls the backend', async () => {
    tokenRef.value = ''
    await expect(answerIssue(7, 'push day')).rejects.toThrow(/coach token/i)
    expect(answerIssueMock).not.toHaveBeenCalled()
  })

  it('refuses to send an empty answer', async () => {
    await expect(answerIssue(7, '   ')).rejects.toThrow(/write an answer/i)
    expect(answerIssueMock).not.toHaveBeenCalled()
  })

  it('posts the trimmed answer against the issue', async () => {
    await answerIssue(7, '  push day, both sides  ')
    expect(answerIssueMock).toHaveBeenCalledWith({
      secret: 'secret-tok',
      number: 7,
      answer: 'push day, both sides',
    })
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
