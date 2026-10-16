import { describe, expect, it } from 'vitest'
import { clockText, closeSet, endRest, restAfter, resumeSetClock, spentByExercise, startSetClock } from './setClock'

const exerciseOf = (key: string) => key.split(':')[0]

describe('set clock', () => {
  it('charges each set its own time plus the rest after it', () => {
    let clock = startSetClock('s', 0)
    clock = restAfter(clock, 'bench:0') // set 1 took 40s, then rests
    clock = endRest(clock, 160_000) // 2 min rest
    clock = closeSet(clock, 'bench:1', 200_000) // last set, no rest
    expect(clock.spentSec).toEqual({ 'bench:0': 160, 'bench:1': 40 })
    expect(spentByExercise(clock, 200_000, exerciseOf).get('bench')).toBe(200)
  })

  it('counts a rest still on screen toward the set that opened it', () => {
    const clock = restAfter(startSetClock('s', 0), 'row:0')
    expect(spentByExercise(clock, 90_000, exerciseOf).get('row')).toBe(90)
    expect(clock.spentSec).toEqual({})
  })

  it('leaves time with no set to close running into the next one', () => {
    let clock = endRest(startSetClock('s', 0), 30_000)
    clock = closeSet(clock, 'squat:0', 70_000)
    expect(clock.spentSec).toEqual({ 'squat:0': 70 })
  })

  it('adds back up to the session clock', () => {
    let clock = startSetClock('s', 0)
    clock = endRest(restAfter(clock, 'a:0'), 100_000)
    clock = endRest(restAfter(clock, 'b:0'), 250_000)
    clock = closeSet(clock, 'b:1', 300_000)
    const total = [...spentByExercise(clock, 300_000, exerciseOf).values()].reduce((a, b) => a + b, 0)
    expect(total).toBe(300)
  })

  it('resumes only its own session, and starts a new one from the session start', () => {
    const saved = closeSet(startSetClock('old', 0), 'a:0', 5_000)
    expect(resumeSetClock(saved, 'old', undefined, 9)).toBe(saved)
    expect(resumeSetClock(saved, 'new', '1970-01-01T00:00:10.000Z', 99_000).markAt).toBe(10_000)
    expect(resumeSetClock(null, 'new', undefined, 99_000).markAt).toBe(99_000)
  })

  it('reads as a clock', () => {
    expect(clockText(0)).toBe('0:00')
    expect(clockText(462.4)).toBe('7:42')
    expect(clockText(3725)).toBe('1:02:05')
  })
})
