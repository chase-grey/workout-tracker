import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

function backendWith(rows) {
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    getLastRow: () => rows.length,
    appendRow: (row) => rows.push(row),
    getRange: (row, col, nRows, nCols) => ({
      setValues: (vals) => { rows[row - 1].splice(col - 1, nCols, ...vals[0]) },
    }),
  }
  return runInNewContext(readFileSync('SimpleBackend.gs', 'utf8') +
    '\nsheet = () => testSheet; ({ foldUsage, getUsage });',
  {
    testSheet: sheet,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
  })
}

it('folds tallies into one running row per feature, most used first', () => {
  const rows = [['feature', 'count', 'first_at', 'last_at']]
  const backend = backendWith(rows)
  expect(backend.foldUsage({ build: 'a', counts: { 'settings.theme': 1, 'settings.plan': 2 } })).toEqual({ saved: 2 })
  expect(backend.foldUsage({ build: 'b', counts: { 'settings.theme': 3 } })).toEqual({ saved: 1 })
  expect(rows).toHaveLength(3)
  const out = backend.getUsage()
  expect(out.map((u) => [u.feature, u.count])).toEqual([['settings.theme', 4], ['settings.plan', 2]])
  expect(out[0].firstAt).toBe(rows[1][2])
})

it('throws on a tally with nothing to count, so the phone keeps it', () => {
  const backend = backendWith([['feature', 'count', 'first_at', 'last_at']])
  expect(() => backend.foldUsage({})).toThrow()
  expect(() => backend.foldUsage({ counts: { 'settings.theme': 0, '': 2 } })).toThrow()
})
