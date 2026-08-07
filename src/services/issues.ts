/**
 * Filing app bug reports as GitHub issues from the coach chat.
 *
 * The web bundle is public and holds no secret, so it can't call GitHub itself.
 * Instead it POSTs to the always-on Apps Script backend, which holds the GitHub
 * token and creates the issue (see createIssue in SimpleBackend.gs). We route
 * through Apps Script rather than the laptop tunnel so a bug report still lands
 * when the coach laptop is asleep.
 *
 * Gated by the same shared token as the chat (entered once in Settings), because
 * the backend URL itself is public in this bundle.
 */
import { api } from './api'
import { chatToken } from './chatEndpoint'
import { storage } from './storage'

export type IssueArea = 'plan' | 'chat' | 'timer' | 'history' | 'other'

export type ReportIssueInput = {
  title: string
  body?: string
  area?: IssueArea
}

export type ReportedIssue = { number: number; url: string }

/** An app-filed GitHub issue and its current progress, as read back for Settings. */
export type TrackedIssue = {
  number: number
  title: string
  url: string
  state: 'open' | 'closed'
  area?: string
  createdAt: string
  /** ISO close time, or '' while still open. */
  closedAt?: string
  /** Every label on the issue, so progress past open/closed can be read off. */
  labels?: string[]
}

/** One comment on an issue — either the fixer's question or an answer sent back. */
export type IssueComment = {
  id: number
  author: string
  body: string
  createdAt: string
}

/** An issue plus its comment thread, read when the fixer has asked something. */
export type IssueThread = {
  number: number
  title: string
  state: 'open' | 'closed'
  labels: string[]
  comments: IssueComment[]
}

/**
 * How far along an issue is, one step finer than GitHub's open/closed.
 *
 * `working` means the auto-fixer (scripts/autofix.mjs) has claimed the issue and
 * Claude is on it right now; `asks` means it stopped to ask something and is
 * waiting on an answer; `stalled` means it tried and backed off, leaving the
 * issue open for a human. All come from labels the fixer sets, so this is the
 * real state of the run and not a guess from timestamps.
 */
export type IssueProgress = 'open' | 'working' | 'asks' | 'stalled' | 'closed'

/** Labels scripts/autofix.mjs sets — RUNNING_LABEL, ASK_LABEL, FAILED_LABEL there. */
const WORKING_LABEL = 'autofix-running'
const ASKS_LABEL = 'needs-input'
const STALLED_LABEL = 'autofix-failed'

export function issueProgress(issue: TrackedIssue): IssueProgress {
  // Closed wins: the fixer removes its running label before closing, but a
  // hand-closed issue can still be carrying one.
  if (issue.state === 'closed') return 'closed'
  const labels = issue.labels ?? []
  // Ahead of `working`: the fixer drops its running label before asking, but the
  // two calls aren't atomic and an issue caught between them is asking, not running.
  if (labels.includes(ASKS_LABEL)) return 'asks'
  if (labels.includes(WORKING_LABEL)) return 'working'
  if (labels.includes(STALLED_LABEL)) return 'stalled'
  return 'open'
}

/** The issues the fixer is blocked on, oldest question first. */
export function issuesAwaitingAnswer(issues: TrackedIssue[] | null): TrackedIssue[] {
  return (issues ?? []).filter((i) => issueProgress(i) === 'asks')
}

/** A short, non-sensitive snapshot of the runtime, so an issue is actionable. */
function collectContext(chatTail?: string): string {
  const lines = [
    `userAgent: ${navigator.userAgent}`,
    `url: ${location.href}`,
    `mode: ${import.meta.env.MODE}`,
    `reportedAt: ${new Date().toISOString()}`,
  ]
  if (chatTail) lines.push('', 'recent chat:', chatTail)
  return lines.join('\n')
}

/**
 * File a GitHub issue via the backend. `chatTail` is an optional transcript of the
 * last few turns, attached as context. Returns the created issue's number + url.
 */
export async function reportIssue(
  input: ReportIssueInput,
  chatTail?: string,
): Promise<ReportedIssue> {
  const secret = chatToken()
  if (!secret) {
    throw new Error('add your coach token in Settings to file issues.')
  }
  return api.reportIssue({
    secret,
    title: input.title,
    body: input.body ?? '',
    area: input.area ?? '',
    context: collectContext(chatTail),
  })
}

/**
 * The last list read back from the tracker, or null if one never has been.
 * Settings paints this immediately and refreshes behind it: the round trip goes
 * through Apps Script to the GitHub API, which is slow enough that re-fetching
 * from scratch on every visit shows a spinner over issues that haven't changed
 * in weeks.
 */
export function cachedIssues(): TrackedIssue[] | null {
  return storage.loadIssues()
}

/**
 * The issues filed from the app, newest first, with their open/closed state.
 * Gated by the coach token like reportIssue — the backend holds the GitHub token
 * and the repo's issues can't be read from the public bundle without it.
 *
 * A successful read replaces the cache wholesale rather than merging: state
 * flips to closed and titles get edited on GitHub, so the server copy is the
 * only correct one.
 */
export async function listIssues(): Promise<TrackedIssue[]> {
  const secret = chatToken()
  if (!secret) {
    throw new Error('add your coach token in Settings to see filed issues.')
  }
  const list = await api.listIssues(secret)
  storage.saveIssues(list)
  return list
}

/** The comment thread on one issue — the fixer's question and anything since. */
export async function fetchIssueThread(number: number): Promise<IssueThread> {
  const secret = chatToken()
  if (!secret) {
    throw new Error('add your coach token in Settings to read this issue.')
  }
  return api.issueThread(secret, number)
}

/**
 * Reply to the fixer's question. The answer lands as an issue comment and the
 * backend hands the issue back to the fixer (`needs-input` off, `auto-fix` on),
 * so the next poll picks it up with the whole thread as context.
 */
export async function answerIssue(number: number, answer: string): Promise<void> {
  const secret = chatToken()
  if (!secret) {
    throw new Error('add your coach token in Settings to answer.')
  }
  const text = answer.trim()
  if (!text) throw new Error('write an answer first.')
  await api.answerIssue({ secret, number, answer: text })
}

/**
 * What the fixer is asking, taken from the newest comment on the thread.
 *
 * The `needs-input` label goes on immediately after the question is posted and
 * comes off the moment an answer is, so while an issue reads `asks` its last
 * comment IS the question. Both sides prefix their comments with a bold marker
 * line for anyone reading on GitHub; that line is noise in the app, so it's cut.
 */
export function latestQuestion(thread: IssueThread): string {
  const last = thread.comments[thread.comments.length - 1]
  if (!last) return ''
  return last.body.replace(/^\s*\*\*.*\*\*\s*\n+/, '').trim()
}
