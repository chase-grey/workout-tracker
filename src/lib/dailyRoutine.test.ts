import { describe, expect, it } from 'vitest'
import type { FlexRoutineKey } from '../config/flexRoutines'
import type { FlexEntry } from './flex'
import { dailyStanding, nextStretchUp, plannedStretchRotation, routineDaysThisWeek } from './dailyRoutine'

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
