import { describe, expect, it } from 'vitest'
import {
  HIGHER_IS_BETTER,
  LOWER_IS_BETTER,
  bestOf,
  metricDir,
  nextGoal,
} from './flexMetrics'

describe('HIGHER_IS_BETTER', () => {
  it('picks the bigger reading and reads a rise as a gain', () => {
    expect(HIGHER_IS_BETTER.best(110, 120)).toBe(120)
    expect(HIGHER_IS_BETTER.beats(120, 110)).toBe(true)
    expect(HIGHER_IS_BETTER.beats(110, 120)).toBe(false)
    expect(HIGHER_IS_BETTER.gain(110, 120)).toBe(10)
    expect(HIGHER_IS_BETTER.gain(120, 110)).toBe(-10)
  })

  it('does not count an equal reading as beating the one before it', () => {
    expect(HIGHER_IS_BETTER.beats(120, 120)).toBe(false)
  })
})

describe('LOWER_IS_BETTER', () => {
  it('picks the smaller reading and reads a drop as a gain', () => {
    expect(LOWER_IS_BETTER.best(110, 90)).toBe(90)
    expect(LOWER_IS_BETTER.beats(90, 110)).toBe(true)
    expect(LOWER_IS_BETTER.beats(110, 90)).toBe(false)
    expect(LOWER_IS_BETTER.gain(110, 90)).toBe(20)
    expect(LOWER_IS_BETTER.gain(90, 110)).toBe(-20)
  })

  it('does not count an equal reading as beating the one before it', () => {
    expect(LOWER_IS_BETTER.beats(90, 90)).toBe(false)
  })
})

describe('metricDir', () => {
  it('resolves the bare word to its comparators', () => {
    expect(metricDir('higher')).toBe(HIGHER_IS_BETTER)
    expect(metricDir('lower')).toBe(LOWER_IS_BETTER)
  })
})

describe('bestOf', () => {
  it('folds a set of readings the metric’s own way', () => {
    expect(bestOf([100, 118, 105])).toBe(118)
    expect(bestOf([100, 118, 105], LOWER_IS_BETTER)).toBe(100)
  })

  it('is null with nothing to compare', () => {
    expect(bestOf([])).toBeNull()
    expect(bestOf([], LOWER_IS_BETTER)).toBeNull()
  })
})

describe('nextGoal', () => {
  const up = [100, 110, 120, 135] as const

  it('takes the lowest target still above an ascending reading', () => {
    expect(nextGoal(up, 112)).toEqual({ target: 120, toGo: 8 })
  })

  it('is null once every ascending target is cleared', () => {
    expect(nextGoal(up, 140)).toBeNull()
  })

  it('does not offer a target the reading has exactly met', () => {
    expect(nextGoal(up, 120)).toEqual({ target: 135, toGo: 15 })
  })

  // The fold's ladder descends, so the next rung is the *largest* target still
  // below the reading — 100° is nearer to a 118° fold than 60° is.
  it('takes the highest target still below a descending reading', () => {
    const down = [120, 100, 60, 30] as const
    expect(nextGoal(down, 118, LOWER_IS_BETTER)).toEqual({ target: 100, toGo: 18 })
    expect(nextGoal(down, 25, LOWER_IS_BETTER)).toBeNull()
  })

  it('is null with no goals at all — the deferred ladders', () => {
    expect(nextGoal([], 118)).toBeNull()
    expect(nextGoal([], 118, LOWER_IS_BETTER)).toBeNull()
  })

  it('rounds the distance to one decimal', () => {
    expect(nextGoal([120], 111.44)).toEqual({ target: 120, toGo: 8.6 })
  })
})
