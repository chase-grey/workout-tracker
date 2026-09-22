import { describe, expect, it } from 'vitest'
import { reconcileBodyWeights } from './bodyWeightSync'

const yesterday = { date: '2026-09-21', weightLbs: 180 }
const today = { date: '2026-09-22', weightLbs: 179 }

describe('body weight refresh reconciliation', () => {
  it('keeps a weigh-in logged during a fetch, even after its write left the queue', () => {
    expect(reconcileBodyWeights([yesterday], [], [yesterday, today], 1, 2))
      .toEqual([yesterday, today])
  })

  it('keeps a failed write visible when refresh succeeds', () => {
    expect(reconcileBodyWeights([yesterday], [today], [yesterday, today], 2, 2))
      .toEqual([yesterday, today])
  })

  it('does not duplicate a queued entry already returned by the server', () => {
    expect(reconcileBodyWeights([yesterday, today], [today, today], [today], 1, 1))
      .toEqual([yesterday, today])
  })

  it('retains a second weigh-in on the same date while pending', () => {
    const correction = { ...today, weightLbs: 178.5 }
    expect(reconcileBodyWeights([today], [correction], [today, correction], 2, 2))
      .toEqual([today, correction])
  })

  it('allows settled server edits and deletions to reach the device', () => {
    expect(reconcileBodyWeights([today], [], [yesterday], 1, 1)).toEqual([today])
    expect(reconcileBodyWeights([], [], [yesterday], 1, 1)).toEqual([])
  })

  it('ignores an older response arriving after a newer refresh', () => {
    expect(reconcileBodyWeights([], [], [today], 0, 1)).toEqual([today])
  })
})
