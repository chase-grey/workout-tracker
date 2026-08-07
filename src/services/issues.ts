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

export type IssueArea = 'plan' | 'chat' | 'timer' | 'history' | 'other'

export type ReportIssueInput = {
  title: string
  body?: string
  area?: IssueArea
}

export type ReportedIssue = { number: number; url: string }

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
