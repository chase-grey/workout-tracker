import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

function backend(header = ['date', 'calories', 'label', 'logged_at', 'last_amount', 'helpings', 'protein']) {
  const rows = [header]
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((row) => [...row]) }),
    getRange: (row) => ({ setValues: ([values]) => { rows[row - 1] = [...values] } }),
    getLastRow: () => rows.length,
    appendRow: (row) => rows.push([...row]),
    deleteRow: (row) => rows.splice(row - 1, 1),
  }
  const api = runInNewContext(readFileSync('SimpleBackend.gs', 'utf8') + `
    sheet = () => testSheet;
    isoDate = (date) => String(date);
    ({ appendCalories, getCalories });
  `, { testSheet: sheet, SpreadsheetApp: { getActiveSpreadsheet: () => ({}) } })
  return { ...api, rows }
}

it('stores and serves a day\'s protein beside its calories', () => {
  const api = backend()
  api.appendCalories({ date: '2026-11-16', calories: 600, protein: 40, loggedAt: '2026-11-16T12:00:00.000Z', lastAmount: 600 })
  expect(api.getCalories()[0]).toMatchObject({ date: '2026-11-16', calories: 600, protein: 40 })
})

it('keeps the stored protein when a client that predates it writes the day', () => {
  const api = backend()
  api.appendCalories({ date: '2026-11-16', calories: 600, protein: 40 })
  api.appendCalories({ date: '2026-11-16', calories: 700 })
  expect(api.getCalories()[0]).toMatchObject({ calories: 700, protein: 40 })
  api.appendCalories({ date: '2026-11-16', calories: 700, protein: 0 })
  expect(api.getCalories()[0].protein).toBe(0)
})

it('serves a row from before the column without protein', () => {
  const api = backend()
  api.rows.push(['2026-11-01', 3000, '', '', ''])
  expect(api.getCalories()[0]).not.toHaveProperty('protein')
})
