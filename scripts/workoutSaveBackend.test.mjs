import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('accepts legacy rows, retries without duplicates, and validates before writing', () => {
  const rows = [['session_id']]
  const sheet = {
    getDataRange: () => ({ getValues: () => rows }),
    getLastRow: () => rows.length,
    getRange: () => ({ setValues: (values) => rows.push(...values) }),
  }
  const backend = runInNewContext(readFileSync('SimpleBackend.gs', 'utf8') +
    '\nsheet = () => testSheet; ({ appendWorkoutRows });',
  { testSheet: sheet, SpreadsheetApp: { getActiveSpreadsheet: () => ({}) } })
  const row = { session_id: 'one', date: '2026-09-28', day_type: 'push', exercise: 'squat', set_number: 1, reps: 8 }
  expect(backend.appendWorkoutRows([row])).toEqual({ saved: 1 })
  expect(backend.appendWorkoutRows([row])).toEqual({ saved: 1 })
  expect(rows).toHaveLength(2)
  expect(backend.appendWorkoutRows([row, { ...row, set_number: 2 }])).toEqual({ saved: 2 })
  expect(rows).toHaveLength(3)
  expect(() => backend.appendWorkoutRows([{ ...row, set_number: 3 }, {}])).toThrow()
  expect(rows).toHaveLength(3)
})
