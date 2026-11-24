import { describe, expect, it } from 'vitest'
import type { WorkoutRow } from '../types'
import { holdChallenge, holdClock, holdDial } from './holdChallenge'

const row = (date: string, reps: number, exercise = 'rkc_plank'): WorkoutRow => ({
  session_id: `s-${date}`,
  date,
  day_type: 'push',
  exercise,
  set_number: 1,
  weight_lbs: null,
  reps,
  notes: 'stretch + core',
  is_historical: false,
})

describe('holdChallenge', () => {
  it('starts from the given time with nothing logged, and marks no last hold', () => {
    expect(holdChallenge([], 'rkc_plank', 30)).toEqual({ targetSec: 30, lastSec: null, bestSec: null })
    expect(holdChallenge([row('2026-11-20', 40, 'mat_situp')], 'rkc_plank', 30).targetSec).toBe(30)
  })

  it('asks for a little more than the best hold of the last day', () => {
    const rows = [row('2026-11-20', 28), row('2026-11-24', 30), row('2026-11-24', 26)]
    expect(holdChallenge(rows, 'rkc_plank', 30)).toEqual({ targetSec: 32, lastSec: 30, bestSec: 30 })
  })

  it('scales the push with the hold', () => {
    expect(holdChallenge([row('2026-11-24', 60)], 'rkc_plank', 30).targetSec).toBe(63)
    expect(holdChallenge([row('2026-11-24', 100)], 'rkc_plank', 30).targetSec).toBe(105)
    expect(holdChallenge([row('2026-11-24', 8)], 'rkc_plank', 30).targetSec).toBe(10)
  })

  it('follows a shorter last day down, and still knows the best', () => {
    const rows = [row('2026-11-20', 45), row('2026-11-24', 30)]
    expect(holdChallenge(rows, 'rkc_plank', 30)).toEqual({ targetSec: 32, lastSec: 30, bestSec: 45 })
  })
})

describe('holdDial', () => {
  it('builds one lap to the target', () => {
    expect(holdDial(0, 32)).toMatchObject({ fill: 0, hit: false, overSec: 0, heat: 0 })
    expect(holdDial(16, 32)).toMatchObject({ fill: 0.5, hit: false, heat: 0.25 })
    expect(holdDial(32, 32)).toMatchObject({ fill: 1, hit: true, overSec: 0, overLaps: 0, overFill: 0, heat: 1 })
  })

  it('keeps moving past the target, a lap of the target at a time', () => {
    expect(holdDial(40, 32)).toMatchObject({ fill: 1, hit: true, overSec: 8, overLaps: 0, overFill: 0.25 })
    expect(holdDial(80, 32)).toMatchObject({ overSec: 48, overLaps: 1, overFill: 0.5 })
  })

  it('survives a target of nothing', () => {
    expect(holdDial(3, 0).hit).toBe(true)
  })
})

describe('holdClock', () => {
  it('reads as a clock', () => {
    expect(holdClock(7.9)).toBe('0:07')
    expect(holdClock(92)).toBe('1:32')
  })
})
