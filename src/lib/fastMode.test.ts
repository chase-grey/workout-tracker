import { describe, expect, it } from 'vitest'
import {
  nextFastMode,
  rollsThroughRest,
  toFastMode,
  turboSetMs,
  TURBO_MAX_SEC,
  TURBO_MIN_SEC,
} from './fastMode'
import { EMPTY_EXERCISE_AVERAGES, WORK_PER_SET_SEC, type ExerciseAverages } from './estimate'

const averages = (active: ExerciseAverages['active']): ExerciseAverages => ({
  ...EMPTY_EXERCISE_AVERAGES,
  active,
})

describe('nextFastMode', () => {
  it('cycles off → on → turbo → off', () => {
    expect(nextFastMode('off')).toBe('on')
    expect(nextFastMode('on')).toBe('turbo')
    expect(nextFastMode('turbo')).toBe('off')
  })

  it('skips turbo where it is not offered', () => {
    expect(nextFastMode('off', false)).toBe('on')
    expect(nextFastMode('on', false)).toBe('off')
  })

  it('switches off from a mode outside the cycle', () => {
    expect(nextFastMode('turbo', false)).toBe('off')
    expect(nextFastMode('nonsense' as never)).toBe('off')
  })
})

describe('rollsThroughRest', () => {
  it('is only off when the toggle is', () => {
    expect(rollsThroughRest('off')).toBe(false)
    expect(rollsThroughRest('on')).toBe(true)
    expect(rollsThroughRest('turbo')).toBe(true)
  })
})

describe('toFastMode', () => {
  it('reads a legacy stored boolean as on', () => {
    expect(toFastMode(true)).toBe('on')
    expect(toFastMode(false)).toBe('off')
  })

  it('keeps a stored mode and rejects anything else', () => {
    expect(toFastMode('on')).toBe('on')
    expect(toFastMode('turbo')).toBe('turbo')
    expect(toFastMode('fast')).toBe('off')
    expect(toFastMode(null)).toBe('off')
    expect(toFastMode(undefined)).toBe('off')
  })
})

describe('turboSetMs', () => {
  it('waits the exercise learned average', () => {
    expect(turboSetMs(averages({ bench: { avgSec: 45, n: 6 } }), 'bench')).toBe(45_000)
  })

  it('falls back to the structural guess with no samples', () => {
    expect(turboSetMs(EMPTY_EXERCISE_AVERAGES, 'bench')).toBe(WORK_PER_SET_SEC * 1000)
    expect(turboSetMs(averages({ bench: { avgSec: 45, n: 0 } }), 'bench')).toBe(
      WORK_PER_SET_SEC * 1000,
    )
  })

  it('holds a freak average inside the sane band', () => {
    expect(turboSetMs(averages({ dip: { avgSec: 2, n: 9 } }), 'dip')).toBe(TURBO_MIN_SEC * 1000)
    expect(turboSetMs(averages({ dip: { avgSec: 4_000, n: 9 } }), 'dip')).toBe(TURBO_MAX_SEC * 1000)
    expect(turboSetMs(averages({ dip: { avgSec: Infinity, n: 9 } }), 'dip')).toBe(
      WORK_PER_SET_SEC * 1000,
    )
  })
})
