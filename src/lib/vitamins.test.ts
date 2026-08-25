import { describe, expect, it } from 'vitest'
import {
  dedupeVitaminsByDate,
  isIronDay,
  setVitaminDay,
  tookIron,
  tookVitamins,
  vitaminDayState,
  vitaminDaysInWeek,
  vitaminEntryFor,
  vitaminGoalDates,
  type VitaminEntry,
} from './vitamins'

const day = (date: string, vitamins: boolean, iron: boolean): VitaminEntry => ({
  date,
  vitamins,
  iron,
})

describe('isIronDay', () => {
  it('is an iron day when nothing has ever been logged', () => {
    expect(isIronDay([], '2026-08-25')).toBe(true)
  })

  it('is off the day after iron', () => {
    const log = [day('2026-08-24', true, true)]
    expect(isIronDay(log, '2026-08-25')).toBe(false)
    // …and back on the day after that.
    expect(isIronDay(log, '2026-08-26')).toBe(true)
  })

  it('rolls the dose forward after a missed day rather than holding a parity', () => {
    // Iron Monday, nothing Tuesday: a fixed even/odd schedule would still call
    // Wednesday an off day, leaving a two-day gap. This asks for it instead.
    const log = [day('2026-08-24', true, true), day('2026-08-25', true, false)]
    expect(isIronDay(log, '2026-08-26')).toBe(true)
  })

  it('stays true of a day that took iron, whatever the day before did', () => {
    const log = [day('2026-08-24', true, true), day('2026-08-25', true, true)]
    expect(isIronDay(log, '2026-08-25')).toBe(true)
  })

  it('never asks for iron two days running', () => {
    let log: VitaminEntry[] = []
    const dates = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']
    const asked: boolean[] = []
    for (const d of dates) {
      const ironDay = isIronDay(log, d)
      asked.push(ironDay)
      log = setVitaminDay(log, d, { vitamins: true, iron: ironDay })
    }
    expect(asked).toEqual([true, false, true, false, true])
  })
})

describe('vitaminDayState', () => {
  it('owes iron on an iron day and reports the day short until it lands', () => {
    const log = [day('2026-08-25', true, false)]
    expect(vitaminDayState(log, '2026-08-25')).toMatchObject({
      vitamins: true,
      iron: false,
      ironDay: true,
      ironDue: true,
      done: false,
    })
  })

  it('is done on the multivitamin alone the day after iron', () => {
    const log = [day('2026-08-24', true, true), day('2026-08-25', true, false)]
    expect(vitaminDayState(log, '2026-08-25')).toMatchObject({
      ironDay: false,
      ironDue: false,
      done: true,
    })
  })

  it('is not done on iron without the multivitamin', () => {
    expect(vitaminDayState([day('2026-08-25', false, true)], '2026-08-25').done).toBe(false)
  })

  it('reports an unlogged day as owing everything', () => {
    expect(vitaminDayState([], '2026-08-25')).toMatchObject({
      vitamins: false,
      iron: false,
      ironDue: true,
      done: false,
    })
  })
})

describe('vitaminGoalDates', () => {
  it('counts only the days that took everything they owed', () => {
    const log = [
      day('2026-08-24', true, true), // iron day, both in
      day('2026-08-25', true, false), // off day, multivitamin is enough
      day('2026-08-26', true, false), // iron day, iron skipped
      day('2026-08-27', false, false), // nothing
    ]
    expect(vitaminGoalDates(log)).toEqual(['2026-08-24', '2026-08-25'])
  })

  it('counts the days of the week that met the goal', () => {
    // 2026-08-25 is a Tuesday; its week runs 08-24 … 08-30.
    const log = [
      day('2026-08-24', true, true),
      day('2026-08-25', true, false),
      day('2026-08-23', true, true), // the Sunday before — prior week
    ]
    expect(vitaminDaysInWeek(log, new Date(2026, 7, 25))).toBe(2)
  })
})

describe('setVitaminDay', () => {
  it('keeps one row per date and merges the fields left out', () => {
    let log = setVitaminDay([], '2026-08-25', { vitamins: true })
    log = setVitaminDay(log, '2026-08-25', { iron: true })
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ vitamins: true, iron: true })
  })

  it('undoes a mis-tap when told false outright', () => {
    const log = setVitaminDay([day('2026-08-25', true, true)], '2026-08-25', {
      vitamins: false,
      iron: false,
    })
    expect(tookVitamins(log, '2026-08-25')).toBe(false)
    expect(tookIron(log, '2026-08-25')).toBe(false)
  })

  it('keeps a real log time through a later backfill', () => {
    const at = '2026-08-25T14:00:00.000Z'
    const first = setVitaminDay([], '2026-08-25', { vitamins: true }, at)
    const second = setVitaminDay(first, '2026-08-25', { iron: true })
    expect(second[0].loggedAt).toBe(at)
  })

  it('hands back the single row the backend is sent', () => {
    const entry = vitaminEntryFor([day('2026-08-25', true, false)], '2026-08-25', { iron: true })
    expect(entry).toEqual({ date: '2026-08-25', vitamins: true, iron: true })
  })
})

describe('dedupeVitaminsByDate', () => {
  it('lets the later row win and sorts by date', () => {
    const merged = dedupeVitaminsByDate([
      day('2026-08-25', true, false),
      day('2026-08-24', true, true),
      day('2026-08-25', true, true),
    ])
    expect(merged.map((e) => e.date)).toEqual(['2026-08-24', '2026-08-25'])
    expect(merged[1].iron).toBe(true)
  })
})
