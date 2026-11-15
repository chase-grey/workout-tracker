import { describe, it, expect } from 'vitest'
import { coachFeedbackMessage, FEEDBACK_MAX_CHARS } from './coachFeedback'

describe('coachFeedbackMessage', () => {
  it('puts the summary, details and area ahead of the chat', () => {
    const msg = coachFeedbackMessage(
      { title: 'Rest timer skips', body: 'It jumps to the next set.', area: 'timer' },
      'user: the timer skipped\nassistant: sorry',
    )
    expect(msg).toBe(
      'Rest timer skips\n\nIt jumps to the next set.\n\narea: timer\n\nrecent chat:\nuser: the timer skipped\nassistant: sorry',
    )
  })

  it('leaves out what was not given', () => {
    expect(coachFeedbackMessage({ title: 'Add a goal' })).toBe('Add a goal')
    expect(coachFeedbackMessage({ title: 'Add a goal' }, '  ')).toBe('Add a goal')
  })

  // The backend refuses a message over the limit, so the report has to fit, and
  // the chat — context, not the report — is what gives way, oldest end first.
  it('fits the backend limit by cutting the oldest chat', () => {
    const chat = 'x'.repeat(5000) + 'newest turn'
    const msg = coachFeedbackMessage({ title: 'Chart wrong' }, chat)
    expect(msg.length).toBe(FEEDBACK_MAX_CHARS)
    expect(msg.startsWith('Chart wrong\n\nrecent chat:\n…')).toBe(true)
    expect(msg.endsWith('newest turn')).toBe(true)
  })

  it('drops the chat entirely when the report alone fills the limit', () => {
    const msg = coachFeedbackMessage({ title: 'T', body: 'b'.repeat(5000) }, 'user: hi')
    expect(msg.length).toBe(FEEDBACK_MAX_CHARS)
    expect(msg).not.toContain('recent chat')
  })
})
