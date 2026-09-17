import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GoalTooltip } from '../features/progress/GoalTooltip'
import type { LockedProjection } from './goalLock'

const lock: LockedProjection = {
  goalId: 'weight', lockedAt: '2026-08-01', etaDate: '2026-08-11',
  startValue: 170, target: 180, slopePerWeek: 7,
}
function reading(date: string, value: number, goal = lock) {
  return renderToStaticMarkup(createElement(GoalTooltip, { active: true, unit: 'lbs', lock: goal,
    label: new Date(`${date}T12:00:00`).getTime(),
    payload: [{ dataKey: 'actual', name: 'actual', value, payload: { date } }],
  }))
}

describe('goal readout comparison', () => {
  it('computes the expected value on a date with no weekly projection sample', () => {
    const html = reading('2026-08-04', 175)
    expect(html).toContain('goal expected 173 lbs')
    expect(html).toContain('2 lbs ahead of goal trend')
  })
  it('reverses ahead/behind for a falling goal', () => {
    expect(reading('2026-08-04', 175, { ...lock, startValue: 180, target: 170 }))
      .toContain('2 lbs ahead of goal trend')
  })
  it('does not compare history before the commitment', () => {
    const html = reading('2026-07-31', 169)
    expect(html).not.toContain('goal expected')
    expect(html).not.toContain('goal trend')
  })
  it('holds the expected value at the target after the goal date', () => {
    expect(reading('2026-08-15', 180)).toContain('on goal trend')
  })
})
