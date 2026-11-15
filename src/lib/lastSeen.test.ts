import { describe, expect, it } from 'vitest'
import { byLastSeen, lastSeenLabel, seenWithin } from './lastSeen'

const now = new Date(2026, 10, 15, 14, 0)
const ago = (days: number, hour = 9) => new Date(2026, 10, 15 - days, hour).toISOString()

describe('lastSeenLabel', () => {
  it('counts calendar days, not 24-hour spans', () => {
    expect(lastSeenLabel(ago(0), now)).toBe('today')
    expect(lastSeenLabel(new Date(2026, 10, 14, 23, 30).toISOString(), now)).toBe('yesterday')
    expect(lastSeenLabel(ago(3), now)).toBe('3 days ago')
  })

  it('rounds older visits into weeks and months', () => {
    expect(lastSeenLabel(ago(20), now)).toBe('2 weeks ago')
    expect(lastSeenLabel(ago(95), now)).toBe('3 months ago')
  })

  it('says never for a blank or unreadable stamp', () => {
    expect(lastSeenLabel('', now)).toBe('never')
    expect(lastSeenLabel('garbage', now)).toBe('never')
  })
})

describe('seenWithin', () => {
  it('is a rolling window', () => {
    expect(seenWithin(ago(6), now, 7)).toBe(true)
    expect(seenWithin(ago(8), now, 7)).toBe(false)
    expect(seenWithin('', now, 7)).toBe(false)
  })
})

describe('byLastSeen', () => {
  it('puts the most recent first and the never-seen last', () => {
    const people = [{ n: 'a', lastSeen: ago(5) }, { n: 'b', lastSeen: '' }, { n: 'c', lastSeen: ago(1) }]
    expect(byLastSeen(people).map((p) => p.n)).toEqual(['c', 'a', 'b'])
  })
})
