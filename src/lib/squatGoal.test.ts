import { describe, it, expect } from 'vitest'
import { squatBodyweightGoal } from './squatGoal'

describe('squatBodyweightGoal', () => {
  it('derives 1× milestone and 1.5× target from bodyweight', () => {
    const g = squatBodyweightGoal(200, 180)
    expect(g.milestone).toBe(180)
    expect(g.target).toBe(270)
  })

  it('computes the bodyweight multiple', () => {
    const g = squatBodyweightGoal(225, 180)
    expect(g.multiple).toBe(1.25)
  })

  it('flags the milestone once est-1RM reaches 1× bodyweight', () => {
    expect(squatBodyweightGoal(185, 180).hitMilestone).toBe(true)
    expect(squatBodyweightGoal(170, 180).hitMilestone).toBe(false)
  })

  it('flags the target once est-1RM reaches 1.5× bodyweight', () => {
    expect(squatBodyweightGoal(270, 180).hitTarget).toBe(true)
    expect(squatBodyweightGoal(269, 180).hitTarget).toBe(false)
  })

  it('handles a missing bodyweight without dividing by zero', () => {
    const g = squatBodyweightGoal(200, 0)
    expect(g.bodyweight).toBe(0)
    expect(g.multiple).toBe(0)
    expect(g.milestone).toBe(0)
    expect(g.target).toBe(0)
    expect(g.hitMilestone).toBe(false)
    expect(g.hitTarget).toBe(false)
  })

  it('handles no logged squat (est-1RM 0)', () => {
    const g = squatBodyweightGoal(0, 180)
    expect(g.est1RM).toBe(0)
    expect(g.multiple).toBe(0)
    expect(g.hitMilestone).toBe(false)
  })
})
