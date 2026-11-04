import { describe, it, expect } from 'vitest'
import { leaveRest, resumeLeftRest } from './leftRest'

const rest = { seconds: 120, endsAt: 1_000_000, exKey: 'squat' }

describe('leaveRest', () => {
  it('keeps the rest and what was left on its clock', () => {
    expect(leaveRest(rest, rest.endsAt - 40_000)).toEqual({ rest, remainingMs: 40_000 })
  })

  it('has nothing to keep once the rest has run out', () => {
    expect(leaveRest(rest, rest.endsAt)).toBeNull()
    expect(leaveRest(rest, rest.endsAt + 5_000)).toBeNull()
  })
})

describe('resumeLeftRest', () => {
  it('runs the rest on from the second it was left at, however long ago that was', () => {
    const left = leaveRest(rest, rest.endsAt - 40_000)!
    const resumed = resumeLeftRest(left, rest.endsAt + 30_000)
    expect(resumed.endsAt).toBe(rest.endsAt + 70_000)
  })

  it('carries the rest itself through unchanged, so the shape and its owner stay the same', () => {
    const left = leaveRest(rest, rest.endsAt - 1)!
    const resumed = resumeLeftRest(left, 5)
    expect(resumed).toEqual({ seconds: 120, endsAt: 6, exKey: 'squat' })
    expect(left.rest).toBe(rest)
  })
})
