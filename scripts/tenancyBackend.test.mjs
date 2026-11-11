import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'

const SOURCE = readFileSync('SimpleBackend.gs', 'utf8')

/** An in-memory spreadsheet: tabs are arrays of rows, with just the Sheet API the backend uses. */
function fakeBook() {
  const tabs = new Map()
  const makeSheet = (rows) => ({
    rows,
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((w, r) => Math.max(w, r.length), 0),
    appendRow: (row) => rows.push([...row]),
    deleteRow: (n) => rows.splice(n - 1, 1),
    deleteRows: (from, n) => rows.splice(from - 1, n),
    clearContents: () => rows.splice(0, rows.length),
    getRange: (row, col, nRows = 1, nCols = 1) => ({
      setValues: (values) => {
        values.forEach((vals, i) => {
          const r = (rows[row - 1 + i] = rows[row - 1 + i] || [])
          vals.forEach((v, j) => { r[col - 1 + j] = v })
        })
      },
      getValues: () => {
        const out = []
        for (let i = 0; i < nRows; i++) {
          const r = rows[row - 1 + i] || []
          out.push(Array.from({ length: nCols }, (_, j) => (r[col - 1 + j] === undefined ? '' : r[col - 1 + j])))
        }
        return out
      },
    }),
  })
  return {
    tabs,
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

function world(props = {}) {
  const book = fakeBook()
  const properties = { ...props }
  function run(method, params, body) {
    const api = runInNewContext(SOURCE + '\n;({ doGet, doPost })', {
      SpreadsheetApp: { getActiveSpreadsheet: () => book },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => properties[k] ?? null }) },
      Utilities: {
        getUuid: () => randomUUID(),
        formatDate: (d) => d.toISOString().slice(0, 10),
      },
      ContentService: {
        createTextOutput: (text) => ({ text, setMimeType() { return this } }),
        MimeType: { JSON: 'json' },
      },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    })
    const res = method === 'GET'
      ? api.doGet({ parameter: params })
      : api.doPost({ parameter: params, postData: { contents: JSON.stringify(body || {}) } })
    return JSON.parse(res.text)
  }
  return {
    book,
    properties,
    get: (params) => run('GET', params),
    post: (params, body) => run('POST', params, body),
    /** Mint an invite as the owner and join with it; returns the new account's token. */
    join(name) {
      const { code } = run('POST', { route: 'invite' }, { secret: properties.CHAT_SHARED_SECRET })
      return run('POST', { route: 'join' }, { invite: code, name }).token
    },
  }
}

const SECRET = 'owner-secret'
const bw = { date: '2026-11-01', weightLbs: 180 }

it('serves a tokenless request from the owner tabs, unprefixed', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  expect(w.post({ route: 'bodyweight' }, bw)).toEqual({ saved: 1 })
  expect(w.book.tab('body_weight')).toHaveLength(2)
  expect(w.get({ route: 'bodyweight' })).toEqual([{ date: '2026-11-01', weightLbs: 180 }])
  expect(w.get({ route: 'account' })).toEqual({ name: '', owner: true })
})

it('keeps a joined user in prefixed tabs, invisible to the owner and to another user', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const ann = w.join('Ann')
  const bob = w.join('Bob')
  expect(w.get({ route: 'account', user: ann })).toEqual({ name: 'Ann', owner: false })

  w.post({ route: 'bodyweight', user: ann }, bw)
  const annId = w.book.tab('users').find((r) => r[0] === ann)[1]
  expect(annId).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/)
  expect(w.book.tab(`u${annId}_body_weight`)).toHaveLength(2)
  expect(w.book.tab('body_weight')).toBeUndefined()

  expect(w.get({ route: 'bodyweight', user: ann })).toHaveLength(1)
  expect(w.get({ route: 'bodyweight', user: bob })).toEqual([])
  expect(w.get({ route: 'bodyweight' })).toEqual([])
})

it('keeps a joined user\'s flexibility tab prefixed too', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const ann = w.join('Ann')
  w.get({ route: 'flexibility', user: ann })
  const annId = w.book.tab('users').find((r) => r[0] === ann)[1]
  expect(w.book.tab(`u${annId}_flexibility`)).toBeDefined()
  expect(w.book.tab('flexibility')).toBeUndefined()
})

it('refuses an unknown token', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  expect(w.get({ route: 'workouts', user: 'nope' }).error).toBe('Unknown account')
  expect(w.post({ route: 'bodyweight', user: 'nope' }, bw).error).toBe('Unknown account')
  expect(w.book.tab('body_weight')).toBeUndefined()
})

it('refuses a tokenless request once REQUIRE_ACCOUNT is set, but still answers version and join', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const ann = w.join('Ann')
  w.properties.REQUIRE_ACCOUNT = '1'
  expect(w.get({ route: 'workouts' }).error).toBe('Sign in required')
  expect(w.post({ route: 'bodyweight' }, bw).error).toBe('Sign in required')
  expect(w.get({ route: 'version' }).version).toBeTypeOf('number')
  expect(w.get({ route: 'bodyweight', user: ann })).toEqual([])
  const { code } = w.post({ route: 'invite' }, { secret: SECRET })
  expect(w.post({ route: 'join' }, { invite: code, name: 'Cy' }).saved).toBe(1)
})

it('treats the shared secret as the owner', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET, REQUIRE_ACCOUNT: '1' })
  expect(w.post({ route: 'bodyweight', user: SECRET }, bw)).toEqual({ saved: 1 })
  expect(w.book.tab('body_weight')).toHaveLength(2)
  expect(w.get({ route: 'account', user: SECRET })).toEqual({ name: '', owner: true })
})

it('spends an invite once, in any case, and checks the name', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const { code } = w.post({ route: 'invite' }, { secret: SECRET })
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
  expect(w.post({ route: 'join' }, { invite: code, name: '   ' }).error).toBe('A name is required')
  const joined = w.post({ route: 'join' }, { invite: ` ${code.toLowerCase()} `, name: ' Ann ' })
  expect(joined.saved).toBe(1)
  expect(joined.name).toBe('Ann')
  expect(joined.token).toMatch(/^[0-9a-f]{64}$/)
  expect(w.post({ route: 'join' }, { invite: code, name: 'Eve' }).error).toBe("That invite code isn't valid")
  expect(w.post({ route: 'join' }, { invite: 'ZZZZZZZZ', name: 'Eve' }).error).toBe("That invite code isn't valid")
  const invite = w.book.tab('invites')[1]
  expect(invite[2]).not.toBe('')
  expect(invite[3]).toBe('Ann')
  expect(w.post({ route: 'join' }, { invite: (code), name: 'x'.repeat(60) }).error).toBeDefined()
  const second = w.post({ route: 'invite' }, { secret: SECRET }).code
  expect(w.post({ route: 'join' }, { invite: second, name: 'y'.repeat(60) }).name).toHaveLength(40)
})

it('answers a join again for the phone that made it, and for nobody else', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const { code } = w.post({ route: 'invite' }, { secret: SECRET })
  const first = w.post({ route: 'join' }, { invite: code, name: 'Ann', claim: 'phone-1' })
  // The reply was lost; the same phone asks again and gets the account it made.
  const again = w.post({ route: 'join' }, { invite: code, name: 'Ann', claim: 'phone-1' })
  expect(again).toEqual({ saved: 1, token: first.token, name: 'Ann' })
  expect(w.book.tab('users')).toHaveLength(2)
  // Another phone with the same code, or the same one with no claim, is refused.
  expect(w.post({ route: 'join' }, { invite: code, name: 'Eve', claim: 'phone-2' }).error).toBe("That invite code isn't valid")
  expect(w.post({ route: 'join' }, { invite: code, name: 'Eve' }).error).toBe("That invite code isn't valid")
  // An invite spent with no claim can't be claimed afterwards by sending a blank one.
  const bare = w.post({ route: 'invite' }, { secret: SECRET }).code
  w.post({ route: 'join' }, { invite: bare, name: 'Cy' })
  expect(w.post({ route: 'join' }, { invite: bare, name: 'Eve', claim: '' }).error).toBe("That invite code isn't valid")
})

it('keeps a name from opening with a formula character', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const { code } = w.post({ route: 'invite' }, { secret: SECRET })
  expect(w.post({ route: 'join' }, { invite: code, name: '=HYPERLINK("x")' }).name).toBe('HYPERLINK("x")')
})

it('refuses an invite with the wrong or missing secret, and never fails open', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  expect(w.post({ route: 'invite' }, { secret: 'wrong' }).error).toBe('Bad chat secret')
  expect(w.post({ route: 'invite' }, {}).error).toBe('Bad chat secret')
  expect(w.book.tab('invites')).toBeUndefined()
  const unset = world()
  expect(unset.post({ route: 'invite' }, {}).error).toMatch(/not set/)
  expect(unset.post({ route: 'invite' }, { secret: '' }).error).toMatch(/not set/)
})

it('upserts cardio by id and deletes idempotently', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const ann = w.join('Ann')
  const q = { route: 'cardio', user: ann }
  expect(w.post(q, { id: 'c1', date: '2026-11-01', kind: 'run', minutes: 30, distanceMi: 3.1 })).toEqual({ saved: 1 })
  expect(w.post(q, { id: 'c2', date: '2026-11-03', kind: 'bike', minutes: 45 })).toEqual({ saved: 1 })
  expect(w.post(q, { id: 'c1', date: '2026-11-01', kind: 'run', minutes: 35, distanceMi: 3.4 })).toEqual({ saved: 1 })
  expect(w.get(q)).toEqual([
    { id: 'c1', date: '2026-11-01', kind: 'run', minutes: 35, distanceMi: 3.4 },
    { id: 'c2', date: '2026-11-03', kind: 'bike', minutes: 45 },
  ])
  expect(w.get({ ...q, since: '2026-11-02' }).map((r) => r.id)).toEqual(['c2'])
  expect(w.post(q, { id: 'c1', deleted: true })).toEqual({ saved: 1 })
  expect(w.post(q, { id: 'c1', deleted: true })).toEqual({ saved: 1 })
  expect(w.get(q).map((r) => r.id)).toEqual(['c2'])
  expect(w.get({ route: 'cardio' })).toEqual([])
})

it('rejects cardio that would store nothing', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const q = { route: 'cardio' }
  expect(w.post(q, { date: '2026-11-01', minutes: 5 }).error).toBeDefined()
  expect(w.post(q, { id: 'c', minutes: 5 }).error).toBeDefined()
  expect(w.post(q, { id: 'c', date: '2026-11-01', minutes: 0 }).error).toBeDefined()
  expect(w.post(q, { id: 'c', date: '2026-11-01', minutes: 'x' }).error).toBeDefined()
  expect(w.post(q, { id: 'c', date: '2026-11-01', minutes: -3 }).error).toBeDefined()
  expect(w.get(q)).toEqual([])
})

it('files a user\'s failed-save report in the owner tab under their name, and only the owner reads it', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const ann = w.join('Ann')
  expect(w.post({ route: 'save_error', user: ann }, { build: 'b1', route: 'session', writeId: 'w1', message: 'Backend busy' })).toEqual({ saved: 1 })
  w.post({ route: 'save_error' }, { message: 'owner one' })
  const rows = w.book.tab('save_errors')
  expect(rows[0][7]).toBe('user')
  expect(rows[1][7]).toBe('Ann')
  expect(rows[2][7]).toBe('')
  expect(w.book.tab(`u${w.book.tab('users')[1][1]}_save_errors`)).toBeUndefined()

  expect(w.get({ route: 'save_errors', user: ann }).error).toBe('Owner only')
  const seen = w.get({ route: 'save_errors' })
  expect(seen.map((r) => [r.message, r.user])).toEqual([['owner one', ''], ['Backend busy', 'Ann']])
})

it('files feedback in the owner tab', () => {
  const w = world({ CHAT_SHARED_SECRET: SECRET })
  const ann = w.join('Ann')
  expect(w.post({ route: 'feedback', user: ann }, { message: '  love it  ', build: 'b9' })).toEqual({ saved: 1 })
  const row = w.book.tab('feedback')[1]
  expect(row.slice(1)).toEqual(['Ann', 'b9', 'love it'])
  expect(w.post({ route: 'feedback' }, { message: '   ' }).error).toBeDefined()
  expect(w.post({ route: 'feedback' }, { message: 'x'.repeat(4001) }).error).toBeDefined()
  expect(w.post({ route: 'feedback' }, { message: 'x'.repeat(4000) })).toEqual({ saved: 1 })
  expect(w.book.tab(`u${w.book.tab('users')[1][1]}_feedback`)).toBeUndefined()
})
