/**
 * What the coach hands to the backend's feedback tab when someone other than
 * the owner reports a problem or asks for a change.
 *
 * The owner's coach files a GitHub issue, which the auto-fixer picks up. Nobody
 * else holds the issue token, and nobody else's report should start a fix run
 * on its own: theirs land as rows in the owner's `feedback` sheet (see
 * appendFeedback in SimpleBackend.gs), stamped with who sent it and the build,
 * to be read and filed by hand.
 */

/** appendFeedback refuses anything longer. */
export const FEEDBACK_MAX_CHARS = 4000

export type CoachFeedbackInput = {
  title: string
  body?: string
  area?: string
}

/**
 * One feedback row's message: the summary, the details, the area, then as much
 * of the recent chat as still fits. The chat goes last and is the part cut,
 * from its oldest end, since the report itself is what the row is for and the
 * newest turns are the ones that led to it.
 */
export function coachFeedbackMessage(input: CoachFeedbackInput, chatTail?: string): string {
  const head = [
    input.title.trim(),
    input.body?.trim() ?? '',
    input.area ? `area: ${input.area}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, FEEDBACK_MAX_CHARS)
  const tail = chatTail?.trim()
  if (!tail) return head
  const label = '\n\nrecent chat:\n'
  const room = FEEDBACK_MAX_CHARS - head.length - label.length
  if (room <= 0) return head
  const chat = tail.length > room ? '…' + tail.slice(tail.length - room + 1) : tail
  return head + label + chat
}
