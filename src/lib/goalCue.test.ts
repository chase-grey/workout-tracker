import { describe, it, expect } from 'vitest'
import { goalCueForExercise } from './goalCue'
import { epley1RM } from './epley'
import type { GoalSpec } from './goals'
import type { LockedProjection, LockedProjections } from './goalLock'

const TODAY = new Date(2026, 2, 1)

const lock = (over: Partial<LockedProjection> = {}): LockedProjection => ({
  goalId: 'squat_bodyweight',
  lockedAt: '2026-01-01',
  startValue: 170,
  target: 200,
  etaDate: '2026-07-01',
  slopePerWeek: 2,
  decayPerWeek: 0.97,
  ...over,
})

const goal = (over: Partial<GoalSpec> = {}): GoalSpec => ({
  id: 'squat_bodyweight',
  title: 'squat my bodyweight',
  unit: 'lbs',
  exerciseKey: 'barbell_squat',
  points: [
    { date: '2026-02-01', value: 182 },
    { date: '2026-02-15', value: 190 },
  ],
  target: 200,
  direction: 'up',
  ...over,
})

describe('goalCueForExercise', () => {
  it('turns the line into a weight that reproduces its e1RM at the given reps', () => {
    const locked: LockedProjections = { squat_bodyweight: lock() }
    const cue = goalCueForExercise(locked, [goal()], 'barbell_squat', 5, TODAY)
    expect(cue).not.toBeNull()
    expect(cue!.reps).toBe(5)
    expect(cue!.goalTitle).toBe('squat my bodyweight')
    // The prescribed weight, at those reps, lands on the line's e1RM (inverse Epley).
    expect(Math.abs(epley1RM(cue!.weightLbs, cue!.reps) - cue!.lineE1RM)).toBeLessThan(1)
  })

  it('reads the standing from the last session against the line on its date', () => {
    const locked: LockedProjections = { squat_bodyweight: lock() }
    const cue = goalCueForExercise(locked, [goal()], 'barbell_squat', 5, TODAY)
    // 190 at the last session beats where the line wanted it then.
    expect(cue!.standing).toBe('ahead')
    expect(cue!.aheadBy).toBeGreaterThan(0)
  })

  it('returns null when no locked goal rides on the exercise', () => {
    expect(goalCueForExercise({}, [goal()], 'barbell_squat', 5, TODAY)).toBeNull()
    // Locked, but a different lift.
    const locked: LockedProjections = { squat_bodyweight: lock() }
    expect(goalCueForExercise(locked, [goal()], 'flat_bench', 5, TODAY)).toBeNull()
  })

  it('leaves a goal counted in reps alone — there is no weight to prescribe', () => {
    const rungs = goal({
      id: 'pullups_4x10',
      title: '4×10 pull-ups',
      unit: 'reps',
      exerciseKey: 'weighted_pullups',
      measure: 'reps',
      points: [{ date: '2026-02-15', value: 7 }],
      target: 10,
    })
    const locked: LockedProjections = {
      pullups_4x10: lock({ goalId: 'pullups_4x10', startValue: 5, target: 10 }),
    }
    expect(goalCueForExercise(locked, [rungs], 'weighted_pullups', 8, TODAY)).toBeNull()
  })

  it('skips a goal already reached and picks the nearest un-reached one', () => {
    const reached = goal({
      id: 'squat_bodyweight',
      title: 'squat my bodyweight',
      target: 185, // 190 latest already clears it
    })
    const nearer = goal({
      id: 'squat_1_5x_bodyweight',
      title: 'squat 1.5× bodyweight',
      target: 200, // remaining 10
    })
    const farther = goal({
      id: 'squat_2x_bodyweight',
      title: 'squat 2× bodyweight',
      target: 270, // remaining 80
    })
    const locked: LockedProjections = {
      squat_bodyweight: lock({ goalId: 'squat_bodyweight', target: 185 }),
      squat_1_5x_bodyweight: lock({ goalId: 'squat_1_5x_bodyweight', target: 200 }),
      squat_2x_bodyweight: lock({ goalId: 'squat_2x_bodyweight', target: 270 }),
    }
    const cue = goalCueForExercise(locked, [reached, farther, nearer], 'barbell_squat', 5, TODAY)
    expect(cue!.goalTitle).toBe('squat 1.5× bodyweight')
  })
})

describe('a goal waiting on a real single', () => {
  /** Estimate past the target (190 vs 185), nothing lifted for a single yet. */
  const ready = (over: Partial<GoalSpec> = {}): GoalSpec =>
    goal({ target: 185, singles: [], ...over })

  it('cues the attempt itself: the weight, for one rep', () => {
    const locked: LockedProjections = { squat_bodyweight: lock({ target: 185 }) }
    const cue = goalCueForExercise(locked, [ready()], 'barbell_squat', 8, TODAY)
    expect(cue!.ready).toBe(true)
    expect(cue!.reps).toBe(1)
    expect(cue!.weightLbs).toBe(185)
  })

  it('asks for the weight on the lift being trained, converted back', () => {
    const press = ready({ exerciseKey: 'leg_press', scaleByKey: { leg_press: 0.45 } })
    const cue = goalCueForExercise({}, [press], 'leg_press', 8, TODAY)
    expect(cue!.weightLbs).toBe(415) // 185 squat pounds ÷ 0.45, up to a loadable 415
  })

  it('says so without a commitment — the target is the whole prescription', () => {
    const cue = goalCueForExercise({}, [ready()], 'barbell_squat', 8, TODAY)
    expect(cue!.ready).toBe(true)
    expect(cue!.lineE1RM).toBe(185)
  })

  it('outranks a goal still being worked toward on the same lift', () => {
    const locked: LockedProjections = {
      squat_bodyweight: lock({ target: 185 }),
      squat_1_5x_bodyweight: lock({ goalId: 'squat_1_5x_bodyweight', target: 195 }),
    }
    const open = goal({ id: 'squat_1_5x_bodyweight', title: 'squat 1.5× bodyweight', target: 195 })
    const cue = goalCueForExercise(locked, [open, ready()], 'barbell_squat', 8, TODAY)
    expect(cue!.goalTitle).toBe('squat my bodyweight')
    expect(cue!.ready).toBe(true)
  })

  it('goes quiet once the single is in the log', () => {
    const done = ready({ singles: [{ date: '2026-02-20', value: 186 }] })
    expect(goalCueForExercise({}, [done], 'barbell_squat', 8, TODAY)).toBeNull()
  })
})
