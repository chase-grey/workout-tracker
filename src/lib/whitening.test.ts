import { describe, it, expect } from 'vitest'
import {
  HALF_WHITENING_DAYS,
  WHITENING_DAYS_GOAL,
  dedupeWhiteningByDate,
  setWhiteningDay,
  usedStrips,
  whiteningDaysInWeek,
  whiteningEntryFor,
  whiteningEntryOn,
  whiteningGoalDates,
  type WhiteningEntry,
} from './whitening'

// 2026-07-10 is a Friday; its Monday is 2026-07-06.
const TODAY = new Date(2026, 6, 10)

const on = (date: string, strips = true, loggedAt?: string): WhiteningEntry =>
  loggedAt ? { date, strips, loggedAt } : { date, strips }

describe('the goal', () => {
  it('asks for six of seven days, with five still a partial week', () => {
    expect(WHITENING_DAYS_GOAL).toBe(6)
    expect(HALF_WHITENING_DAYS).toBe(5)
  })
})

describe('dedupeWhiteningByDate', () => {
  it('keeps one row per date, the later one winning, sorted ascending', () => {
    const merged = dedupeWhiteningByDate([
      on('2026-07-08'),
      on('2026-07-06', false),
      on('2026-07-06', true),
    ])
    expect(merged.map((e) => e.date)).toEqual(['2026-07-06', '2026-07-08'])
    expect(usedStrips(merged, '2026-07-06')).toBe(true)
  })
})

describe('whiteningEntryOn / usedStrips', () => {
  it('reads back the row for a date, and null for a day never logged', () => {
    const entries = [on('2026-07-06')]
    expect(whiteningEntryOn(entries, '2026-07-06')?.strips).toBe(true)
    expect(whiteningEntryOn(entries, '2026-07-07')).toBeNull()
    expect(usedStrips(entries, '2026-07-07')).toBe(false)
  })

  it('treats a day logged false as a day the strip did not go on', () => {
    expect(usedStrips([on('2026-07-06', false)], '2026-07-06')).toBe(false)
  })
})

describe('whiteningGoalDates', () => {
  it('lists only the days the strip went on, ascending', () => {
    const entries = [on('2026-07-08'), on('2026-07-07', false), on('2026-07-06')]
    expect(whiteningGoalDates(entries)).toEqual(['2026-07-06', '2026-07-08'])
  })
})

describe('whiteningDaysInWeek', () => {
  it('counts only the Mon–Sun week containing today', () => {
    const entries = [
      on('2026-07-06'),
      on('2026-07-09'),
      on('2026-07-05'), // the Sunday of the week before
      on('2026-07-13'), // the Monday of the week after
    ]
    expect(whiteningDaysInWeek(entries, TODAY)).toBe(2)
  })
})

describe('setWhiteningDay', () => {
  it('replaces a date rather than stacking rows on it', () => {
    const once = setWhiteningDay([], '2026-07-06', true)
    const undone = setWhiteningDay(once, '2026-07-06', false)
    expect(undone).toHaveLength(1)
    expect(usedStrips(undone, '2026-07-06')).toBe(false)
  })

  it('keeps a same-day log time through a later backfill of that date', () => {
    const at = '2026-07-06T21:30:00.000Z'
    const logged = setWhiteningDay([], '2026-07-06', true, at)
    // A correction made on another day sends no timestamp; the real one stands.
    const corrected = setWhiteningDay(logged, '2026-07-06', false)
    expect(corrected[0].loggedAt).toBe(at)
  })

  it('leaves a day with no log time without the field at all', () => {
    expect(setWhiteningDay([], '2026-07-06', true)[0]).toEqual({
      date: '2026-07-06',
      strips: true,
    })
  })

  it('leaves the other dates alone', () => {
    const next = setWhiteningDay([on('2026-07-06')], '2026-07-07', true)
    expect(whiteningGoalDates(next)).toEqual(['2026-07-06', '2026-07-07'])
  })
})

describe('whiteningEntryFor', () => {
  it('returns just the one row the backend is sent', () => {
    expect(whiteningEntryFor([on('2026-07-06')], '2026-07-07', true)).toEqual({
      date: '2026-07-07',
      strips: true,
    })
  })
})
