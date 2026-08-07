import { describe, it, expect } from 'vitest'
import { parseAsk } from './parseAsk.mjs'

describe('parseAsk', () => {
  it('reads the questions after the marker line', () => {
    expect(parseAsk('NEEDS-INPUT\nWhich screen is the timer on?')).toBe(
      'Which screen is the timer on?',
    )
  })

  it('keeps a multi-line question whole', () => {
    const out = 'NEEDS-INPUT\n1. Which day?\n2. Sets or reps?'
    expect(parseAsk(out)).toBe('1. Which day?\n2. Sets or reps?')
  })

  it('tolerates the markdown a model wraps a lone keyword in', () => {
    expect(parseAsk('**NEEDS-INPUT:**\nWhat colour?')).toBe('What colour?')
    expect(parseAsk('`needs input`\nWhat colour?')).toBe('What colour?')
  })

  it('ignores leading blank lines before the marker', () => {
    expect(parseAsk('\n\nNEEDS-INPUT\nWhat colour?')).toBe('What colour?')
  })

  it('is not asking when the marker is buried in a normal report', () => {
    const out = 'I fixed the timer.\nI considered replying NEEDS-INPUT but the issue was clear.'
    expect(parseAsk(out)).toBe('')
  })

  it('is not asking on an ordinary reply, empty output, or nothing at all', () => {
    expect(parseAsk('Fixed it — the timer now resets between sets.')).toBe('')
    expect(parseAsk('')).toBe('')
    expect(parseAsk(undefined)).toBe('')
  })

  it('is not asking when the marker arrives with no questions under it', () => {
    // Nothing to show on the phone, so this falls through to the stalled path
    // rather than parking the issue behind an empty prompt.
    expect(parseAsk('NEEDS-INPUT')).toBe('')
  })
})
