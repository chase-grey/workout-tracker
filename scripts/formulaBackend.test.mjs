import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync('SimpleBackend.gs', 'utf8')

// What someone could type to have Sheets run it, and what someone could type
// in good faith that looks the same to a careless check.
const DANGEROUS = [
  '=1+1',
  '+1',
  '-1',
  '@x',
  '=IMPORTRANGE("https://docs.google.com/spreadsheets/d/x", "users!A:A")',
  '=users!A2',
  "=INDIRECT(\"'uab12cd_workouts'!H2\")",
  '+users!A2',
  '-users!A2',
  '@SUM(users!A:A)',
  '\t=1+1',
  '\r=1+1',
  '\n=1+1',
  '\r\n+1',
  ' =1+1',
  ' =1+1',
  '\u0000=1+1',
  '﻿=1+1',
  "'=1+1",
  "''=1+1",
  '- felt tight on the left',
  '+5 lb from last week',
  '@ the gym',
  "'til failure",
]

/**
 * A book that treats a written string the way Sheets does, as far as it
 * matters here: one leading apostrophe marks the cell as text and is not kept,
 * and a string that opens with = + - or @ (white space or not) is run. Sheets
 * is in fact less eager than this about + - and @, so passing here is passing
 * there. Nothing a test writes may ever land in `ran`.
 */
function sheetsBook() {
  const tabs = new Map()
  const ran = []
  const stored = (v) => {
    if (typeof v !== 'string') return v
    if (v.startsWith("'")) return v.slice(1)
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(v)) {
      ran.push(v)
      return '#RAN'
    }
    return v
  }
  const makeSheet = (rows) => ({
    rows,
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((w, r) => Math.max(w, r.length), 0),
    appendRow: (row) => rows.push(row.map(stored)),
    deleteRow: (n) => rows.splice(n - 1, 1),
    deleteRows: (n, count) => rows.splice(n - 1, count),
    clearContents: () => rows.splice(0, rows.length),
    getRange: (row, col, height = 1, width = 1) => ({
      getValues: () => Array.from({ length: height }, (_, i) =>
        Array.from({ length: width }, (_, j) => (rows[row - 1 + i] || [])[col - 1 + j] ?? '')),
      setValue: (v) => {
        const r = (rows[row - 1] = rows[row - 1] || [])
        r[col - 1] = stored(v)
      },
      setValues: (values) => {
        values.forEach((vals, i) => {
          const r = (rows[row - 1 + i] = rows[row - 1 + i] || [])
          vals.forEach((v, j) => { r[col - 1 + j] = stored(v) })
        })
      },
    }),
  })
  return {
    ran,
    getSheetByName: (name) => tabs.get(name) || null,
    insertSheet: (name) => {
      if (tabs.has(name)) throw new Error('exists')
      const sh = makeSheet([])
      tabs.set(name, sh)
      return sh
    },
    getSpreadsheetTimeZone: () => 'UTC',
    tab: (name) => (tabs.has(name) ? tabs.get(name).rows : undefined),
  }
}

function computeDigest(_alg, value) {
  const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value.map((b) => (b + 256) % 256))
  return [...createHash('sha256').update(buf).digest()].map((b) => (b > 127 ? b - 256 : b))
}

const SECRET = 'owner-secret'

function world() {
  const book = sheetsBook()
  const cache = new Map()
  const properties = { CHAT_SHARED_SECRET: SECRET }
  const load = () => runInNewContext(SOURCE + '\n;({ doGet, doPost, plainText, cellValue, cellRow })', {
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties[k] ?? null }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) ?? null,
        put: (k, v) => cache.set(k, v),
        remove: (k) => cache.delete(k),
      }),
    },
    Utilities: {
      getUuid: () => randomUUID(),
      formatDate: (d) => d.toISOString().slice(0, 10),
      computeDigest,
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      base64EncodeWebSafe: (s) => Buffer.from(s).toString('base64url'),
    },
    ContentService: {
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
      MimeType: { JSON: 'json' },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  })
  const run = (method, params, body) => {
    const api = load()
    const res = method === 'GET'
      ? api.doGet({ parameter: params })
      : api.doPost({ parameter: params, postData: { contents: JSON.stringify(body || {}) } })
    return JSON.parse(res.text)
  }
  return {
    book,
    api: load(),
    get: (route, params = {}) => run('GET', { route, ...params }),
    post: (route, body, params = {}) => run('POST', { route, ...params }, body),
  }
}

describe('the one way a value reaches a cell', () => {
  const { api } = world()

  it('marks every string Sheets could run as text, and keeps what was typed', () => {
    for (const typed of DANGEROUS) {
      const [cell] = api.cellRow([typed])
      expect(cell.startsWith("'"), JSON.stringify(typed)).toBe(true)
      // The apostrophe is the mark, not the value: without it, the original.
      expect(cell.slice(1)).toBe(typed)
    }
  })

  it('leaves ordinary text, numbers, booleans and dates as they are', () => {
    const when = new Date('2026-11-25T12:00:00Z')
    const row = ['bench press', '2026-11-25', '3 x 5 @ 185', 'a = b', "it's fine", '', 185, -1, 0, true, false, when]
    expect(Array.from(api.cellRow(row))).toEqual(row)
  })

  it('turns anything that is not a plain value into text that cannot run', () => {
    expect(Array.from(api.cellRow([null, undefined]))).toEqual(['', ''])
    expect(api.cellValue(['=1+1'])).toBe("'=1+1")
    expect(api.cellValue({ toString: () => '=1+1' })).toBe("'=1+1")
    expect(api.cellValue({})).toBe('[object Object]')
  })

  it('is the only thing in the file that writes', () => {
    const count = (re) => (SOURCE.match(re) || []).length
    // One each, inside addRow, writeCell and writeRows. A new write path uses
    // those; a raw call here is a cell someone can put a formula in.
    expect(count(/\.appendRow\(/g)).toBe(1)
    expect(count(/\.setValue\(/g)).toBe(1)
    expect(count(/\.setValues\(/g)).toBe(1)
    expect(count(/\.setFormulas?\(|\.setRichTextValues?\(|\.insertRow|\.copyTo\(/g)).toBe(0)
    expect(SOURCE).toMatch(/sh\.appendRow\(cellRow\(values\)\)/)
    expect(SOURCE).toMatch(/\.setValue\(cellValue\(value\)\)/)
    expect(SOURCE).toMatch(/\.setValues\(values\.map\(cellRow\)\)/)
  })
})

describe('every route that stores what someone typed', () => {
  for (const typed of DANGEROUS) {
    const label = JSON.stringify(typed)

    it(`workouts and their notes: ${label}`, () => {
      const w = world()
      const row = {
        session_id: typed, date: '2026-11-25', day_type: typed, exercise: typed,
        set_number: 1, weight_lbs: 100, reps: 5, notes: typed, is_historical: false, variant: typed,
      }
      expect(w.post('session', { rows: [row, { ...row, date: typed, set_number: 2 }] })).toEqual({ saved: 2 })
      expect(w.get('workouts')[0]).toEqual(row)
      // A retry is still recognised as the same sets.
      expect(w.post('session', { rows: [row] })).toEqual({ saved: 1 })
      expect(w.book.tab('workouts')).toHaveLength(3)
      expect(w.post('notes', { session: typed, exercise: typed, notes: typed + '!' })).toEqual({ saved: 2 })
      expect(w.post('notes', { session: typed, exercise: typed, notes: typed })).toEqual({ saved: 2 })
      expect(w.get('workouts').map((r) => r.notes)).toEqual([typed, typed])
      expect(w.book.ran).toEqual([])
    })

    it(`measurements, and a stored note written back: ${label}`, () => {
      const w = world()
      w.post('measurements', { date: '2026-11-25', waistIn: 34, note: typed })
      // No note this time: the stored one is read and written again.
      w.post('measurements', { date: '2026-11-25', bodyFatPct: 15 })
      w.post('measurements', { date: typed, waistIn: 34, note: typed })
      expect(w.get('measurements')[0]).toMatchObject({ note: typed, waistIn: 34, bodyFatPct: 15 })
      expect(w.book.ran).toEqual([])
    })

    it(`body weight, calories, durations and exercise times: ${label}`, () => {
      const w = world()
      w.post('bodyweight', { date: typed, weightLbs: 180 })
      w.post('bodyweight', { entries: [{ date: typed, weightLbs: 181 }] })
      w.post('calories', { date: '2026-11-25', calories: 500, label: typed, loggedAt: typed, helpings: [{ at: typed, amount: 500 }] })
      w.post('calories', { date: '2026-11-25', calories: 700 })
      w.post('calories', { date: typed, calories: 100, label: typed })
      expect(w.get('calories')[0]).toMatchObject({ calories: 700, loggedAt: typed })
      w.post('durations', { date: '2026-11-25', kind: typed, dayType: typed, routine: typed, totalSec: 60 })
      w.post('durations', { date: typed, totalSec: 60 })
      expect(w.get('durations')[0]).toMatchObject({ kind: typed, dayType: typed, routine: typed })
      w.post('exercise_times', { exercises: [{ exercise: typed, totalActiveSec: 60, sets: 2 }] })
      w.post('exercise_times', { exercises: [{ exercise: typed, totalActiveSec: 30, sets: 1 }] })
      expect(w.get('exercise_times').active[typed]).toEqual({ avgSec: 30, n: 3 })
      expect(w.book.ran).toEqual([])
    })

    it(`flexibility: ${label}`, () => {
      const w = world()
      w.post('flexibility', { date: '2026-11-25', splitDeg: 120, note: typed, routines: [typed], startSides: { [typed]: typed } })
      w.post('flexibility', { date: '2026-11-25', warmSplitDeg: 130, routines: ['other'] })
      w.post('flexibility', { date: typed, splitDeg: 120, note: typed })
      const day = w.get('flexibility')[0]
      expect(day).toMatchObject({ note: typed, splitDeg: 120, warmSplitDeg: 130, startSides: { [typed]: typed } })
      expect(w.book.ran).toEqual([])
    })

    it(`cardio, feedback and failed-save reports: ${label}`, () => {
      const w = world()
      w.post('cardio', { id: typed, date: '2026-11-25', kind: typed, minutes: 30 })
      w.post('cardio', { id: typed, date: typed, kind: typed, minutes: 40 })
      w.post('cardio', { id: 'c2', date: '2026-11-25', kind: typed })
      expect(w.get('cardio').find((c) => c.id === typed)).toMatchObject({ kind: typed, minutes: 40 })
      expect(w.book.tab('cardio')).toHaveLength(3)
      w.post('feedback', { message: 'x' + typed, build: typed })
      if (typed.trim()) w.post('feedback', { message: typed, build: typed })
      w.post('save_error', { build: typed, route: typed, writeId: typed, message: typed, pending: typed, payload: typed })
      w.post('save_error', { message: typed, payload: -1 })
      expect(w.get('save_errors')[1]).toMatchObject({ build: typed, route: typed, writeId: typed, message: typed, payload: typed })
      expect(w.book.ran).toEqual([])
    })

    it(`plan, settings and the shared summary: ${label}`, () => {
      const w = world()
      for (const route of ['plan', 'settings', 'share']) {
        const blob = { updatedAt: typed, note: typed, [typed]: [typed] }
        w.post(route, { [route]: blob })
        w.post(route, { [route]: blob })
        expect(w.get(route)).toEqual(blob)
      }
      w.post('plan', { plan: typed })
      expect(w.get('plan')).toBe(typed)
      w.post('plan', { plan: -1 })
      expect(w.book.ran).toEqual([])
    })

    it(`accounts and invites: ${label}`, () => {
      const w = world()
      const made = w.post('register', { email: 'ann@example.com', password: typed + 'hunter22', name: typed + 'Ann' })
      expect(made.saved).toBe(1)
      expect(w.post('set_login', { email: 'ann2@example.com', password: typed + 'hunter22' }, { user: made.token })).toEqual({ saved: 1 })
      const { code } = w.post('invite', { secret: SECRET })
      const joined = w.post('join', { invite: code, name: typed + 'Cy', claim: typed })
      expect(joined.saved).toBe(1)
      // The claim still finds the account it made, as it was typed.
      if (typed.trim()) expect(w.post('join', { invite: code, name: 'Cy', claim: typed }).token).toBe(joined.token)
      expect(w.get('workouts', { user: joined.token })).toEqual([])
      expect(w.post('claim_owner', { secret: SECRET, email: 'me@example.com', password: typed + 'hunter22', name: typed + 'Me' }).saved).toBe(1)
      expect(w.book.ran).toEqual([])
    })
  }
})
