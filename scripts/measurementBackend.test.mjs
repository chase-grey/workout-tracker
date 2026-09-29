import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

function backend() {
  const rows = [['date', 'waist_in', 'neck_in', 'note']]
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((row) => [...row]) }),
    getRange: (row) => ({ setValues: ([values]) => { rows[row - 1] = [...values] } }),
    getLastRow: () => rows.length,
    appendRow: (row) => rows.push([...row]),
  }
  return runInNewContext(readFileSync('SimpleBackend.gs', 'utf8') + `
    sheet = () => testSheet;
    isoDate = (date) => String(date);
    ({ appendMeasurements, getMeasurements });
  `, { testSheet: sheet, SpreadsheetApp: { getActiveSpreadsheet: () => ({}) } })
}

it('round-trips body fat alone and preserves it when tape measurements are added', () => {
  const api = backend()
  expect(api.appendMeasurements({ date: '2026-09-29', bodyFatPct: 18.2 })).toEqual({ saved: 1, bodyFatSupported: true })
  expect(api.getMeasurements()).toEqual([{ date: '2026-09-29', bodyFatPct: 18.2, note: '' }])
  api.appendMeasurements({ date: '2026-09-29', waistIn: 32, neckIn: 15, absVisibility: 'faint' })
  api.appendMeasurements({ date: '2026-09-29', bodyFatPct: 18.1 })
  expect(api.getMeasurements()).toEqual([{ date: '2026-09-29', bodyFatPct: 18.1, waistIn: 32, neckIn: 15, absVisibility: 'faint', note: '' }])
})

it('merges repeated dates within a batch and reads old tape records without invented percentages', () => {
  const api = backend()
  api.appendMeasurements({ entries: [
    { date: '2026-09-28', waistIn: 33, neckIn: 15 },
    { date: '2026-09-29', waistIn: 32, neckIn: 15 },
    { date: '2026-09-29', bodyFatPct: 18.2 },
  ] })
  expect(api.getMeasurements()[0].bodyFatPct).toBeUndefined()
  expect(api.getMeasurements('2026-09-29')).toEqual([{ date: '2026-09-29', waistIn: 32, neckIn: 15, bodyFatPct: 18.2, note: '' }])
})

it.each([0, -1, 100, 101, NaN, Infinity, '', null])('rejects invalid body fat %s before writing the batch', (bodyFatPct) => {
  const api = backend()
  expect(() => api.appendMeasurements({ entries: [
    { date: '2026-09-28', bodyFatPct: 18 },
    { date: '2026-09-29', bodyFatPct },
  ] })).toThrow('Invalid measurement')
  expect(api.getMeasurements()).toEqual([])
})
