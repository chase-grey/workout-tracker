import { describe, it, expect } from 'vitest'
import type { DayType, Side, WorkoutRow } from '../types'
import { lastStartSide, nextStartSides, otherSide } from './pushSide'
import { DEFAULT_PLAN } from '../config/plan'
import { performedExercises } from './performed'
import { sessionToRows } from './session'
import { buildSetOrder } from './circuit'

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
    expect(lastStartSide(pushSession('p1', '2026-08-03', 'left'), 'lateral_raise_l')).toBe('left')
    expect(lastStartSide(pushSession('p1', '2026-08-03', 'right'), 'lateral_raise_l')).toBe('right')
  })

  it('has nothing to say about a history with no sided work in it', () => {
    const rows = [row({ session_id: 'p1', exercise: 'flat_bench' })]
    expect(lastStartSide(rows, 'lateral_raise_l')).toBeNull()
  })

  it('takes the latest session, not the latest row', () => {
    const rows = [
      ...pushSession('p1', '2026-08-10', 'right'),
      ...pushSession('p2', '2026-08-03', 'left'),
    ]
    expect(lastStartSide(rows, 'lateral_raise_l')).toBe('right')
  })

  it('breaks a same-day tie on row order, since rows are appended in order', () => {
    const rows = [
      ...pushSession('p1', '2026-08-03', 'right'),
      ...pushSession('p2', '2026-08-03', 'left'),
    ]
    expect(lastStartSide(rows, 'lateral_raise_l')).toBe('left')
  })

  it('reads a pair off the last session that trained it, whatever day that was', () => {
    const rows = [
      ...pushSession('p1', '2026-08-03', 'left'),
      ...pushSession('f1', '2026-08-07', 'right').map((r) => ({ ...r, day_type: 'fullbody' as const })),
    ]
    expect(lastStartSide(rows, 'lateral_raise_l')).toBe('right')
    expect(lastStartSide(rows, 'lateral_raise_r')).toBe('right')
  })

  it('reads each pair off its own sessions', () => {
    const rows = [
      ...pushSession('p1', '2026-08-03', 'left'),
      ...pullSession('u1', '2026-08-05', 'right'),
    ]
    expect(lastStartSide(rows, 'lateral_raise_l')).toBe('left')
    expect(lastStartSide(rows, 'copenhagen_plank_r')).toBe('right')
  })

  it('ignores a supplemental-only session', () => {
    const rows = [row({ session_id: 'core1', exercise: 'deadbug' })]
    expect(lastStartSide(rows, 'lateral_raise_l')).toBeNull()
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
    expect(lastStartSide(rows, 'copenhagen_plank_r')).toBe('right')
  })
})

describe('nextStartSides', () => {
  /** Start, run and log one session the way the app does; returns what each pair led with. */
  function runSession(history: WorkoutRow[], dayType: DayType, i: number, skip: string[] = []) {
    const startSides = nextStartSides(history)
    const planned = performedExercises(DEFAULT_PLAN[dayType], { variant: i % 2 ? 'B' : 'A', length: 'full', startSides })
      .filter((e) => !skip.some((stem) => e.key.startsWith(stem)))
    const flow = buildSetOrder(planned, planned.map((e) => e.sets))
    const led: Record<string, Side> = {}
    for (const { exIndex } of flow) {
      const ex = planned[exIndex]
      if (ex.side) led[ex.key.replace(/_[lr]$/, '')] ??= ex.side
    }
    const rows = JSON.parse(JSON.stringify(sessionToRows({
      sessionId: `${dayType}${i}`, date: `2026-09-${10 + i}`, dayType,
      isHistorical: false, startSides,
      exercises: planned.map((e) => ({ exercise: e.key, sets: [
        { setNumber: 1, weightLbs: null, reps: e.repMin, done: true },
      ] })),
    }))) as WorkoutRow[]
    return { led, history: [...history, ...rows] }
  }

  it('flips every shipped pair each time it is trained, across a push, pull, full-body week', () => {
    // The lateral raise is on two of the three days. A turn kept per day led it
    // left, left, right, right; the movement's own turn is left, right, left, right.
    let history: WorkoutRow[] = []
    const turns: Record<string, Side[]> = {}
    for (let i = 0; i < 12; i++) {
      const out = runSession(history, (['push', 'pull', 'fullbody'] as const)[i % 3], i)
      history = out.history
      for (const [pair, side] of Object.entries(out.led)) (turns[pair] ??= []).push(side)
    }
    expect(Object.keys(turns).sort()).toEqual(['copenhagen_plank', 'lateral_raise', 'sideways_leg_raise'])
    expect(turns.lateral_raise).toHaveLength(8)
    for (const sides of Object.values(turns)) {
      expect(sides).toEqual(sides.map((_, n) => (n % 2 === 0 ? 'left' : 'right')))
    }
  })

  it('keeps a turn for each pair when two share a day and one is skipped', () => {
    let { history } = runSession([], 'pull', 0)
    // The Copenhagen plank sits this one out; the leg raise still takes its turn.
    const second = runSession(history, 'pull', 1, ['copenhagen_plank'])
    expect(second.led).toEqual({ sideways_leg_raise: 'right' })
    history = second.history
    // So the plank is still owed the right, while the leg raise is back on the left.
    expect(runSession(history, 'pull', 2).led).toEqual({ copenhagen_plank: 'right', sideways_leg_raise: 'left' })
  })

  it('runs a session started before pairs kept their own turns on its one pinned side', () => {
    const keys = performedExercises(DEFAULT_PLAN.pull, { length: 'full', startSide: 'right' })
      .filter((e) => e.side).map((e) => e.key)
    expect(keys).toEqual(['copenhagen_plank_r', 'copenhagen_plank_l', 'sideways_leg_raise_r', 'sideways_leg_raise_l'])
  })

  it('starts a brand-new history on the left', () => {
    expect(nextStartSides([]).lateral_raise_l).toBe('left')
  })

  it('leads with whichever side the last session did not', () => {
    expect(nextStartSides(pushSession('p1', '2026-08-03', 'left')).lateral_raise_l).toBe('right')
    expect(nextStartSides(pushSession('p1', '2026-08-03', 'right')).lateral_raise_l).toBe('left')
  })

  it('alternates every session, not every week', () => {
    // The A/B press variant resets each Monday; this must not, or a week with an
    // odd number of push sessions would repeat a side across the boundary.
    let rows: WorkoutRow[] = []
    const sides: Side[] = []
    for (let i = 0; i < 5; i++) {
      const side = nextStartSides(rows).lateral_raise_l
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
    expect(nextStartSides(rows).lateral_raise_l).toBe('right')
  })

  it('does not burn a turn on a session that never trained the pair', () => {
    // A pull + legs day logged before the Copenhagen plank shipped, or one where it
    // was skipped: it says nothing about which adductor went first, so the last one
    // that does is still what the next session turns over from.
    const rows = [
      ...pullSession('u1', '2026-08-03', 'left'),
      row({ session_id: 'u2', date: '2026-08-06', day_type: 'pull', exercise: 'weighted_pullups' }),
    ]
    expect(nextStartSides(rows).copenhagen_plank_r).toBe('right')
  })

  it('does not burn a turn on a workout that was never logged', () => {
    const rows = pushSession('p1', '2026-08-03', 'left')
    expect(nextStartSides(rows).lateral_raise_l).toBe('right')
    // Start it, abandon it, come back: still the right arm's turn.
    expect(nextStartSides(rows).lateral_raise_l).toBe('right')
  })

  it('recovers from a repeat instead of carrying it forward', () => {
    // What a drifted count used to leave behind: two sessions in a row on the left.
    // The next one reads the last of them and flips, so the repeat stops there.
    const rows = [
      ...pushSession('p1', '2026-08-03', 'left'),
      ...pushSession('p2', '2026-08-06', 'left'),
    ]
    const third = nextStartSides(rows).lateral_raise_l
    expect(third).toBe('right')
    expect(nextStartSides([...rows, ...pushSession('p3', '2026-08-09', third)]).lateral_raise_l).toBe('left')
  })
})
