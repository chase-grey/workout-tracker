import { describe, it, expect } from 'vitest'
import {
  BODYWEIGHT_GAIN_CAP,
  buildGoals,
  FLEX_GAIN_DECAY,
  GOAL_IDS,
  isReached,
  reachedDate,
} from './goals'
import { SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'
import type { FlexEntry } from './flex'
import { project } from './predictions'

/** A fortnight of weigh-ins climbing 3 lbs a week — a good run, plus water. */
const HOT_FORTNIGHT = [
  { date: '2026-01-31', weightLbs: 164 },
  { date: '2026-02-07', weightLbs: 167 },
  { date: '2026-02-14', weightLbs: 170 },
]

const inputs = (bodyWeights: typeof HOT_FORTNIGHT) => ({
  workouts: [],
  bodyWeights,
  measurements: [],
  heightIn: 70,
})

describe('bodyweight goals cap the pace they project against', () => {
  const goals = buildGoals(inputs(HOT_FORTNIGHT))
  const bodyweightGoals = goals.filter(
    (g) => g.id === GOAL_IDS.weight180 || g.id === GOAL_IDS.weight190,
  )

  it('caps both of them at a pound a week', () => {
    expect(bodyweightGoals).toHaveLength(2)
    for (const g of bodyweightGoals) expect(g.capPerWeek).toBe(BODYWEIGHT_GAIN_CAP)
  })

  it('projects 180 ten weeks out, not three', () => {
    const g = goals.find((x) => x.id === GOAL_IDS.weight180)!
    const p = project(g.points, g.target, new Date(2026, 1, 14), { capPerWeek: g.capPerWeek })

    expect(p.observedSlopePerWeek).toBe(3)
    expect(p.slopePerWeek).toBe(1)
    expect(p.etaWeeks).toBe(10)
  })

  it('leaves the lift goals uncapped — their own taper handles it', () => {
    for (const g of goals.filter((x) => x.exerciseKey != null)) {
      expect(g.capPerWeek).toBeUndefined()
    }
  })
})

describe('flexibility goals join the goal set', () => {
  /** Improving split (70→100) and improving tailor's (60→80) across four sessions. */
  const flexEntries: FlexEntry[] = [
    { date: '2026-01-01', splitDeg: 70, tailorsLeftDeg: 58, tailorsRightDeg: 62 },
    { date: '2026-01-08', splitDeg: 80, tailorsLeftDeg: 63, tailorsRightDeg: 67 },
    { date: '2026-01-15', splitDeg: 90, tailorsLeftDeg: 68, tailorsRightDeg: 72 },
    { date: '2026-01-22', splitDeg: 100, tailorsLeftDeg: 78, tailorsRightDeg: 82 },
  ]
  const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries })

  it('adds one milestone goal per split and per tailors angle', () => {
    for (const deg of SPLIT_GOALS) {
      const g = goals.find((x) => x.id === `split_${deg}`)!
      expect(g).toBeDefined()
      expect(g.title).toBe(`${deg}° split`)
      expect(g.unit).toBe('°')
      expect(g.exerciseKey).toBeNull()
      expect(g.milestone).toBe(true)
    }
    for (const deg of TAILORS_GOALS) {
      const g = goals.find((x) => x.id === `tailors_${deg}`)!
      expect(g).toBeDefined()
      expect(g.title).toBe(`${deg}° tailor's pose`)
      expect(g.milestone).toBe(true)
    }
  })

  it('tapers every ladder rung', () => {
    for (const deg of SPLIT_GOALS) {
      expect(goals.find((x) => x.id === `split_${deg}`)!.decayPerWeek).toBe(FLEX_GAIN_DECAY)
    }
    for (const deg of TAILORS_GOALS) {
      expect(goals.find((x) => x.id === `tailors_${deg}`)!.decayPerWeek).toBe(FLEX_GAIN_DECAY)
    }
  })

  it('projects an improving split on track toward a far goal', () => {
    const g = goals.find((x) => x.id === 'split_180')!
    const p = project(g.points, g.target, new Date(2026, 0, 22), { decayPerWeek: g.decayPerWeek })
    expect(p.onTrack).toBe(true)
    expect(p.etaDate! > '2026-01-22').toBe(true)
  })

  it('holds the far rung back well past where a straight line would put it', () => {
    // 10°/week off the recent window, 80° short of a full split: drawn straight
    // that's eight weeks away. Tapering, the same pace takes twice as long.
    const g = goals.find((x) => x.id === 'split_180')!
    const straight = project(g.points, g.target, new Date(2026, 0, 22))
    const tapered = project(g.points, g.target, new Date(2026, 0, 22), {
      decayPerWeek: g.decayPerWeek,
    })

    expect(straight.etaWeeks).toBeCloseTo(8, 5)
    expect(tapered.etaWeeks).toBeGreaterThan(15)
  })

  it('gives no date to a rung a modest pace can never reach', () => {
    // 1.5°/week from 110° buys 15° in total before the taper runs it out (see
    // FLEX_GAIN_DECAY): 120 is a date, 150 is "keep stretching", not a date.
    const creeping: FlexEntry[] = [
      { date: '2026-01-08', splitDeg: 107, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-15', splitDeg: 108.5, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-22', splitDeg: 110, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    const slow = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: creeping })
    const at = (id: string) => {
      const g = slow.find((x) => x.id === id)!
      return project(g.points, g.target, new Date(2026, 0, 22), { decayPerWeek: g.decayPerWeek })
    }

    expect(at('split_120').onTrack).toBe(true)
    expect(at('split_150').onTrack).toBe(false)
    expect(at('split_150').etaDate).toBeNull()
  })

  it('lists the flex goals with empty series when no entries are given', () => {
    const bare = buildGoals(inputs(HOT_FORTNIGHT))
    for (const deg of SPLIT_GOALS) {
      expect(bare.find((x) => x.id === `split_${deg}`)!.points).toHaveLength(0)
    }
  })
})

describe('isReached judges milestones on the best reading, others on the latest', () => {
  const backslid: FlexEntry[] = [
    { date: '2026-01-01', splitDeg: 111, tailorsLeftDeg: null, tailorsRightDeg: null },
    { date: '2026-01-08', splitDeg: 94, tailorsLeftDeg: null, tailorsRightDeg: null },
  ]
  const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: backslid })

  it('keeps a split reached after a tighter session', () => {
    // Best is 111°, latest 94° — the 100° milestone stays in the bag.
    expect(isReached(goals.find((g) => g.id === 'split_100')!)).toBe(true)
  })

  it('leaves a milestone the best never crossed unreached', () => {
    expect(isReached(goals.find((g) => g.id === 'split_120')!)).toBe(false)
  })

  it('reads a bodyweight goal off the latest value, not the best', () => {
    // A run that peaked above 180 then slid back is not at 180 now.
    const slid = buildGoals(
      inputs([
        { date: '2026-01-31', weightLbs: 178 },
        { date: '2026-02-07', weightLbs: 181 },
        { date: '2026-02-14', weightLbs: 179 },
      ]),
    )
    expect(isReached(slid.find((g) => g.id === GOAL_IDS.weight180)!)).toBe(false)
  })
})

describe('reachedDate reports the day the target was first met', () => {
  it('dates a milestone to the session that crossed it', () => {
    const entries: FlexEntry[] = [
      { date: '2026-01-01', splitDeg: 94, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-08', splitDeg: 103, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-15', splitDeg: 108, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: entries })
    expect(reachedDate(goals.find((g) => g.id === 'split_100')!)).toBe('2026-01-08')
  })

  it('keeps the original date when a goal falls back off and returns', () => {
    const goals = buildGoals(
      inputs([
        { date: '2026-01-31', weightLbs: 181 },
        { date: '2026-02-07', weightLbs: 176 },
        { date: '2026-02-14', weightLbs: 182 },
      ]),
    )
    expect(reachedDate(goals.find((g) => g.id === GOAL_IDS.weight180)!)).toBe('2026-01-31')
  })

  it('gives no date for a target no reading ever met', () => {
    const goals = buildGoals(inputs(HOT_FORTNIGHT))
    expect(reachedDate(goals.find((g) => g.id === GOAL_IDS.weight190)!)).toBeNull()
  })
})
