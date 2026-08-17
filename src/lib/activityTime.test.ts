import { describe, expect, it } from 'vitest'
import { activityTotals, monthlyActivity, secToMin } from './activityTime'
import type { SessionDuration } from './estimate'

const w = (date: string, totalSec: number, restSec: number, dayType: 'push' | 'pull' = 'push'): SessionDuration => ({
  date,
  kind: 'workout',
  dayType,
  totalSec,
  restSec,
})
const s = (date: string, totalSec: number, restSec: number): SessionDuration => ({
  date,
  kind: 'stretch',
  totalSec,
  restSec,
})

describe('secToMin', () => {
  it('rounds to whole minutes', () => {
    expect(secToMin(90)).toBe(2)
    expect(secToMin(0)).toBe(0)
  })
})

describe('activityTotals', () => {
  it('splits active work/stretch and pools rest', () => {
    const totals = activityTotals([
      w('2026-07-01', 3600, 600), // 3000 workout, 600 rest
      s('2026-07-02', 1200, 300), // 900 stretch, 300 rest
    ])
    expect(totals).toEqual({ workoutSec: 3000, stretchSec: 900, restSec: 900 })
  })

  it('clamps rest to the session length and ignores zero/negative totals', () => {
    const totals = activityTotals([
      w('2026-07-01', 1000, 5000), // rest clamped to 1000 → 0 active, 1000 rest
      w('2026-07-02', 0, 0), // ignored
    ])
    expect(totals).toEqual({ workoutSec: 0, stretchSec: 0, restSec: 1000 })
  })
})

describe('monthlyActivity', () => {
  it('groups by month, oldest first', () => {
    const months = monthlyActivity([
      w('2026-06-15', 1800, 300),
      w('2026-07-01', 3600, 600),
      s('2026-07-20', 1200, 200),
    ])
    expect(months.map((m) => m.month)).toEqual(['2026-06', '2026-07'])
    expect(months[1]).toEqual({ month: '2026-07', workoutSec: 3000, stretchSec: 1000, restSec: 800 })
  })
})
