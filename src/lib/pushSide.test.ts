import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import { nextStartSide, otherSide, sessionsLogged, sideForIndex } from './pushSide'

function row(over: Partial<WorkoutRow> = {}): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-08-03',
    day_type: 'push',
    exercise: 'lateral_raise_l',
    set_number: 1,
    weight_lbs: 15,
    reps: 12,
    notes: '',
    is_historical: false,
    ...over,
  }
}

/** n logged push sessions, one row each, on consecutive dates. */
function pushHistory(n: number): WorkoutRow[] {
  return Array.from({ length: n }, (_, i) =>
    row({ session_id: `p${i}`, date: `2026-08-${String(i + 1).padStart(2, '0')}` }),
  )
}

describe('sideForIndex', () => {
  it('alternates, starting on the left', () => {
    expect([0, 1, 2, 3].map(sideForIndex)).toEqual(['left', 'right', 'left', 'right'])
  })
})

describe('otherSide', () => {
  it('flips', () => {
    expect(otherSide('left')).toBe('right')
    expect(otherSide('right')).toBe('left')
  })
})

describe('sessionsLogged', () => {
  it('counts distinct sessions of the day type only', () => {
    const rows = [
      ...pushHistory(2),
      row({ session_id: 'pull1', day_type: 'pull', exercise: 'cable_row' }),
    ]
    expect(sessionsLogged(rows, 'push')).toBe(2)
    expect(sessionsLogged(rows, 'pull')).toBe(1)
  })

  it('counts a multi-row session once', () => {
    const rows = [row({ set_number: 1 }), row({ set_number: 2 }), row({ exercise: 'flat_bench' })]
    expect(sessionsLogged(rows, 'push')).toBe(1)
  })

  it('ignores supplemental-only sessions, as the variant count does', () => {
    const rows = [row({ session_id: 'core1', exercise: 'deadbug' })]
    expect(sessionsLogged(rows, 'push')).toBe(0)
  })
})

describe('nextStartSide', () => {
  it('starts a brand-new history on the left', () => {
    expect(nextStartSide([], 'push')).toBe('left')
  })

  it('gives a different side every session, not every week', () => {
    // The A/B press variant resets each Monday; this must not, or a week with an
    // odd number of push sessions would repeat a side across the boundary.
    const sides = [0, 1, 2, 3, 4].map((n) => nextStartSide(pushHistory(n), 'push'))
    expect(sides).toEqual(['left', 'right', 'left', 'right', 'left'])
  })

  it('counts only the day being started', () => {
    const rows = [
      ...pushHistory(1),
      row({ session_id: 'pull1', day_type: 'pull', exercise: 'cable_row' }),
      row({ session_id: 'pull2', day_type: 'pull', exercise: 'cable_row' }),
    ]
    // One push logged, so push flips to the right; pull keeps its own count.
    expect(nextStartSide(rows, 'push')).toBe('right')
    expect(nextStartSide(rows, 'pull')).toBe('left')
  })

  it('does not burn a turn on a workout that was never logged', () => {
    const rows = pushHistory(1)
    expect(nextStartSide(rows, 'push')).toBe('right')
    // Start it, abandon it, come back: still the right arm's turn.
    expect(nextStartSide(rows, 'push')).toBe('right')
  })
})
