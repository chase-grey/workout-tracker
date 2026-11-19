import { describe, expect, it } from 'vitest'
import { nextLiftDay, type RotationSession } from './liftRotation'
import type { DayType } from '../types'

const ORDER: DayType[] = ['push', 'fullbody', 'pull']
const s = (date: string, dayType: DayType): RotationSession => ({ date, dayType })

describe('nextLiftDay', () => {
  it('starts at the top of the order with no history', () => {
    expect(nextLiftDay([], '2026-11-19', ORDER)).toBe('push')
    expect(nextLiftDay([], '2026-11-19', ['fullbody', 'push', 'pull'])).toBe('fullbody')
    expect(nextLiftDay([], '2026-11-19', [])).toBeNull()
  })

  it('runs a plain three-cycle when every session follows a rest day', () => {
    const log: RotationSession[] = []
    const dates = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08', '2026-11-10', '2026-11-12']
    const done: DayType[] = []
    for (const date of dates) {
      const next = nextLiftDay(log, date, ORDER)!
      done.push(next)
      log.push(s(date, next))
    }
    expect(done).toEqual(['push', 'fullbody', 'pull', 'push', 'fullbody', 'pull'])
  })

  it('passes full body over after a lift yesterday, and keeps it owed', () => {
    const log = [s('2026-11-02', 'fullbody'), s('2026-11-04', 'pull'), s('2026-11-09', 'push')]
    // Full body has waited longest, but push was yesterday: pull takes the turn.
    expect(nextLiftDay(log, '2026-11-10', ORDER)).toBe('pull')
    log.push(s('2026-11-10', 'pull'))
    // Lifted yesterday again: still a split day, the longer-waiting one.
    expect(nextLiftDay(log, '2026-11-11', ORDER)).toBe('push')
    log.push(s('2026-11-11', 'push'))
    // A day off, and the owed full body comes up.
    expect(nextLiftDay(log, '2026-11-13', ORDER)).toBe('fullbody')
  })

  it('does not offer full body later on a day that already has a lift', () => {
    const log = [s('2026-11-02', 'fullbody'), s('2026-11-04', 'pull'), s('2026-11-10', 'push')]
    expect(nextLiftDay(log, '2026-11-10', ORDER)).toBe('pull')
  })

  it('suggests full body on its turn after a rest day', () => {
    const log = [s('2026-11-02', 'fullbody'), s('2026-11-04', 'pull'), s('2026-11-09', 'push')]
    expect(nextLiftDay(log, '2026-11-11', ORDER)).toBe('fullbody')
  })

  it('holds nothing back the day after a full body session', () => {
    const log = [s('2026-11-05', 'push'), s('2026-11-09', 'fullbody')]
    expect(nextLiftDay(log, '2026-11-10', ORDER)).toBe('pull')
    const all = [s('2026-11-03', 'pull'), ...log]
    expect(nextLiftDay(all, '2026-11-10', ORDER)).toBe('pull')
  })

  it('moves on from a day trained twice in a row', () => {
    const log = [s('2026-11-02', 'fullbody'), s('2026-11-04', 'pull'), s('2026-11-06', 'push'), s('2026-11-08', 'push')]
    expect(nextLiftDay(log, '2026-11-10', ORDER)).toBe('fullbody')
    expect(nextLiftDay(log, '2026-11-09', ORDER)).toBe('pull')
  })

  it('reads two sessions on one day in the order they were logged', () => {
    const log = [s('2026-11-02', 'fullbody'), s('2026-11-06', 'push'), s('2026-11-06', 'pull')]
    expect(nextLiftDay(log, '2026-11-08', ORDER)).toBe('fullbody')
    // Full body barred: push went first that day, so it has waited longer than pull.
    expect(nextLiftDay(log, '2026-11-07', ORDER)).toBe('push')
    const swapped = [s('2026-11-02', 'fullbody'), s('2026-11-06', 'pull'), s('2026-11-06', 'push')]
    expect(nextLiftDay(swapped, '2026-11-07', ORDER)).toBe('pull')
  })

  it('does not depend on the log arriving in date order', () => {
    const log = [s('2026-11-09', 'push'), s('2026-11-02', 'fullbody'), s('2026-11-04', 'pull')]
    expect(nextLiftDay(log, '2026-11-11', ORDER)).toBe('fullbody')
    expect(nextLiftDay(log, '2026-11-10', ORDER)).toBe('pull')
  })

  it('still offers full body when it is the only day there is', () => {
    expect(nextLiftDay([s('2026-11-09', 'fullbody')], '2026-11-10', ['fullbody'])).toBe('fullbody')
  })

  it('alternates a plan with no full body day', () => {
    const log = [s('2026-11-08', 'pull'), s('2026-11-09', 'push')]
    expect(nextLiftDay(log, '2026-11-10', ['push', 'pull'])).toBe('pull')
  })

  it('ignores sessions of a day no longer on offer', () => {
    const log = [s('2026-11-09', 'fullbody')]
    expect(nextLiftDay(log, '2026-11-12', ['push', 'pull'])).toBe('push')
  })
})
