import { describe, it, expect } from 'vitest'
import {
  calorieWeekMark,
  HIT_DAYS_BRIGHT,
  HIT_DAYS_DIM,
  LINE_PRIMARY,
  LINE_SECONDARY,
} from './chart'

/** Room enough for bars: a range of a few months, ~30px to the week. */
const ROOMY = 30

describe('calorieWeekMark', () => {
  it('leaves a week with no days on goal unmarked', () => {
    expect(calorieWeekMark(0, ROOMY)).toBeNull()
  })

  it('marks a week that fell short with a faint pip, not a bar', () => {
    // Legible enough to tell from an unlogged week, dim enough not to read as a win.
    const mark = calorieWeekMark(HIT_DAYS_DIM - 1, ROOMY)
    expect(mark).toMatchObject({ shape: 'pip', color: LINE_SECONDARY })
    expect(mark!.opacity).toBeLessThan(1)
  })

  it('rules a good week with a bar, brightening at a near-perfect one', () => {
    expect(calorieWeekMark(HIT_DAYS_DIM, ROOMY)).toMatchObject({
      shape: 'bar',
      color: LINE_SECONDARY,
      opacity: 1,
    })
    expect(calorieWeekMark(HIT_DAYS_BRIGHT, ROOMY)).toMatchObject({
      shape: 'bar',
      color: LINE_PRIMARY,
    })
  })

  it('grows the bar with the days behind it', () => {
    const five = calorieWeekMark(5, ROOMY)
    const seven = calorieWeekMark(7, ROOMY)
    expect(five!.shape === 'bar' && seven!.shape === 'bar').toBe(true)
    expect((five as { width: number }).width).toBeLessThan((seven as { width: number }).width)
  })

  it('keeps a bar clear of the neighbouring week', () => {
    const mark = calorieWeekMark(7, 12)
    expect((mark as { width: number }).width).toBeLessThan(12)
  })

  it('caps the bar so a two-week range does not draw slabs', () => {
    const wide = calorieWeekMark(7, 400)
    expect((wide as { width: number }).width).toBeLessThanOrEqual(20)
  })

  it('falls back to a full-colour pip when a year of weeks leaves no room', () => {
    // ~52 weeks across a phone-width plot: a few pixels each, too little to rule.
    expect(calorieWeekMark(7, 6)).toMatchObject({ shape: 'pip', color: LINE_PRIMARY, opacity: 1 })
    expect(calorieWeekMark(5, 6)).toMatchObject({ shape: 'pip', color: LINE_SECONDARY })
  })

  it('survives an axis that has not been measured yet', () => {
    expect(calorieWeekMark(7, 0)).toMatchObject({ shape: 'pip' })
    expect(calorieWeekMark(7, Number.NaN)).toMatchObject({ shape: 'pip' })
  })

  it('does not let an over-full week outgrow a seven-day one', () => {
    // A leap in the log (say a duplicated date) must not stretch the bar past a week.
    expect(calorieWeekMark(9, ROOMY)).toEqual(calorieWeekMark(7, ROOMY))
  })
})
