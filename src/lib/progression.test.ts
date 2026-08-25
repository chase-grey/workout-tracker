import { describe, it, expect } from 'vitest'
import type { WorkoutRow } from '../types'
import {
  lastPerformance,
  nextTarget,
  nextTargets,
  STALE_HISTORY_DAYS,
  type TargetInputs,
} from './progression'

/**
 * Fixed "today", a few days after the fixture sessions. Without it these tests
 * would drift into the stale-history branch (which repeats the last set instead
 * of stepping up) as real time moves past the fixture dates.
 */
const TODAY = new Date(2026, 0, 12)

/** Build a WorkoutRow with sensible defaults, overriding what a test cares about. */
function row(overrides: Partial<WorkoutRow>): WorkoutRow {
  return {
    session_id: 's1',
    date: '2026-01-01',
    day_type: 'push',
    exercise: 'bench',
    set_number: 1,
    weight_lbs: null,
    reps: 0,
    notes: '',
    is_historical: false,
    ...overrides,
  }
}

describe('nextTarget', () => {
  it('returns { weightLbs: null, reps: repMin } when there is no history', () => {
    expect(nextTarget([], 'bench', { repMin: 6, repMax: 10 })).toEqual({
      weightLbs: null,
      reps: 6,
    })
  })

  it('adds a rep at the same weight when below the top of the range', () => {
    const rows = [row({ weight_lbs: 135, reps: 8 })]
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10, today: TODAY })).toEqual({
      weightLbs: 135,
      reps: 9,
    })
  })

  it('bumps weight and resets reps at the top of the range', () => {
    const rows = [row({ weight_lbs: 135, reps: 10 })]
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10, increment: 5, today: TODAY })).toEqual({
      weightLbs: 140,
      reps: 6,
    })
  })

  it('never prescribes more reps than repMax', () => {
    // A generous rep count last time shouldn't push the target past the range.
    const rows = [row({ weight_lbs: 135, reps: 14 })]
    const t = nextTarget(rows, 'bench', { repMin: 8, repMax: 12, increment: 5, today: TODAY })
    expect(t.reps).toBeLessThanOrEqual(12)
  })

  it('builds off the working weight, not a heavy single (the 150x2 bug)', () => {
    // Three working sets at 135 plus one heavy single at 150. Targeting 150x2
    // would prescribe 2 reps for an 8-12 exercise; the working set is 135x8. The
    // third set fell to 7, so 8 is asked for again rather than 9.
    const rows = [
      row({ set_number: 1, weight_lbs: 135, reps: 8 }),
      row({ set_number: 2, weight_lbs: 135, reps: 8 }),
      row({ set_number: 3, weight_lbs: 135, reps: 7 }),
      row({ set_number: 4, weight_lbs: 150, reps: 1 }),
    ]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: TODAY })).toEqual({
      weightLbs: 135,
      reps: 8,
    })
  })

  it('lightens the weight instead of prescribing 5 reps of an 8-12 lift', () => {
    // The reported case: 75x5 on an 8-12 overhead press. Asking for 75x6 next time
    // keeps the lift stuck below its own range, so drop to a weight that carries 8
    // reps at the same estimated effort (87.5 e1RM -> ~69 lb -> 65 on 5s).
    const rows = [row({ exercise: 'db_overhead_press', weight_lbs: 75, reps: 5 })]
    expect(
      nextTarget(rows, 'db_overhead_press', { repMin: 8, repMax: 12, increment: 5, today: TODAY }),
    ).toEqual({ weightLbs: 65, reps: 8 })
  })

  it('keeps the weight when a single added rep already reaches repMin', () => {
    // 7 reps of an 8-12 lift is one short: plain double progression gets there.
    const rows = [row({ weight_lbs: 135, reps: 7 })]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: TODAY })).toEqual({
      weightLbs: 135,
      reps: 8,
    })
  })

  it('rounds a lightened weight down to the exercise increment', () => {
    // On 2.5s the ~69 lb estimate floors to the 67.5 step, not 65.
    const rows = [row({ weight_lbs: 75, reps: 5 })]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, increment: 2.5, today: TODAY })).toEqual({
      weightLbs: 67.5,
      reps: 8,
    })
  })

  it('lightens the weight after a layoff rather than repeating an out-of-range set', () => {
    const rows = [row({ date: '2026-01-01', weight_lbs: 75, reps: 5 })]
    const backAfterABreak = new Date(2026, 0, 1 + STALE_HISTORY_DAYS + 1)
    expect(
      nextTarget(rows, 'bench', { repMin: 8, repMax: 12, increment: 5, today: backAfterABreak }),
    ).toEqual({ weightLbs: 65, reps: 8 })
  })

  it('still climbs a rep at a time for a bodyweight lift below its range', () => {
    // No load to shed, so the only way back into the range is more reps.
    const rows = [row({ exercise: 'pullup', weight_lbs: null, reps: 4 })]
    expect(nextTarget(rows, 'pullup', { repMin: 10, repMax: 15, today: TODAY })).toEqual({
      weightLbs: null,
      reps: 5,
    })
  })

  it('repeats the last working set after a long layoff instead of stepping up', () => {
    const rows = [row({ date: '2026-01-01', weight_lbs: 135, reps: 8 })]
    const backAfterABreak = new Date(2026, 0, 1 + STALE_HISTORY_DAYS + 1)
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: backAfterABreak })).toEqual({
      weightLbs: 135,
      reps: 8,
    })
  })

  it('still steps up when the gap is within the stale window', () => {
    const rows = [row({ date: '2026-01-01', weight_lbs: 135, reps: 8 })]
    const soonEnough = new Date(2026, 0, 1 + STALE_HISTORY_DAYS - 1)
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: soonEnough })).toEqual({
      weightLbs: 135,
      reps: 9,
    })
  })

  it('progresses reps only for a bodyweight exercise', () => {
    const rows = [row({ exercise: 'pullup', weight_lbs: null, reps: 12 })]
    expect(nextTarget(rows, 'pullup', { repMin: 10, repMax: 15, today: TODAY })).toEqual({
      weightLbs: null,
      reps: 13,
    })
  })

  it('stays at repMax for a bodyweight exercise already at the top of the range', () => {
    const rows = [row({ exercise: 'pullup', weight_lbs: null, reps: 15 })]
    expect(nextTarget(rows, 'pullup', { repMin: 10, repMax: 15, today: TODAY })).toEqual({
      weightLbs: null,
      reps: 15,
    })
  })

  it('re-paces a reps-only exercise after a layoff too', () => {
    // The bodyweight branch used to return before the staleness check, so a lift
    // with no weight was asked for a rep it had not trained for in months.
    const rows = [row({ exercise: 'pullup', date: '2026-01-01', weight_lbs: null, reps: 12 })]
    const backAfterABreak = new Date(2026, 0, 1 + STALE_HISTORY_DAYS + 1)
    expect(nextTarget(rows, 'pullup', { repMin: 10, repMax: 15, today: backAfterABreak })).toEqual({
      weightLbs: null,
      reps: 12,
    })
  })

  it('steps up from the reps a session held, not its one best set', () => {
    // The reported case: 8, 6, 5, 5 pull-ups was asked for 9 across all four sets —
    // a 50% jump in volume off a single set that happened to open strong. The
    // session held 5, so the honest ask is the bottom of the range, four times.
    const rows = [
      row({ exercise: 'pullup', set_number: 1, weight_lbs: null, reps: 8 }),
      row({ exercise: 'pullup', set_number: 2, weight_lbs: null, reps: 6 }),
      row({ exercise: 'pullup', set_number: 3, weight_lbs: null, reps: 5 }),
      row({ exercise: 'pullup', set_number: 4, weight_lbs: null, reps: 5 }),
    ]
    expect(nextTarget(rows, 'pullup', { repMin: 6, repMax: 10, today: TODAY })).toEqual({
      weightLbs: null,
      reps: 6,
    })
  })

  it('does not let one collapsed set erase a session that held its reps', () => {
    // Three clean sets and a fourth taken past the point of usefulness. Reading the
    // worst set would prescribe 4 for a session that plainly trained at 8 — so 8 is
    // what comes back, unbeaten but unlowered.
    const rows = [
      row({ exercise: 'pullup', set_number: 1, weight_lbs: null, reps: 8 }),
      row({ exercise: 'pullup', set_number: 2, weight_lbs: null, reps: 8 }),
      row({ exercise: 'pullup', set_number: 3, weight_lbs: null, reps: 8 }),
      row({ exercise: 'pullup', set_number: 4, weight_lbs: null, reps: 3 }),
    ]
    expect(nextTarget(rows, 'pullup', { repMin: 6, repMax: 10, today: TODAY })).toEqual({
      weightLbs: null,
      reps: 8,
    })
  })

  it('asks for the same reps again when one set fell short of them', () => {
    // The reported case: incline bench at 100 went 8, 8, 8, 6. Three of the four
    // sets it was asked for is not the rep earned, and moving the ask to 9 raises a
    // bar that was just missed — so 8 comes back until all four land.
    const rows = [
      row({ set_number: 1, weight_lbs: 100, reps: 8 }),
      row({ set_number: 2, weight_lbs: 100, reps: 8 }),
      row({ set_number: 3, weight_lbs: 100, reps: 8 }),
      row({ set_number: 4, weight_lbs: 100, reps: 6 }),
    ]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: TODAY })).toEqual({
      weightLbs: 100,
      reps: 8,
    })
  })

  it('steps up the week every set lands clean', () => {
    // The same lift, finished. Four at 8 earns the 9.
    const rows = [1, 2, 3, 4].map((set_number) =>
      row({ set_number, weight_lbs: 100, reps: 8 }),
    )
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: TODAY })).toEqual({
      weightLbs: 100,
      reps: 9,
    })
  })

  it('holds the weight when the last set of the range falls short', () => {
    // 12, 12, 12, 10 has not conquered a 8-12 range: bumping the load here sets a
    // weight off three sets, and the fourth set falls further behind at it.
    const rows = [
      row({ set_number: 1, weight_lbs: 135, reps: 12 }),
      row({ set_number: 2, weight_lbs: 135, reps: 12 }),
      row({ set_number: 3, weight_lbs: 135, reps: 12 }),
      row({ set_number: 4, weight_lbs: 135, reps: 10 }),
    ]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, increment: 5, today: TODAY })).toEqual({
      weightLbs: 135,
      reps: 12,
    })
  })

  it('bumps the weight once the whole session tops the range', () => {
    const rows = [1, 2, 3, 4].map((set_number) =>
      row({ set_number, weight_lbs: 135, reps: 12 }),
    )
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, increment: 5, today: TODAY })).toEqual({
      weightLbs: 140,
      reps: 8,
    })
  })

  it('ignores a back-off set when judging whether the working sets landed', () => {
    // Four clean sets at 185 and a lighter fifth to finish. The 135 is a different
    // load, not a set of 185 that fell short, so the step up is still earned.
    const rows = [
      row({ set_number: 1, weight_lbs: 185, reps: 8 }),
      row({ set_number: 2, weight_lbs: 185, reps: 8 }),
      row({ set_number: 3, weight_lbs: 185, reps: 8 }),
      row({ set_number: 4, weight_lbs: 135, reps: 5 }),
    ]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: TODAY })).toEqual({
      weightLbs: 185,
      reps: 9,
    })
  })

  it('waits for the whole session to reach repMax before bumping the weight', () => {
    // One set at the top of the range isn't the range conquered — 12, 9, 8, 8 is a
    // lift still mid-range, and bumping it here is how a weight gets set that the
    // next session can only hit once.
    const rows = [
      row({ set_number: 1, weight_lbs: 135, reps: 12 }),
      row({ set_number: 2, weight_lbs: 135, reps: 9 }),
      row({ set_number: 3, weight_lbs: 135, reps: 8 }),
      row({ set_number: 4, weight_lbs: 135, reps: 8 }),
    ]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, increment: 5, today: TODAY })).toEqual({
      weightLbs: 135,
      reps: 9,
    })
  })

  it('lightens a weight the session could not hold for the range', () => {
    // 155 carried one set to 8 and then fell apart. That's a load being trained
    // above its range, so it drops rather than being asked for 9.
    const rows = [
      row({ set_number: 1, weight_lbs: 155, reps: 8 }),
      row({ set_number: 2, weight_lbs: 155, reps: 5 }),
      row({ set_number: 3, weight_lbs: 155, reps: 5 }),
    ]
    // 155x5 estimates a 180.8 e1RM, which carries 8 reps at ~142.8 -> the 140 step.
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, increment: 5, today: TODAY })).toEqual({
      weightLbs: 140,
      reps: 8,
    })
  })

  it('does not let back-off sets ratchet the target downward', () => {
    // Two heavy working sets then three light back-off sets. The light weight is
    // the most common, but the heavy one is where sets reached the rep range, so
    // the target must build off 185 rather than dropping to the back-off weight.
    const rows = [
      row({ set_number: 1, weight_lbs: 185, reps: 8 }),
      row({ set_number: 2, weight_lbs: 185, reps: 8 }),
      row({ set_number: 3, weight_lbs: 135, reps: 12 }),
      row({ set_number: 4, weight_lbs: 135, reps: 12 }),
      row({ set_number: 5, weight_lbs: 135, reps: 12 }),
    ]
    expect(nextTarget(rows, 'bench', { repMin: 8, repMax: 12, today: TODAY })).toEqual({
      weightLbs: 185,
      reps: 9,
    })
  })

  it('rounds bumped weight to the nearest 0.5', () => {
    const rows = [row({ weight_lbs: 100, reps: 10 })]
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10, increment: 2.75, today: TODAY })).toEqual({
      weightLbs: 103,
      reps: 6,
    })
  })

  it('re-paces from the most recent (lower) session', () => {
    const rows = [
      // Earlier heavy session.
      row({ session_id: 's1', date: '2026-01-01', weight_lbs: 135, reps: 10 }),
      // Most recent session was lighter (user backed off).
      row({ session_id: 's2', date: '2026-01-08', weight_lbs: 125, reps: 7 }),
    ]
    // Target derives from the newer 125x7 session, not the older 135x10 one.
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10, today: TODAY })).toEqual({
      weightLbs: 125,
      reps: 8,
    })
  })
})

describe('nextTarget on a movement that takes no weight', () => {
  /** The sideways leg raise: no plate to add, so 15 reps is where the ladder starts. */
  const RAISE = { repMin: 15, repMax: 15, bodyweight: true, repLadder: true, today: TODAY }
  const raise = (reps: number, over: Partial<WorkoutRow> = {}) =>
    row({ exercise: 'sideways_leg_raise_l', weight_lbs: null, reps, ...over })

  it('opens at the starting number', () => {
    expect(nextTarget([], 'sideways_leg_raise_l', RAISE)).toEqual({ weightLbs: null, reps: 15 })
  })

  it('asks for one more than the last session held', () => {
    expect(nextTarget([raise(15)], 'sideways_leg_raise_l', RAISE)).toEqual({
      weightLbs: null,
      reps: 16,
    })
  })

  it('goes on climbing past the opening number, with no top to arrive at', () => {
    expect(nextTarget([raise(31)], 'sideways_leg_raise_l', RAISE)).toEqual({
      weightLbs: null,
      reps: 32,
    })
  })

  it('re-paces to a short session rather than re-asking for the number missed', () => {
    expect(nextTarget([raise(12)], 'sideways_leg_raise_l', RAISE)).toEqual({
      weightLbs: null,
      reps: 13,
    })
  })

  it('repeats the number until every set holds it', () => {
    // 18, 18, 15 was working at 18 and finished two of its three sets there, so 18
    // is the number to hold rather than the one to beat.
    const rows = [1, 2, 3].map((set_number) =>
      raise(set_number === 3 ? 15 : 18, { set_number }),
    )
    expect(nextTarget(rows, 'sideways_leg_raise_l', RAISE)).toEqual({
      weightLbs: null,
      reps: 18,
    })
  })

  it('keeps each side on its own ladder', () => {
    const rows = [raise(22), raise(16, { exercise: 'sideways_leg_raise_r' })]
    expect(nextTarget(rows, 'sideways_leg_raise_l', RAISE).reps).toBe(23)
    expect(nextTarget(rows, 'sideways_leg_raise_r', RAISE).reps).toBe(17)
  })
})

describe('nextTarget at a load ceiling', () => {
  /** The calf machine: 100 lbs is the whole stack, and 20 reps is what it does. */
  const CALF = { repMin: 20, repMax: 20, increment: 5, weightCapLbs: 100, today: TODAY }

  it('climbs a rep past the top of the range instead of adding weight', () => {
    const rows = [row({ exercise: 'calf_raise', weight_lbs: 100, reps: 20 })]
    expect(nextTarget(rows, 'calf_raise', CALF)).toEqual({ weightLbs: 100, reps: 21 })
  })

  it('goes on climbing, with no ceiling to arrive at', () => {
    const rows = [row({ exercise: 'calf_raise', weight_lbs: 100, reps: 34 })]
    expect(nextTarget(rows, 'calf_raise', CALF)).toEqual({ weightLbs: 100, reps: 35 })
  })

  it('does not lighten the load when a session lands under the floor', () => {
    // There's no lighter load to move to, and one short session is a bad day rather
    // than a weight set too heavy — so it asks for one more than what was managed.
    const rows = [row({ exercise: 'calf_raise', weight_lbs: 100, reps: 16 })]
    expect(nextTarget(rows, 'calf_raise', CALF)).toEqual({ weightLbs: 100, reps: 17 })
  })

  it('steps in weight the ordinary way while there is stack left', () => {
    const rows = [row({ exercise: 'calf_raise', weight_lbs: 85, reps: 20 })]
    expect(nextTarget(rows, 'calf_raise', CALF)).toEqual({ weightLbs: 90, reps: 20 })
  })

  it('lands the last step ON the cap rather than past it', () => {
    const rows = [row({ exercise: 'calf_raise', weight_lbs: 98, reps: 20 })]
    expect(nextTarget(rows, 'calf_raise', CALF)).toEqual({ weightLbs: 100, reps: 20 })
  })

  it('repeats rather than climbing after a layoff', () => {
    const rows = [row({ exercise: 'calf_raise', date: '2025-11-01', weight_lbs: 100, reps: 24 })]
    expect(nextTarget(rows, 'calf_raise', CALF)).toEqual({ weightLbs: 100, reps: 24 })
  })

  it('repeats rather than climbing when a set fell short of the rest', () => {
    // The reps are the only ladder here, so the same gate applies to them: 24, 24,
    // 20 asks for 24 again rather than 25.
    const rows = [
      row({ exercise: 'calf_raise', set_number: 1, weight_lbs: 100, reps: 24 }),
      row({ exercise: 'calf_raise', set_number: 2, weight_lbs: 100, reps: 24 }),
      row({ exercise: 'calf_raise', set_number: 3, weight_lbs: 100, reps: 20 }),
    ]
    expect(nextTarget(rows, 'calf_raise', CALF)).toEqual({ weightLbs: 100, reps: 24 })
  })

  it('leaves an uncapped lift bounded by its range', () => {
    const rows = [row({ weight_lbs: 135, reps: 10 })]
    expect(nextTarget(rows, 'bench', { repMin: 6, repMax: 10, increment: 5, today: TODAY })).toEqual({
      weightLbs: 140,
      reps: 6,
    })
  })
})

describe('lastPerformance', () => {
  it('returns null when the exercise has no rows', () => {
    expect(lastPerformance([], 'bench')).toBeNull()
  })

  it('picks the latest session and its working set', () => {
    const rows = [
      // Older session, heavier absolute weight — must be ignored.
      row({ session_id: 's1', date: '2026-01-01', set_number: 1, weight_lbs: 155, reps: 5 }),
      // Newer session: 145 appears in most sets, so that's the working weight,
      // and 7 is the best reps managed at it.
      row({ session_id: 's2', date: '2026-01-08', set_number: 1, weight_lbs: 135, reps: 8 }),
      row({ session_id: 's2', date: '2026-01-08', set_number: 2, weight_lbs: 145, reps: 6 }),
      row({ session_id: 's2', date: '2026-01-08', set_number: 3, weight_lbs: 145, reps: 7 }),
    ]
    expect(lastPerformance(rows, 'bench')).toEqual({
      date: '2026-01-08',
      topWeight: 145,
      topReps: 7,
      // The 145s went 6 then 7, so the session didn't hold 7 throughout.
      heldEverySet: false,
      sameSlot: true,
    })
  })

  it('ignores a heavy set that never reached the rep range', () => {
    const rows = [
      row({ set_number: 1, weight_lbs: 135, reps: 8 }),
      row({ set_number: 2, weight_lbs: 135, reps: 8 }),
      row({ set_number: 3, weight_lbs: 150, reps: 1 }),
    ]
    // A single rep is not training an 8-12 range, so 135 is the working weight.
    expect(lastPerformance(rows, 'bench', 8)).toEqual({
      date: '2026-01-01',
      topWeight: 135,
      topReps: 8,
      heldEverySet: true,
      sameSlot: true,
    })
  })

  it('takes the heaviest weight that did reach the range', () => {
    const rows = [
      row({ set_number: 1, weight_lbs: 135, reps: 12 }),
      row({ set_number: 2, weight_lbs: 150, reps: 8 }),
    ]
    expect(lastPerformance(rows, 'bench', 8)?.topWeight).toBe(150)
  })

  it('falls back to the modal weight when nothing reached the range', () => {
    // A bad day: no set hit repMin, so the weight most sets used wins and a lone
    // heavier attempt cannot inflate the next target.
    const rows = [
      row({ set_number: 1, weight_lbs: 135, reps: 4 }),
      row({ set_number: 2, weight_lbs: 135, reps: 3 }),
      row({ set_number: 3, weight_lbs: 155, reps: 1 }),
    ]
    expect(lastPerformance(rows, 'bench', 8)).toEqual({
      date: '2026-01-01',
      topWeight: 135,
      topReps: 4,
      // 4 then 3 at the modal weight: short of its own working reps as well.
      heldEverySet: false,
      sameSlot: true,
    })
  })

  it('treats every set as in-range when no repMin is given', () => {
    const rows = [
      row({ set_number: 1, weight_lbs: 135, reps: 8 }),
      row({ set_number: 2, weight_lbs: 140, reps: 6 }),
    ]
    expect(lastPerformance(rows, 'bench')?.topWeight).toBe(140)
  })

  it('reports max reps and null weight for a bodyweight session', () => {
    const rows = [
      row({ exercise: 'pullup', set_number: 1, weight_lbs: null, reps: 10 }),
      row({ exercise: 'pullup', set_number: 2, weight_lbs: null, reps: 12 }),
    ]
    expect(lastPerformance(rows, 'pullup')).toEqual({
      date: '2026-01-01',
      topWeight: null,
      topReps: 12,
      heldEverySet: false,
      sameSlot: true,
    })
  })
})

/**
 * Push + Core trains flat bench twice a week: leading variant B, and following
 * four other exercises in variant A. Each slot has to climb on its own ladder, or
 * the fresh press is prescribed off a tired session and the tired one is asked to
 * beat a fresh session it can't.
 */
describe('nextTarget across A/B slots', () => {
  /** Fresh flat bench (variant B), then the tired one two days later (variant A). */
  const twoSlots = [
    row({ session_id: 'b1', date: '2026-01-05', variant: 'B', weight_lbs: 185, reps: 8 }),
    row({ session_id: 'a1', date: '2026-01-07', variant: 'A', weight_lbs: 165, reps: 8 }),
  ]

  it('reads the matching slot, not simply the most recent session', () => {
    // The fresh slot steps up from its own 185, ignoring the 165 logged since.
    expect(
      nextTarget(twoSlots, 'bench', { repMin: 6, repMax: 10, today: TODAY, variant: 'B' }),
    ).toEqual({ weightLbs: 185, reps: 9 })
    // And the tired slot steps up from 165 rather than being handed 185.
    expect(
      nextTarget(twoSlots, 'bench', { repMin: 6, repMax: 10, today: TODAY, variant: 'A' }),
    ).toEqual({ weightLbs: 165, reps: 9 })
  })

  it('repeats rather than steps up when the slot has no history of its own', () => {
    // Only the fresh slot has been trained. The tired slot borrows its weight so a
    // known lift isn't treated as brand new, but doesn't demand a rep on top of a
    // number set under conditions it can't match.
    const freshOnly = [twoSlots[0]]
    expect(
      nextTarget(freshOnly, 'bench', { repMin: 6, repMax: 10, today: TODAY, variant: 'A' }),
    ).toEqual({ weightLbs: 185, reps: 8 })
    expect(lastPerformance(freshOnly, 'bench', 6, 'A')?.sameSlot).toBe(false)
  })

  it('treats a session with no slot recorded as comparable to either', () => {
    // Imported history and anything logged before the split shipped: there was no
    // second press of the day to sit behind, so both slots build on it.
    const legacy = [row({ date: '2026-01-05', weight_lbs: 175, reps: 8 })]
    for (const variant of ['A', 'B'] as const) {
      expect(nextTarget(legacy, 'bench', { repMin: 6, repMax: 10, today: TODAY, variant })).toEqual(
        { weightLbs: 175, reps: 9 },
      )
    }
  })

  it('ignores slots entirely when no variant is asked for', () => {
    // The lifts both variants train alike keep one ladder off every session.
    expect(nextTarget(twoSlots, 'bench', { repMin: 6, repMax: 10, today: TODAY })).toEqual({
      weightLbs: 165,
      reps: 9,
    })
  })
})

/**
 * A hold prescribed as a single number rather than a range — the Copenhagen plank's
 * 30 seconds (see PlannedExercise.timed).
 */
describe('a fixed timed hold', () => {
  const HOLD = { repMin: 30, repMax: 30, bodyweight: true, timed: true, today: TODAY }
  const held = (reps: number, date = '2026-01-08'): WorkoutRow[] => [
    row({ exercise: 'copenhagen_plank_l', date, reps, session_id: 's9' }),
    row({ exercise: 'copenhagen_plank_l', date, reps, session_id: 's9', set_number: 2 }),
    row({ exercise: 'copenhagen_plank_l', date, reps, session_id: 's9', set_number: 3 }),
  ]

  it('prescribes the hold on the first session', () => {
    expect(nextTarget([], 'copenhagen_plank_l', HOLD)).toEqual({ weightLbs: null, reps: 30 })
  })

  it('keeps prescribing it after a session that made the full hold', () => {
    expect(nextTarget(held(30), 'copenhagen_plank_l', HOLD)).toEqual({ weightLbs: null, reps: 30 })
  })

  it('does not re-pace down after a session that fell short', () => {
    // The one that matters: a set held for 22 is logged as 22, but the prescription
    // is still the 30 the plan asks for rather than 23.
    expect(nextTarget(held(22), 'copenhagen_plank_l', HOLD)).toEqual({ weightLbs: null, reps: 30 })
  })

  it('does not step up after a session that went longer', () => {
    expect(nextTarget(held(45), 'copenhagen_plank_l', HOLD)).toEqual({ weightLbs: null, reps: 30 })
  })

  it('holds the prescription across a layoff', () => {
    // Nothing to re-pace to: the hold is what it is however long you were away.
    expect(nextTarget(held(30, '2025-09-01'), 'copenhagen_plank_l', HOLD)).toEqual({
      weightLbs: null,
      reps: 30,
    })
  })

  it('still climbs a hold given a real range', () => {
    expect(
      nextTarget(held(30), 'copenhagen_plank_l', { ...HOLD, repMax: 45 }),
    ).toEqual({ weightLbs: null, reps: 31 })
  })
})

/**
 * The two tricep movements run off the same cable stack as a circuit, so they're
 * prescribed one weight between them rather than a number each to re-pin twice a
 * round (see PlannedExercise.sharedLoad).
 */
describe('nextTargets with a shared load', () => {
  const PUSHDOWN: TargetInputs = {
    key: 'tricep_pushdown',
    repMin: 10,
    repMax: 15,
    increment: 2.5,
    sharedLoad: 'triceps',
  }
  const EXTENSION: TargetInputs = { ...PUSHDOWN, key: 'overhead_tricep_ext' }
  const LATERAL: TargetInputs = { key: 'lateral_raise', repMin: 12, repMax: 20, increment: 2.5 }

  const targets = (rows: WorkoutRow[], exercises = [PUSHDOWN, LATERAL, EXTENSION]) =>
    nextTargets(rows, exercises, { today: TODAY })

  it('loads the group to the lighter suggestion, with the stronger move taking the reps', () => {
    // Pushdown topped its range at 40, so on its own it would earn 42.5; the
    // extension is still mid-range at 30. Asking the extension for 42.5 would put
    // it far short of its 10-rep minimum, so 30 is the weight both can train at —
    // and the pushdown absorbs the lighter load in reps, up to the top of its range.
    const rows = [
      row({ exercise: 'tricep_pushdown', weight_lbs: 40, reps: 15 }),
      row({ exercise: 'overhead_tricep_ext', weight_lbs: 30, reps: 12 }),
    ]
    const t = targets(rows)
    expect(t.get('tricep_pushdown')).toEqual({ weightLbs: 30, reps: 15 })
    expect(t.get('overhead_tricep_ext')).toEqual({ weightLbs: 30, reps: 13 })
  })

  it('leaves exercises outside the group exactly where nextTarget puts them', () => {
    const rows = [
      row({ exercise: 'tricep_pushdown', weight_lbs: 40, reps: 15 }),
      row({ exercise: 'overhead_tricep_ext', weight_lbs: 30, reps: 12 }),
      row({ exercise: 'lateral_raise', weight_lbs: 15, reps: 14 }),
    ]
    expect(targets(rows).get('lateral_raise')).toEqual(
      nextTarget(rows, 'lateral_raise', { repMin: 12, repMax: 20, increment: 2.5, today: TODAY }),
    )
  })

  it('holds the pair together, and climbs only once the weaker move earns it', () => {
    // Both now trained at 30. The pushdown is capped at the top of its range
    // instead of being handed a bump the extension can't follow…
    const holding = [
      row({ exercise: 'tricep_pushdown', weight_lbs: 30, reps: 15 }),
      row({ exercise: 'overhead_tricep_ext', weight_lbs: 30, reps: 13 }),
    ]
    const held = targets(holding)
    expect(held.get('tricep_pushdown')).toEqual({ weightLbs: 30, reps: 15 })
    expect(held.get('overhead_tricep_ext')).toEqual({ weightLbs: 30, reps: 14 })

    // …and once the extension reaches the top too, the whole group steps up.
    const earned = [
      row({ exercise: 'tricep_pushdown', weight_lbs: 30, reps: 15 }),
      row({ exercise: 'overhead_tricep_ext', weight_lbs: 30, reps: 15 }),
    ]
    const stepped = targets(earned)
    expect(stepped.get('tricep_pushdown')).toEqual({ weightLbs: 32.5, reps: 10 })
    expect(stepped.get('overhead_tricep_ext')).toEqual({ weightLbs: 32.5, reps: 10 })
  })

  it('reads the held-back move’s reps off what it actually lifted', () => {
    // The pushdown topped its range at 30. Pulled down to the extension's 25, the
    // reps come from the session it really trained, not from the 32.5 it would
    // have been given on its own — so the lighter load never reads as easier work.
    const rows = [
      row({ exercise: 'tricep_pushdown', weight_lbs: 30, reps: 15 }),
      row({ exercise: 'overhead_tricep_ext', weight_lbs: 25, reps: 11 }),
    ]
    const t = targets(rows)
    expect(t.get('tricep_pushdown')).toEqual({ weightLbs: 25, reps: 15 })
    expect(t.get('overhead_tricep_ext')).toEqual({ weightLbs: 25, reps: 12 })
  })

  it('starts a move with no history of its own at the group weight', () => {
    // The stack is already pinned there, which is the whole point of sharing it.
    const rows = [row({ exercise: 'tricep_pushdown', weight_lbs: 40, reps: 12 })]
    const t = targets(rows)
    expect(t.get('tricep_pushdown')).toEqual({ weightLbs: 40, reps: 13 })
    expect(t.get('overhead_tricep_ext')).toEqual({ weightLbs: 40, reps: 10 })
  })

  it('leaves the group blank while nothing in it has been logged', () => {
    const t = targets([])
    expect(t.get('tricep_pushdown')).toEqual({ weightLbs: null, reps: 10 })
    expect(t.get('overhead_tricep_ext')).toEqual({ weightLbs: null, reps: 10 })
  })

  it('does not share when only one member of the group is being trained', () => {
    const rows = [
      row({ exercise: 'tricep_pushdown', weight_lbs: 40, reps: 15 }),
      row({ exercise: 'overhead_tricep_ext', weight_lbs: 30, reps: 12 }),
    ]
    // The extension isn't in today's list, so the pushdown climbs on its own.
    expect(targets(rows, [PUSHDOWN, LATERAL]).get('tricep_pushdown')).toEqual({
      weightLbs: 42.5,
      reps: 10,
    })
  })

  it('never pulls a bodyweight move into a group — it has no load to share', () => {
    const dips: TargetInputs = {
      key: 'dips',
      repMin: 8,
      repMax: 12,
      bodyweight: true,
      sharedLoad: 'triceps',
    }
    const rows = [
      row({ exercise: 'tricep_pushdown', weight_lbs: 40, reps: 15 }),
      row({ exercise: 'dips', weight_lbs: null, reps: 10 }),
    ]
    const t = nextTargets(rows, [PUSHDOWN, dips], { today: TODAY })
    expect(t.get('dips')).toEqual({ weightLbs: null, reps: 11 })
    expect(t.get('tricep_pushdown')).toEqual({ weightLbs: 42.5, reps: 10 })
  })
})

describe('a max attempt is not a working set', () => {
  const rows = [
    row({ session_id: 'a', date: '2026-01-05', exercise: 'leg_press', weight_lbs: 300, reps: 8 }),
    row({ session_id: 'b', date: '2026-01-08', exercise: 'leg_press', weight_lbs: 380, reps: 1 }),
  ]

  it('reads the last session that trained the range, not the single after it', () => {
    expect(lastPerformance(rows, 'leg_press', 6)).toEqual({
      date: '2026-01-05',
      topWeight: 300,
      topReps: 8,
      heldEverySet: true,
      sameSlot: true,
    })
  })

  it('prescribes off those working sets rather than off the max', () => {
    const t = nextTarget(rows, 'leg_press', { repMin: 6, repMax: 10, increment: 10, today: TODAY })
    expect(t.weightLbs).toBe(300)
    expect(t.reps).toBe(9)
  })
})
