import { describe, it, expect } from 'vitest'
import type { Side, WorkoutRow } from '../types'
import { lastStartSide, nextStartSide, otherSide } from './pushSide'

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

/** One push session's rows, led by `side`: a press, then both raises in order. */
function pushSession(id: string, date: string, side: Side): WorkoutRow[] {
  const raises =
    side === 'left'
      ? ['lateral_raise_l', 'lateral_raise_r']
      : ['lateral_raise_r', 'lateral_raise_l']
  return [
    row({ session_id: id, date, exercise: 'flat_bench', weight_lbs: 135, reps: 8 }),
    ...raises.map((exercise) => row({ session_id: id, date, exercise })),
  ]
}

/** One pull + legs session's rows, its Copenhagen pair led by `side`. */
function pullSession(id: string, date: string, side: Side): WorkoutRow[] {
  const held =
    side === 'left'
      ? ['copenhagen_plank_l', 'copenhagen_plank_r']
      : ['copenhagen_plank_r', 'copenhagen_plank_l']
  return [
    row({ session_id: id, date, day_type: 'pull', exercise: 'weighted_pullups', reps: 6 }),
    ...held.map((exercise) =>
      row({ session_id: id, date, day_type: 'pull', exercise, weight_lbs: null, reps: 30 }),
    ),
  ]
}

describe('otherSide', () => {
  it('flips', () => {
    expect(otherSide('left')).toBe('right')
    expect(otherSide('right')).toBe('left')
  })
})

describe('lastStartSide', () => {
  it('reads the side off whichever sided exercise the session logged first', () => {
    expect(lastStartSide(pushSession('p1', '2026-08-03', 'left'), 'push')).toBe('left')
    expect(lastStartSide(pushSession('p1', '2026-08-03', 'right'), 'push')).toBe('right')
  })

  it('has nothing to say about a history with no sided work in it', () => {
    const rows = [row({ session_id: 'p1', exercise: 'flat_bench' })]
    expect(lastStartSide(rows, 'push')).toBeNull()
  })

  it('takes the latest session, not the latest row', () => {
    const rows = [
      ...pushSession('p1', '2026-08-10', 'right'),
      ...pushSession('p2', '2026-08-03', 'left'),
    ]
    expect(lastStartSide(rows, 'push')).toBe('right')
  })

  it('breaks a same-day tie on row order, since rows are appended in order', () => {
    const rows = [
      ...pushSession('p1', '2026-08-03', 'right'),
      ...pushSession('p2', '2026-08-03', 'left'),
    ]
    expect(lastStartSide(rows, 'push')).toBe('left')
  })

  it('reads each day type off its own sessions', () => {
    const rows = [
      ...pushSession('p1', '2026-08-03', 'left'),
      ...pullSession('u1', '2026-08-05', 'right'),
    ]
    expect(lastStartSide(rows, 'push')).toBe('left')
    expect(lastStartSide(rows, 'pull')).toBe('right')
  })

  it('ignores a supplemental-only session', () => {
    const rows = [row({ session_id: 'core1', exercise: 'deadbug' })]
    expect(lastStartSide(rows, 'push')).toBeNull()
  })

  it('takes the one side a session logged when the other was skipped', () => {
    const rows = [
      row({ session_id: 'u1', date: '2026-08-05', day_type: 'pull', exercise: 'weighted_pullups' }),
      row({
        session_id: 'u1',
        date: '2026-08-05',
        day_type: 'pull',
        exercise: 'copenhagen_plank_r',
        reps: 30,
      }),
    ]
    expect(lastStartSide(rows, 'pull')).toBe('right')
  })
})

describe('nextStartSide', () => {
  it('starts a brand-new history on the left', () => {
    expect(nextStartSide([], 'push')).toBe('left')
  })

  it('leads with whichever side the last session did not', () => {
    expect(nextStartSide(pushSession('p1', '2026-08-03', 'left'), 'push')).toBe('right')
    expect(nextStartSide(pushSession('p1', '2026-08-03', 'right'), 'push')).toBe('left')
  })

  it('alternates every session, not every week', () => {
    // The A/B press variant resets each Monday; this must not, or a week with an
    // odd number of push sessions would repeat a side across the boundary.
    let rows: WorkoutRow[] = []
    const sides: Side[] = []
    for (let i = 0; i < 5; i++) {
      const side = nextStartSide(rows, 'push')
      sides.push(side)
      rows = [...rows, ...pushSession(`p${i}`, `2026-08-0${i + 1}`, side)]
    }
    expect(sides).toEqual(['left', 'right', 'left', 'right', 'left'])
  })

  it('turns over off what was actually led, not off what the session was offered', () => {
    // The override case: the session was offered the right side and started left
    // anyway. The right's turn comes next, rather than the left going a third time.
    const rows = [
      ...pushSession('p1', '2026-08-03', 'right'),
      ...pushSession('p2', '2026-08-06', 'left'),
    ]
    expect(nextStartSide(rows, 'push')).toBe('right')
  })

  it('does not burn a turn on a session that never trained the pair', () => {
    // A pull + legs day logged before the Copenhagen plank shipped, or one where it
    // was skipped: it says nothing about which adductor went first, so the last one
    // that does is still what the next session turns over from.
    const rows = [
      ...pullSession('u1', '2026-08-03', 'left'),
      row({ session_id: 'u2', date: '2026-08-06', day_type: 'pull', exercise: 'weighted_pullups' }),
    ]
    expect(nextStartSide(rows, 'pull')).toBe('right')
  })

  it('does not burn a turn on a workout that was never logged', () => {
    const rows = pushSession('p1', '2026-08-03', 'left')
    expect(nextStartSide(rows, 'push')).toBe('right')
    // Start it, abandon it, come back: still the right arm's turn.
    expect(nextStartSide(rows, 'push')).toBe('right')
  })

  it('recovers from a repeat instead of carrying it forward', () => {
    // What a drifted count used to leave behind: two sessions in a row on the left.
    // The next one reads the last of them and flips, so the repeat stops there.
    const rows = [
      ...pushSession('p1', '2026-08-03', 'left'),
      ...pushSession('p2', '2026-08-06', 'left'),
    ]
    const third = nextStartSide(rows, 'push')
    expect(third).toBe('right')
    expect(nextStartSide([...rows, ...pushSession('p3', '2026-08-09', third)], 'push')).toBe('left')
  })
})
