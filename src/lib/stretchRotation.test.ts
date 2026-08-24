import { describe, expect, it } from 'vitest'
import { lastStretchRoutine, nextStretchRoutine, otherStretchRoutine } from './stretchRotation'
import { dedupeFlexByDate, type FlexEntry } from './flex'
import type { FlexRoutineKey } from '../config/flexRoutines'

const entry = (date: string, over: Partial<FlexEntry> = {}): FlexEntry => ({
  date,
  splitDeg: null,
  tailorsLeftDeg: null,
  tailorsRightDeg: null,
  note: 'stretch + core',
  ...over,
})

const session = (date: string, routine: FlexRoutineKey): FlexEntry =>
  entry(date, { routines: [routine] })

const measurement = (date: string, over: Partial<FlexEntry> = {}): FlexEntry =>
  entry(date, { note: 'measurement', ...over })

describe('lastStretchRoutine', () => {
  it('is null with no stretch history', () => {
    expect(lastStretchRoutine([])).toBeNull()
  })

  it('takes the routine on the newest-dated session', () => {
    const entries = [session('2026-08-10', 'side_split'), session('2026-08-12', 'head_to_toe')]
    expect(lastStretchRoutine(entries)).toBe('head_to_toe')
  })

  it('reads the newest date regardless of the order entries arrive in', () => {
    const entries = [session('2026-08-12', 'head_to_toe'), session('2026-08-10', 'side_split')]
    expect(lastStretchRoutine(entries)).toBe('head_to_toe')
  })

  // A day that ran both is what the core-skip rule exists for, so the last
  // element — completion order — is the one to alternate from.
  it('takes the last routine of a day that ran both', () => {
    const entries = [entry('2026-08-12', { routines: ['side_split', 'head_to_toe'] })]
    expect(lastStretchRoutine(entries)).toBe('head_to_toe')
  })

  it('counts an untagged legacy session as a side split', () => {
    expect(lastStretchRoutine([entry('2026-08-01')])).toBe('side_split')
  })

  it('ignores a measurement-only entry', () => {
    const entries = [session('2026-08-10', 'head_to_toe'), measurement('2026-08-11')]
    expect(lastStretchRoutine(entries)).toBe('head_to_toe')
  })

  it('is null when every entry is a measurement', () => {
    expect(lastStretchRoutine([measurement('2026-08-11'), measurement('2026-08-12')])).toBeNull()
  })

  it('prefers a later same-day entry', () => {
    const entries = [session('2026-08-12', 'side_split'), session('2026-08-12', 'head_to_toe')]
    expect(lastStretchRoutine(entries)).toBe('head_to_toe')
  })
})

describe('nextStretchRoutine', () => {
  // Nothing logged means head to toe has never been done, but the side split is
  // the routine with history — so the first suggestion is the split, and the one
  // after it is the new routine.
  it('offers the side split with nothing on record', () => {
    expect(nextStretchRoutine([])).toBe('side_split')
  })

  it('offers head to toe after a history of untagged side splits', () => {
    expect(nextStretchRoutine([entry('2026-08-01'), entry('2026-08-04')])).toBe('head_to_toe')
  })

  it('alternates off the last completed routine', () => {
    expect(nextStretchRoutine([session('2026-08-12', 'head_to_toe')])).toBe('side_split')
    expect(nextStretchRoutine([session('2026-08-12', 'side_split')])).toBe('head_to_toe')
  })

  // The whole reason `routines` is an array: through the dedupe a day that ran
  // both still remembers both, so the next suggestion is the first one again.
  it('survives the dedupe on a day that ran both', () => {
    const merged = dedupeFlexByDate([
      session('2026-08-12', 'side_split'),
      session('2026-08-12', 'head_to_toe'),
    ])
    expect(merged[0].routines).toEqual(['side_split', 'head_to_toe'])
    expect(nextStretchRoutine(merged)).toBe('side_split')
  })
})

describe('otherStretchRoutine', () => {
  it('trades one for the other', () => {
    expect(otherStretchRoutine('side_split')).toBe('head_to_toe')
    expect(otherStretchRoutine('head_to_toe')).toBe('side_split')
  })
})
