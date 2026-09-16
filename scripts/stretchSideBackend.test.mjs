import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

it('round-trips starting sides through the sheet and preserves them during measurements', () => {
  const rows = []
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    getRange: (row, col, height, width) => ({
      getValues: () => Array.from({ length: height }, (_, i) =>
        Array.from({ length: width }, (_, j) => rows[row - 1 + i]?.[col - 1 + j] ?? '')),
      setValues: (values) => {
        values.forEach((valuesRow, i) => {
          rows[row - 1 + i] ??= []
          valuesRow.forEach((v, j) => { rows[row - 1 + i][col - 1 + j] = v })
        })
      },
    }),
    getLastRow: () => rows.length,
    appendRow: (row) => rows.push(row),
  }
  const backend = runInNewContext(
    readFileSync('SimpleBackend.gs', 'utf8') + `
      flexSheet = () => testSheet;
      isoDate = (date) => String(date);
      ({ appendFlex, getFlex });
    `,
    { testSheet: sheet, SpreadsheetApp: { getActiveSpreadsheet: () => ({}) } },
  )
  rows.push(['date'])
  backend.appendFlex({ date: '2026-09-15', routines: ['head_to_toe'], startSides: { head_to_toe: 'right' } })
  backend.appendFlex({ date: '2026-09-15', routines: ['side_split'], startSides: { side_split: 'left' } })
  backend.appendFlex({ date: '2026-09-15', note: 'measurement', warmToeTouchDeg: 45 })
  expect(backend.getFlex()[0].startSides).toEqual({ head_to_toe: 'right', side_split: 'left' })
  backend.appendFlex({ date: '2026-09-15', startSides: { head_to_toe: 'left' } })
  expect(backend.getFlex()[0].startSides.head_to_toe).toBe('left')
  backend.appendFlex({ date: '2026-09-14', routines: ['side_split'] })
  backend.appendFlex({ date: '2026-09-14', note: 'measurement' })
  expect(backend.getFlex()[1].startSides).toBeUndefined()
})
