import { describe, it, expect } from 'vitest'
import { ASSUMED_UNLOGGED_CALORIES, weeklyCalorieSurplusSeries, type CalorieEntry } from './calories'

const GOAL = 4000
// Week of Mon 2026-01-05 … Sun 2026-01-11.
const MONDAY = '2026-01-05'

function entry(date: string, calories: number): CalorieEntry {
  return { date, calories }
}

describe('weeklyCalorieSurplusSeries', () => {
  it('returns nothing with no entries', () => {
    expect(weeklyCalorieSurplusSeries([])).toEqual([])
  })

  it('excludes today, which is still being eaten', () => {
    // Only today is logged, so there is no complete day to average.
    const today = new Date(2026, 0, 6)
    const rows = weeklyCalorieSurplusSeries([entry('2026-01-06', 4500)], { goal: GOAL, today })
    expect(rows).toEqual([])
  })

  it('averages the complete days of a week and keys the point to its Monday', () => {
    // Mon + Tue logged at goal + 500; today is Wednesday, so two complete days.
    const today = new Date(2026, 0, 7)
    const rows = weeklyCalorieSurplusSeries(
      [entry('2026-01-05', 4500), entry('2026-01-06', 4500)],
      { goal: GOAL, today },
    )
    expect(rows).toEqual([{ date: MONDAY, value: 500 }])
  })

  it('assumes a modest intake for an unlogged day rather than skipping it', () => {
    // Mon logged at 4500, Tue unlogged. Averaging only logged days would report
    // +500; counting Tue as the assumed intake reports the week's real shortfall.
    const today = new Date(2026, 0, 7)
    const rows = weeklyCalorieSurplusSeries([entry('2026-01-05', 4500)], { goal: GOAL, today })
    const expected = Math.round((4500 - GOAL + (ASSUMED_UNLOGGED_CALORIES - GOAL)) / 2)
    expect(rows).toEqual([{ date: MONDAY, value: expected }])
  })

  it('honours an overridden assumption for unlogged days', () => {
    const today = new Date(2026, 0, 7)
    const rows = weeklyCalorieSurplusSeries([entry('2026-01-05', 4000)], {
      goal: GOAL,
      today,
      assumedUnlogged: 4000,
    })
    // Both days now sit exactly at goal.
    expect(rows).toEqual([{ date: MONDAY, value: 0 }])
  })

  it('produces one point per week, oldest first', () => {
    const today = new Date(2026, 0, 20)
    const rows = weeklyCalorieSurplusSeries(
      [entry('2026-01-05', 4000), entry('2026-01-12', 4000), entry('2026-01-19', 4000)],
      { goal: GOAL, today },
    )
    expect(rows.map((r) => r.date)).toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })

  it('starts at the first logged day, not at some arbitrary epoch', () => {
    const today = new Date(2026, 0, 7)
    const rows = weeklyCalorieSurplusSeries([entry('2026-01-06', 4500)], { goal: GOAL, today })
    // Only Tue is in range (Mon precedes the first entry), so it stands alone.
    expect(rows).toEqual([{ date: MONDAY, value: 500 }])
  })

  it('reports a deficit as a negative value', () => {
    const today = new Date(2026, 0, 6)
    const rows = weeklyCalorieSurplusSeries([entry('2026-01-05', 3000)], { goal: GOAL, today })
    expect(rows[0].value).toBe(-1000)
  })

  it('is empty when every logged day is still in the future', () => {
    const today = new Date(2026, 0, 1)
    expect(weeklyCalorieSurplusSeries([entry('2026-01-05', 4500)], { goal: GOAL, today })).toEqual([])
  })
})
