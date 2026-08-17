import { describe, expect, it } from 'vitest'
import { gradeSet } from './setGrade'

const TARGET = { weightLbs: 100, reps: 8 }

describe('gradeSet', () => {
  it('calls an exact hit met', () => {
    expect(gradeSet(100, 8, TARGET)).toBe('met')
  })

  it('calls extra weight or extra reps beat', () => {
    expect(gradeSet(105, 8, TARGET)).toBe('beat')
    expect(gradeSet(100, 10, TARGET)).toBe('beat')
    expect(gradeSet(105, 10, TARGET)).toBe('beat')
  })

  it('grades nothing when either number falls short', () => {
    expect(gradeSet(95, 8, TARGET)).toBeNull()
    expect(gradeSet(100, 7, TARGET)).toBeNull()
    // Heavier but short on reps: arguably the harder set, but not the one asked for.
    expect(gradeSet(115, 5, TARGET)).toBeNull()
  })

  it('is not fooled by half-plate float slop', () => {
    // 102.5 - 2.5 arrives a hair under 100 in binary floating point.
    expect(gradeSet(102.5 - 2.5, 8, TARGET)).toBe('met')
  })

  it('needs a target to grade against', () => {
    expect(gradeSet(100, 8, undefined)).toBeNull()
  })

  it('ignores a set with no reps, however it was loaded', () => {
    expect(gradeSet(200, 0, TARGET)).toBeNull()
    expect(gradeSet(null, 0, { weightLbs: null, reps: 10 })).toBeNull()
  })

  it('needs a weight when one was prescribed', () => {
    expect(gradeSet(null, 8, TARGET)).toBeNull()
  })

  it('judges an unloaded target on reps alone', () => {
    const bw = { weightLbs: null, reps: 10 }
    expect(gradeSet(null, 10, bw)).toBe('met')
    expect(gradeSet(null, 12, bw)).toBe('beat')
    expect(gradeSet(null, 9, bw)).toBeNull()
    // Added weight isn't scored against a load the target never asked for.
    expect(gradeSet(25, 10, bw)).toBe('met')
  })
})
