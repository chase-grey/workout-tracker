import { describe, expect, it } from 'vitest'
import type { FlexRoutineKey } from '../config/flexRoutines'
import type { FlexEntry } from './flex'
import { dailyStanding, dailyStretchDays, nextStretchUp, plannedStretchRotation, routineDaysThisWeek } from './dailyRoutine'
import type { Profile } from './profile'
import { setActiveProfile } from './profileStore'
import { weeklyGoalsFor } from './weeklyStreak'

const entry = (date: string, routines: FlexRoutineKey[], note = 'stretch'): FlexEntry => ({
  date,
  splitDeg: null,
  tailorsLeftDeg: null,
  tailorsRightDeg: null,
  routines,
  note,
})

// 2026-11-23 is a Monday.
const MON = '2026-11-23'
const TUE = '2026-11-24'
const WED = '2026-11-25'
const SUN = '2026-11-29'
const LAST_SUN = '2026-11-22'

const OWNER: FlexRoutineKey[] = ['side_split', 'head_to_toe', 'pelvic_tilt']

describe('routineDaysThisWeek', () => {
  it('counts each day once, this week only, and only that routine', () => {
    const entries = [
      entry(LAST_SUN, ['pelvic_tilt']),
      entry(MON, ['pelvic_tilt']),
      entry(MON, ['pelvic_tilt']),
      entry(TUE, ['side_split']),
      entry(WED, ['head_to_toe', 'pelvic_tilt']),
    ]
    expect(routineDaysThisWeek(entries, 'pelvic_tilt', WED)).toEqual([MON, WED])
  })

  it('does not count a bare measurement', () => {
    expect(routineDaysThisWeek([{ ...entry(MON, []), note: 'measurement', pelvicTiltDeg: 14 }], 'pelvic_tilt', MON)).toEqual([])
  })
})

describe('dailyStanding', () => {
  it('is null for a routine that takes turns', () => {
    expect(dailyStanding([], 'side_split', MON)).toBeNull()
  })

  it('owes today until today is done', () => {
    expect(dailyStanding([], 'pelvic_tilt', MON)).toEqual({ done: 0, goal: 6, owedToday: true })
    expect(dailyStanding([entry(MON, ['pelvic_tilt'])], 'pelvic_tilt', MON)).toEqual({ done: 1, goal: 6, owedToday: false })
    expect(dailyStanding([entry(MON, ['pelvic_tilt'])], 'pelvic_tilt', TUE)?.owedToday).toBe(true)
  })

  it('owes nothing on the seventh day once six are in', () => {
    const six = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'].map((d) =>
      entry(d, ['pelvic_tilt']),
    )
    expect(dailyStanding(six, 'pelvic_tilt', SUN)).toEqual({ done: 6, goal: 6, owedToday: false })
  })
})

describe('nextStretchUp', () => {
  it('is the daily routine while today is owed, whatever was stretched last', () => {
    expect(nextStretchUp(OWNER, [entry(MON, ['side_split'])], TUE)).toBe('pelvic_tilt')
  })

  it('is nothing once today is done: the routines that take turns do not step in', () => {
    expect(nextStretchUp(OWNER, [entry(TUE, ['pelvic_tilt'])], TUE)).toBeNull()
  })

  it('is the next in the rotation for a profile with no daily routine', () => {
    const skills: FlexRoutineKey[] = ['side_split', 'head_to_toe']
    expect(nextStretchUp(skills, [entry(MON, ['side_split'])], TUE)).toBe('head_to_toe')
    expect(nextStretchUp(skills, [entry(MON, ['head_to_toe'])], TUE)).toBe('side_split')
    expect(nextStretchUp([], [], TUE)).toBeNull()
  })
})

describe('plannedStretchRotation', () => {
  it('plans the daily routine where there is one', () => {
    expect(plannedStretchRotation(OWNER, [entry(MON, ['side_split'])])).toEqual(['pelvic_tilt'])
  })

  it('plans the rotation otherwise, the one after the last done first', () => {
    expect(plannedStretchRotation(['side_split', 'head_to_toe'], [entry(MON, ['side_split'])])).toEqual([
      'head_to_toe',
      'side_split',
    ])
  })
})

describe('the week a daily routine is owed in', () => {
  it('is held to its days from the week it began, and not before', () => {
    expect(dailyStretchDays(OWNER, MON)).toBe(6)
    expect(dailyStretchDays(OWNER, '2026-11-16')).toBe(0)
    expect(dailyStretchDays(['side_split', 'head_to_toe'], MON)).toBe(0)
  })

  it('raises the stretch goal to them, for the owner with or without a saved profile', () => {
    const profile: Profile = {
      name: '',
      owner: true,
      pillars: ['strength', 'flexibility', 'diet'],
      weeklyGoals: [{ from: '0000-01-01', goals: { workouts: 2, flex: 2, calDays: 6 } }],
      calorieGoals: [],
      createdAt: '2026-01-05T00:00:00Z',
    }
    try {
      setActiveProfile(profile)
      expect(weeklyGoalsFor(MON).flex).toBe(6)
      expect(weeklyGoalsFor('2026-11-16').flex).toBe(2)
      // Untouched beside it.
      expect(weeklyGoalsFor(MON)).toMatchObject({ workouts: 2, calDays: 6 })

      // Someone who trains only skills that take turns keeps their own number,
      setActiveProfile({ ...profile, owner: false, flexSkills: ['side_split'] })
      expect(weeklyGoalsFor(MON).flex).toBe(2)
      // a goal already above it stands,
      setActiveProfile({ ...profile, weeklyGoals: [{ from: '0000-01-01', goals: { workouts: 2, flex: 7, calDays: 6 } }] })
      expect(weeklyGoalsFor(MON).flex).toBe(7)
      // and flexibility switched off stays off.
      setActiveProfile({ ...profile, weeklyGoals: [{ from: '0000-01-01', goals: { workouts: 2, flex: 0, calDays: 6 } }] })
      expect(weeklyGoalsFor(MON).flex).toBe(0)

      setActiveProfile(undefined)
      expect(weeklyGoalsFor(MON).flex).toBe(6)
      expect(weeklyGoalsFor('2026-11-16').flex).toBe(2)
    } finally {
      setActiveProfile(undefined)
    }
  })
})
