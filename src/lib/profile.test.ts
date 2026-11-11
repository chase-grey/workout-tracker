import { describe, it, expect } from 'vitest'
import {
  ageOf,
  calorieDayHit,
  hasPillar,
  maskGoals,
  ownerFlavour,
  profileCalorieGoal,
  profileWeeklyGoals,
  withCalorieGoal,
  withWeeklyGoals,
  type Profile,
} from './profile'

const ALL = ['strength', 'flexibility', 'cardio', 'diet'] as const

function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    name: 'Test',
    pillars: [...ALL],
    weeklyGoals: [{ from: '2026-01-05', goals: { workouts: 3, flex: 2, calDays: 5, cardio: 2 } }],
    calorieGoals: [{ from: '2026-01-05', goal: 2200 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('hasPillar', () => {
  it('uses the legacy pillars for a device with no profile', () => {
    expect(hasPillar(null, 'strength')).toBe(true)
    expect(hasPillar(null, 'flexibility')).toBe(true)
    expect(hasPillar(null, 'diet')).toBe(true)
    expect(hasPillar(null, 'cardio')).toBe(false)
    expect(hasPillar(undefined, 'cardio')).toBe(false)
  })

  it("uses the profile's own pillar list otherwise", () => {
    const p = makeProfile({ pillars: ['cardio'] })
    expect(hasPillar(p, 'cardio')).toBe(true)
    expect(hasPillar(p, 'strength')).toBe(false)
    expect(hasPillar(p, 'diet')).toBe(false)
  })
})

describe('ownerFlavour', () => {
  it('applies to a device with no profile', () => {
    expect(ownerFlavour(null)).toBe(true)
    expect(ownerFlavour(undefined)).toBe(true)
  })

  it('applies only to a profile flagged as the owner', () => {
    expect(ownerFlavour(makeProfile({ owner: true }))).toBe(true)
    expect(ownerFlavour(makeProfile())).toBe(false)
    expect(ownerFlavour(makeProfile({ owner: false }))).toBe(false)
  })
})

describe('ageOf', () => {
  const today = new Date(2026, 5, 1)

  it('counts whole years on the given day', () => {
    expect(ageOf({ birthYear: 1990 }, today)).toBe(36)
  })

  it('is null when the birth year is unknown', () => {
    expect(ageOf({}, today)).toBeNull()
  })

  it('never goes negative for a birth year in the future', () => {
    expect(ageOf({ birthYear: 2030 }, today)).toBe(0)
  })
})

describe('profileWeeklyGoals', () => {
  it('judges a week from before the first entry against nothing', () => {
    expect(profileWeeklyGoals(makeProfile(), '2025-12-29')).toEqual({
      workouts: 0,
      flex: 0,
      calDays: 0,
      cardio: 0,
    })
  })

  it('picks the latest entry at or before the week', () => {
    const p = makeProfile({
      weeklyGoals: [
        { from: '2026-01-05', goals: { workouts: 2, flex: 2, calDays: 5, cardio: 1 } },
        { from: '2026-03-02', goals: { workouts: 4, flex: 3, calDays: 6, cardio: 3 } },
      ],
    })
    expect(profileWeeklyGoals(p, '2026-01-05')).toEqual({ workouts: 2, flex: 2, calDays: 5, cardio: 1 })
    expect(profileWeeklyGoals(p, '2026-02-23')).toEqual({ workouts: 2, flex: 2, calDays: 5, cardio: 1 })
    expect(profileWeeklyGoals(p, '2026-03-02')).toEqual({ workouts: 4, flex: 3, calDays: 6, cardio: 3 })
    expect(profileWeeklyGoals(p, '2026-06-01')).toEqual({ workouts: 4, flex: 3, calDays: 6, cardio: 3 })
  })

  it('does not re-score a week through the pillars switched on today', () => {
    // Flexibility was on when this week was lived and is off now: the week is
    // still held to the stretches it was asked for.
    const lived = makeProfile()
    const now = makeProfile({ pillars: ['strength', 'diet'] })
    expect(profileWeeklyGoals(now, '2026-01-05')).toEqual(profileWeeklyGoals(lived, '2026-01-05'))
  })
})

describe('maskGoals', () => {
  it('keeps the goals of the pillars that are on and zeroes the rest', () => {
    const goals = { workouts: 3, flex: 2, calDays: 5, cardio: 2 }
    expect(maskGoals(goals, ['flexibility', 'cardio'])).toEqual({
      workouts: 0,
      flex: 2,
      calDays: 0,
      cardio: 2,
    })
  })

  it('treats a config with no cardio goal as 0 for cardio', () => {
    expect(maskGoals({ workouts: 2, flex: 2, calDays: 6 }, ['cardio'])).toEqual({
      workouts: 0,
      flex: 0,
      calDays: 0,
      cardio: 0,
    })
  })
})

describe('profileCalorieGoal', () => {
  it('is null with no entries', () => {
    expect(profileCalorieGoal(makeProfile({ calorieGoals: [] }), '2026-02-01')).toBeNull()
  })

  it('gives the first entry for a date before it', () => {
    const p = makeProfile({
      calorieGoals: [
        { from: '2026-02-01', goal: 2000 },
        { from: '2026-04-01', goal: 2400 },
      ],
    })
    expect(profileCalorieGoal(p, '2026-01-15')).toBe(2000)
  })

  it('picks the latest entry at or before the date', () => {
    const p = makeProfile({
      calorieGoals: [
        { from: '2026-02-01', goal: 2000 },
        { from: '2026-04-01', goal: 2400 },
      ],
    })
    expect(profileCalorieGoal(p, '2026-02-01')).toBe(2000)
    expect(profileCalorieGoal(p, '2026-03-31')).toBe(2000)
    expect(profileCalorieGoal(p, '2026-04-01')).toBe(2400)
    expect(profileCalorieGoal(p, '2026-09-09')).toBe(2400)
  })
})

describe('withWeeklyGoals', () => {
  const NEW = { workouts: 4, flex: 2, calDays: 6, cardio: 1 }

  it('replaces the entry for the same week on a second change', () => {
    const once = withWeeklyGoals(makeProfile(), NEW, '2026-02-02')
    const twice = withWeeklyGoals(once, { ...NEW, workouts: 5 }, '2026-02-02')
    const forWeek = twice.weeklyGoals.filter((g) => g.from === '2026-02-02')
    expect(forWeek).toHaveLength(1)
    expect(forWeek[0].goals.workouts).toBe(5)
  })

  it('keeps an earlier entry when a later week changes', () => {
    const p = withWeeklyGoals(makeProfile(), NEW, '2026-02-02')
    expect(p.weeklyGoals.map((g) => g.from)).toEqual(['2026-01-05', '2026-02-02'])
    expect(p.weeklyGoals[0].goals).toEqual({ workouts: 3, flex: 2, calDays: 5, cardio: 2 })
  })

  it('does not mutate the profile it was given', () => {
    const base = makeProfile()
    withWeeklyGoals(base, NEW, '2026-02-02')
    expect(base.weeklyGoals).toHaveLength(1)
  })
})

describe('withCalorieGoal', () => {
  it('replaces the entry for the same date and keeps earlier ones', () => {
    const p = withCalorieGoal(makeProfile(), 2300, '2026-02-02')
    const q = withCalorieGoal(p, 2350, '2026-02-02')
    expect(q.calorieGoals).toEqual([
      { from: '2026-01-05', goal: 2200 },
      { from: '2026-02-02', goal: 2350 },
    ])
  })

  it('takes effect from the given date', () => {
    const p = withCalorieGoal(makeProfile(), 2300, '2026-02-02')
    expect(profileCalorieGoal(p, '2026-02-01')).toBe(2200)
    expect(profileCalorieGoal(p, '2026-02-02')).toBe(2300)
  })
})

describe('calorieDayHit', () => {
  it('gain: hits at or above the goal', () => {
    expect(calorieDayHit(2500, 2500, 'gain')).toBe(true)
    expect(calorieDayHit(3000, 2500, 'gain')).toBe(true)
    expect(calorieDayHit(2499, 2500, 'gain')).toBe(false)
  })

  it('gain is the default direction', () => {
    expect(calorieDayHit(2499, 2500)).toBe(false)
    expect(calorieDayHit(2500, 2500)).toBe(true)
  })

  it('lose: hits above zero and at or under the goal', () => {
    expect(calorieDayHit(1800, 2000, 'lose')).toBe(true)
    expect(calorieDayHit(2000, 2000, 'lose')).toBe(true)
    expect(calorieDayHit(2001, 2000, 'lose')).toBe(false)
  })

  it('lose: an unlogged zero day is not a hit', () => {
    expect(calorieDayHit(0, 2000, 'lose')).toBe(false)
  })

  it('maintain: hits within 10% either side of the goal', () => {
    expect(calorieDayHit(2000, 2000, 'maintain')).toBe(true)
    expect(calorieDayHit(1800, 2000, 'maintain')).toBe(true)
    expect(calorieDayHit(2200, 2000, 'maintain')).toBe(true)
    expect(calorieDayHit(1799, 2000, 'maintain')).toBe(false)
    expect(calorieDayHit(2201, 2000, 'maintain')).toBe(false)
  })

  it('maintain: an unlogged zero day is not a hit', () => {
    expect(calorieDayHit(0, 0, 'maintain')).toBe(false)
  })
})
