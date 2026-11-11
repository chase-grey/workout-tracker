import { afterEach, describe, expect, it } from 'vitest'
import { BODYWEIGHT_GAIN_CAP, buildGoals, GOAL_IDS } from './goals'
import { goalsFor, TARGET_WEIGHT_GOAL_ID } from './profileGoals'
import { LEGACY_PILLARS, type Profile } from './profile'
import { setActiveProfile } from './profileStore'

const inputs = {
  workouts: [],
  bodyWeights: [
    { date: '2026-10-01', weightLbs: 200 },
    { date: '2026-10-08', weightLbs: 198 },
  ],
  measurements: [],
  heightIn: 70,
}

// Someone who has benched and measured a split: the two things a lift goal and
// a flexibility ladder each wait on before they show for anyone but the owner.
const active = {
  ...inputs,
  workouts: [
    {
      session_id: 's1',
      date: '2026-10-02',
      day_type: 'push' as const,
      exercise: 'flat_bench',
      set_number: 1,
      weight_lbs: 100,
      reps: 8,
      notes: '',
      is_historical: false,
    },
  ],
  flexEntries: [{ date: '2026-10-02', splitDeg: null, warmSplitDeg: 100, tailorsLeftDeg: null, tailorsRightDeg: null }],
}

const profile = (over: Partial<Profile> = {}): Profile => ({
  name: 'sam',
  pillars: [...LEGACY_PILLARS],
  weeklyGoals: [],
  calorieGoals: [],
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
})

const ids = (goals: { id: string }[]) => goals.map((g) => g.id)
const isFlex = (id: string) => /^(split|tailors|toeTouch|legLift)_/.test(id)

afterEach(() => setActiveProfile(null))

describe('goalsFor', () => {
  it('is buildGoals for no profile and for an owner-flavoured one', () => {
    expect(ids(goalsFor(null, inputs))).toEqual(ids(buildGoals(inputs)))
    expect(ids(goalsFor(profile({ owner: true }), inputs))).toEqual(ids(buildGoals(inputs)))
  })

  it("drops the owner's own goals for anyone else", () => {
    const got = ids(goalsFor(profile(), active))
    for (const id of [GOAL_IDS.weight180, GOAL_IDS.weight190, GOAL_IDS.benchTwoHundred, GOAL_IDS.sixPack]) {
      expect(got).not.toContain(id)
    }
    expect(got).toContain(GOAL_IDS.benchBodyweight)
  })

  it('drops the strength goals when strength is off', () => {
    const got = goalsFor(profile({ pillars: ['flexibility', 'diet'] }), active)
    expect(got.some((g) => g.exerciseKey != null)).toBe(false)
    expect(got.some((g) => isFlex(g.id))).toBe(true)
  })

  it('drops the flexibility ladders when flexibility is off', () => {
    const got = goalsFor(profile({ pillars: ['strength', 'diet'] }), active)
    expect(got.some((g) => isFlex(g.id))).toBe(false)
    expect(got.some((g) => g.exerciseKey != null)).toBe(true)
  })

  it('adds one bodyweight goal at the target, going down when losing', () => {
    const got = goalsFor(profile({ targetWeightLbs: 180, dietDirection: 'lose' }), inputs)
    const mine = got.filter((g) => g.id === TARGET_WEIGHT_GOAL_ID)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ title: '180 lbs', target: 180, direction: 'down', capPerWeek: BODYWEIGHT_GAIN_CAP })
    expect(mine[0].points).toHaveLength(2)
  })

  it('goes up when gaining, and follows the first weigh-in when it is not said', () => {
    expect(goalsFor(profile({ targetWeightLbs: 220, dietDirection: 'gain' }), inputs)[0].direction).toBe('up')
    expect(goalsFor(profile({ targetWeightLbs: 220 }), inputs)[0].direction).toBe('up')
    expect(goalsFor(profile({ targetWeightLbs: 180 }), inputs)[0].direction).toBe('down')
  })

  it('adds no bodyweight goal without a target, and copes with nothing logged', () => {
    const empty = { workouts: [], bodyWeights: [], measurements: [], heightIn: 0 }
    expect(ids(goalsFor(profile(), empty))).not.toContain(TARGET_WEIGHT_GOAL_ID)
    expect(goalsFor(profile({ targetWeightLbs: 150 }), empty)[0].points).toEqual([])
  })

  it("leaves the owner's dumbbell-rack cap off anyone else's bench goal", () => {
    const bench = (g: ReturnType<typeof buildGoals>) => g.find((x) => x.id === GOAL_IDS.benchBodyweight)!
    expect(bench(buildGoals(active)).capLbs).toBeDefined()
    setActiveProfile(profile())
    expect(bench(goalsFor(profile(), active)).capLbs).toBeUndefined()
  })

  it('shows a lift goal only once one of its lifts has been logged', () => {
    // Nothing logged: no bench, squat or pull-up goals to stare at.
    expect(goalsFor(profile(), inputs).some((g) => g.exerciseKey != null)).toBe(false)
    // Benched once: the bench goal arrives, the squat and pull-up ones still wait.
    const got = ids(goalsFor(profile(), active))
    expect(got).toContain(GOAL_IDS.benchBodyweight)
    expect(got).not.toContain(GOAL_IDS.squatBodyweight)
  })

  it('shows a flexibility ladder only once it has a measurement', () => {
    expect(goalsFor(profile(), inputs).some((g) => isFlex(g.id))).toBe(false)
    const got = ids(goalsFor(profile(), active))
    expect(got.some((id) => id.startsWith('split_'))).toBe(true)
    expect(got.some((id) => id.startsWith('toeTouch_'))).toBe(false)
  })
})
