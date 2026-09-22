import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAN, MAT_SITUP_KEY } from '../config/plan'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import type { WorkoutRow } from '../types'
import { weeklyAbsDays } from './weeklyAbs'
import { buildCoreSteps, buildSessionSteps } from './flexSteps'
import { trainingDates } from './session'

const row = (date: string, exercise: string, reps = 12): WorkoutRow => ({
  session_id: `${date}:${exercise}`, date, exercise, reps, day_type: 'push',
  set_number: 1, weight_lbs: null, notes: '', is_historical: false,
})

describe('weekly abs', () => {
  it('combines workout abs and office abs, counting a day only once', () => {
    const rows = [
      row('2026-09-21', 'cable_crunch'), row('2026-09-21', 'weighted_situp'),
      row('2026-09-21', MAT_SITUP_KEY), row('2026-09-23', MAT_SITUP_KEY),
      row('2026-09-25', 'cable_crunch'),
    ]
    expect(weeklyAbsDays(rows, DEFAULT_PLAN, '2026-09-27')).toEqual([
      '2026-09-21', '2026-09-23', '2026-09-25',
    ])
  })

  it('ignores zero reps, other exercises, previous weeks and future dates', () => {
    const rows = [row('2026-09-20', MAT_SITUP_KEY), row('2026-09-23', MAT_SITUP_KEY),
      row('2026-09-21', 'cable_crunch', 0), row('2026-09-22', 'bench_press')]
    expect(weeklyAbsDays(rows, DEFAULT_PLAN, '2026-09-22')).toEqual([])
    expect(weeklyAbsDays([row('2026-09-27', MAT_SITUP_KEY)], DEFAULT_PLAN, '2026-09-28')).toEqual([])
  })

  it('keeps office abs out of the main workout-day count', () => {
    expect(trainingDates([{ ...row('2026-09-22', MAT_SITUP_KEY), notes: 'office abs' }])).toEqual([])
  })

  it('offers core on its own and neither stretching routine includes it', () => {
    expect(buildCoreSteps()).toHaveLength(4)
    for (const routine of Object.values(FLEX_ROUTINES)) {
      expect(buildSessionSteps(routine.blocks, { core: false }).every((s) => s.kind === 'flex')).toBe(true)
    }
  })
})
