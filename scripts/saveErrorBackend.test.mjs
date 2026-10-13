import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

function backendWith(rows) {
  const sheet = {
    getDataRange: () => ({ getValues: () => rows }),
    getLastRow: () => rows.length,
    appendRow: (row) => rows.push(row),
    deleteRows: (from, n) => rows.splice(from - 1, n),
  }
  return runInNewContext(readFileSync('SimpleBackend.gs', 'utf8') +
    '\nsheet = () => testSheet; ({ appendSaveError, getSaveErrors, doPost });',
  {
    testSheet: sheet,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
    ContentService: {
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
      MimeType: { JSON: 'json' },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => false }) },
  })
}

it('stores a failed save and reads it back newest first, payload intact', () => {
  const rows = [['at']]
  const backend = backendWith(rows)
  const write = { type: 'session', id: 'w1', rows: [{ exercise: 'squat', reps: 8 }] }
  expect(backend.appendSaveError({ build: 'abc', route: 'session', writeId: 'w1', message: 'first', pending: 2, payload: write })).toEqual({ saved: 1 })
  backend.appendSaveError({ build: 'abc', route: 'calorie', writeId: 'w2', message: 'second', pending: 2 })
  const out = backend.getSaveErrors()
  expect(out.map((r) => r.message)).toEqual(['second', 'first'])
  expect(out[1].payload).toEqual(write)
  expect(out[0].payload).toBeNull()
  expect(() => backend.appendSaveError({})).toThrow()
})

it('takes a report even while the write lock is held', () => {
  const rows = [['at']]
  const backend = backendWith(rows)
  const res = backend.doPost({
    parameter: { route: 'save_error' },
    postData: { contents: JSON.stringify({ route: 'session', writeId: 'w1', message: 'Backend busy' }) },
  })
  expect(JSON.parse(res.text)).toEqual({ saved: 1 })
  expect(rows).toHaveLength(2)
})

it('trims old reports in a batch', () => {
  const rows = [['at']]
  const backend = backendWith(rows)
  for (let i = 0; i < 350; i++) backend.appendSaveError({ writeId: `w${i}`, message: 'x' })
  expect(rows.length - 1).toBe(300)
  expect(backend.getSaveErrors(1)[0].writeId).toBe('w349')
})
