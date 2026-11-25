import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync('SimpleBackend.gs', 'utf8')

/** Apps Script's computeDigest: signed bytes, from a string or from bytes. */
function computeDigest(_alg, value) {
  const buf = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value.map((b) => (b + 256) % 256))
  return [...createHash('sha256').update(buf).digest()].map((b) => (b > 127 ? b - 256 : b))
}

function fakeBook() {
  const tabs = new Map()
  const makeSheet = (name, rows) => ({
    rows,
    getName: () => name,
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((w, r) => Math.max(w, r.length), 0),
    appendRow: (row) => rows.push([...row]),
    deleteRow: (n) => rows.splice(n - 1, 1),
    deleteRows: (n, count) => rows.splice(n - 1, count),
    getRange: (row, col) => ({
      setValue: (v) => {
        const r = (rows[row - 1] = rows[row - 1] || [])
        r[col - 1] = v
      },
      setValues: (values) => {
        values.forEach((vals, i) => {
          const r = (rows[row - 1 + i] = rows[row - 1 + i] || [])
          vals.forEach((v, j) => { r[col - 1 + j] = v })
        })
      },
    }),
  })
  return {
    getSheetByName: (name) => tabs.get(name) || null,
    insertSheet: (name) => {
      if (tabs.has(name)) throw new Error('exists')
      const sh = makeSheet(name, [])
      tabs.set(name, sh)
      return sh
    },
    getSheets: () => [...tabs.values()],
    deleteSheet: (sh) => tabs.delete(sh.getName()),
    getSpreadsheetTimeZone: () => 'UTC',
    tab: (name) => (tabs.has(name) ? tabs.get(name).rows : undefined),
    names: () => [...tabs.keys()],
  }
}

const SECRET = 'owner-secret'
const bw = { date: '2026-11-01', weightLbs: 180 }
const DAY = 24 * 60 * 60 * 1000

function world() {
  const book = fakeBook()
  const cache = new Map()
  const properties = { CHAT_SHARED_SECRET: SECRET }
  const fetched = []
  function run(method, params, body) {
    const api = runInNewContext(SOURCE + '\n;({ doGet, doPost })', {
      SpreadsheetApp: { getActiveSpreadsheet: () => book },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => properties[k] ?? null,
          setProperty: (k, v) => { properties[k] = v },
          deleteProperty: (k) => { delete properties[k] },
        }),
      },
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
      UrlFetchApp: { fetch: (url) => { fetched.push(url) } },
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
  const w = {
    book,
    properties,
    fetched,
    get: (params) => run('GET', params),
    post: (params, body) => run('POST', params, body),
  }
  w.owner = w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'hunter22', name: 'Me' }).token
  return w
}

const register = (w, email, name = 'Ann') => w.post({ route: 'register' }, { email, password: 'hunter22', name })
const notices = (w) => w.get({ route: 'signups', user: w.owner })
const keep = (w, id, user = w.owner) => w.post({ route: 'signup_keep', user }, { id })
const decline = (w, id, user = w.owner) => w.post({ route: 'signup_decline', user }, { id })
/** Move a signups row back in time, as if the account had been made then. */
const age = (w, row, ms) => { w.book.tab('signups')[row][1] = new Date(Date.now() - ms).toISOString() }

describe('a new account leaves the owner a notice', () => {
  it('says who it is and when, to the owner only, and the account works at once', () => {
    const w = world()
    const before = Date.now()
    const ann = register(w, 'ann@example.com')
    expect(ann).toMatchObject({ saved: 1, owner: false })
    expect(w.post({ route: 'bodyweight', user: ann.token }, bw)).toEqual({ saved: 1 })
    const list = notices(w)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Ann', email: 'ann@example.com' })
    expect(list[0].id).toMatch(/^[a-z][a-z0-9]{5}$/)
    expect(new Date(list[0].createdAt).getTime()).toBeGreaterThanOrEqual(before)
    expect(JSON.stringify(list)).not.toContain(ann.token)
    expect(w.get({ route: 'signups', user: ann.token })).toEqual({ error: 'Owner only' })
  })

  it('lists the newest first, and none for the owner\'s own account', () => {
    const w = world()
    expect(notices(w)).toEqual([])
    register(w, 'ann@example.com', 'Ann')
    register(w, 'bob@example.com', 'Bob')
    expect(notices(w).map((n) => n.name)).toEqual(['Bob', 'Ann'])
  })

  it('is left by an account made with an invite code too', () => {
    const w = world()
    const { code } = w.post({ route: 'invite' }, { secret: SECRET })
    w.post({ route: 'join' }, { invite: code, name: 'Cy', claim: 'c1' })
    // The same phone asking again is handed the same account, not a second notice.
    w.post({ route: 'join' }, { invite: code, name: 'Cy', claim: 'c1' })
    expect(notices(w)).toMatchObject([{ name: 'Cy', email: '' }])
  })
})

describe('keeping an account', () => {
  it('takes the notice away and leaves the account as it was', () => {
    const w = world()
    const ann = register(w, 'ann@example.com')
    register(w, 'bob@example.com', 'Bob')
    const id = notices(w).find((n) => n.name === 'Ann').id
    expect(keep(w, id)).toEqual({ saved: 1 })
    expect(notices(w).map((n) => n.name)).toEqual(['Bob'])
    expect(w.get({ route: 'account', user: ann.token })).toMatchObject({ name: 'Ann' })
    // Asked twice, or for one that isn't there, it is still done.
    expect(keep(w, id)).toEqual({ saved: 1 })
    expect(keep(w, 'zzzzzz')).toEqual({ saved: 1 })
  })

  it('is the owner\'s alone', () => {
    const w = world()
    const ann = register(w, 'ann@example.com')
    const id = notices(w)[0].id
    expect(keep(w, id, ann.token)).toEqual({ error: 'Owner only' })
    expect(notices(w)).toHaveLength(1)
  })
})

describe('declining an account', () => {
  it('removes its row, its tabs and its notice, and its key stops working', () => {
    const w = world()
    const ann = register(w, 'ann@example.com')
    const bob = register(w, 'bob@example.com', 'Bob')
    w.post({ route: 'bodyweight', user: w.owner }, bw)
    w.post({ route: 'bodyweight', user: ann.token }, bw)
    w.post({ route: 'settings', user: ann.token }, { settings: { updatedAt: '2026-11-25' } })
    w.post({ route: 'bodyweight', user: bob.token }, bw)
    const id = notices(w).find((n) => n.name === 'Ann').id
    expect(w.book.names().filter((n) => n.startsWith('u' + id + '_')).length).toBeGreaterThanOrEqual(2)

    expect(decline(w, id)).toEqual({ saved: 1 })

    expect(w.book.names().filter((n) => n.startsWith('u' + id + '_'))).toEqual([])
    expect(w.book.tab('users').some((r) => r[1] === id)).toBe(false)
    expect(JSON.stringify(w.book.tab('users'))).not.toContain('ann@example.com')
    expect(w.get({ route: 'bodyweight', user: ann.token })).toEqual({ error: 'Unknown account' })
    expect(w.post({ route: 'bodyweight', user: ann.token }, bw)).toEqual({ error: 'Unknown account' })
    expect(w.post({ route: 'login' }, { email: 'ann@example.com', password: 'hunter22' }).error).toBe('Wrong email or password')
    expect(notices(w).map((n) => n.name)).toEqual(['Bob'])
    // Everyone else is where they were.
    expect(w.get({ route: 'bodyweight', user: bob.token })).toHaveLength(1)
    expect(w.get({ route: 'bodyweight', user: w.owner })).toHaveLength(1)
    expect(w.get({ route: 'people', user: w.owner }).map((p) => p.name).sort()).toEqual(['Bob', 'Me'])
  })

  it('removes the invite the account spent and its calendar link', () => {
    const w = world()
    const { code } = w.post({ route: 'invite' }, { secret: SECRET })
    const spare = w.post({ route: 'invite' }, { secret: SECRET }).code
    const cy = w.post({ route: 'join' }, { invite: code, name: 'Cy', claim: 'c1' })
    const id = notices(w)[0].id
    w.properties['gcal_' + id] = JSON.stringify({ refresh: 'r1', calendarId: 'cal', base: [] })
    expect(decline(w, id)).toEqual({ saved: 1 })
    expect(w.book.tab('invites').map((r) => r[0])).toEqual(['code', spare])
    expect(w.properties['gcal_' + id]).toBeUndefined()
    expect(w.fetched.some((url) => url.includes('/revoke?token=r1'))).toBe(true)
    expect(w.get({ route: 'account', user: cy.token })).toEqual({ error: 'Unknown account' })
    // The spent code does not make the account again.
    expect(w.post({ route: 'join' }, { invite: code, name: 'Cy', claim: 'c1' }).error).toMatch(/invite/)
  })

  it('is done quietly when the account is already gone', () => {
    const w = world()
    register(w, 'ann@example.com')
    const id = notices(w)[0].id
    expect(decline(w, id)).toEqual({ saved: 1 })
    expect(decline(w, id)).toEqual({ saved: 1 })
    expect(decline(w, 'zzzzzz')).toEqual({ saved: 1 })
    expect(w.book.tab('users')).toHaveLength(2)
  })

  it('cannot reach the owner\'s own account', () => {
    const w = world()
    w.post({ route: 'bodyweight', user: w.owner }, bw)
    for (const id of ['', ' ', 'owner', undefined]) {
      expect(decline(w, id), String(id)).toEqual({ error: 'No account given' })
    }
    // Even a book edited by hand, where the owner's row has an id and a notice.
    w.book.tab('users')[1][1] = 'ownerx'
    w.book.insertSheet('uownerx_workouts')
    register(w, 'ann@example.com')
    w.book.tab('signups').push(['ownerx', new Date().toISOString(), ''])
    expect(decline(w, 'ownerx')).toEqual({ error: "The owner's account can't be declined" })
    expect(w.book.tab('users')[1][7]).toBe('yes')
    expect(w.book.names()).toContain('uownerx_workouts')
    expect(w.get({ route: 'bodyweight', user: w.owner })).toHaveLength(1)
  })

  it('is the owner\'s alone', () => {
    const w = world()
    const ann = register(w, 'ann@example.com')
    const bob = register(w, 'bob@example.com', 'Bob')
    const id = notices(w).find((n) => n.name === 'Ann').id
    expect(decline(w, id, bob.token)).toEqual({ error: 'Owner only' })
    expect(decline(w, id, ann.token)).toEqual({ error: 'Owner only' })
    expect(w.post({ route: 'signup_decline' }, { id }).error).toBe('Sign in required')
    expect(w.get({ route: 'account', user: ann.token })).toMatchObject({ name: 'Ann' })
  })

  it('only takes an account whose notice is still waiting', () => {
    const w = world()
    const ann = register(w, 'ann@example.com')
    const id = notices(w)[0].id
    keep(w, id)
    expect(decline(w, id)).toEqual({ error: 'That account is not waiting on you' })
    expect(w.get({ route: 'account', user: ann.token })).toMatchObject({ name: 'Ann' })
  })
})

describe('the limit on new accounts', () => {
  const fill = (w) => {
    for (let i = 0; i < 5; i++) expect(register(w, `p${i}@example.com`, 'P' + i).saved).toBe(1)
  }

  it('makes five in any 24 hours and refuses the sixth in plain words', () => {
    const w = world()
    fill(w)
    expect(register(w, 'six@example.com')).toEqual({ error: 'Too many new accounts today. Try again tomorrow' })
    expect(w.book.tab('users')).toHaveLength(7)
    expect(notices(w)).toHaveLength(5)
    // Someone who already has an account is still sent to sign in.
    expect(register(w, 'p0@example.com')).toEqual({ error: 'Could not create that account' })
    expect(w.post({ route: 'login' }, { email: 'p0@example.com', password: 'hunter22' }).saved).toBe(1)
  })

  it('has room again once a day has passed', () => {
    const w = world()
    fill(w)
    age(w, 1, DAY + 60_000)
    expect(register(w, 'six@example.com').saved).toBe(1)
    expect(register(w, 'seven@example.com').error).toMatch(/Too many new accounts/)
  })

  it('is not opened up by keeping or declining', () => {
    const w = world()
    fill(w)
    const list = notices(w)
    decline(w, list[0].id)
    keep(w, list[1].id)
    expect(register(w, 'six@example.com').error).toMatch(/Too many new accounts/)
  })

  it('counts an invited account but never refuses one', () => {
    const w = world()
    fill(w)
    const { code } = w.post({ route: 'invite' }, { secret: SECRET })
    expect(w.post({ route: 'join' }, { invite: code, name: 'Cy', claim: 'c1' }).saved).toBe(1)
    expect(notices(w)).toHaveLength(6)
  })
})

describe('a notice nobody answers', () => {
  it('leaves on its own after 30 days, and the account stays', () => {
    const w = world()
    const ann = register(w, 'ann@example.com')
    register(w, 'bob@example.com', 'Bob')
    age(w, 1, 29 * DAY)
    expect(notices(w).map((n) => n.name)).toEqual(['Bob', 'Ann'])
    age(w, 1, 30 * DAY + 60_000)
    expect(notices(w).map((n) => n.name)).toEqual(['Bob'])
    expect(w.get({ route: 'account', user: ann.token })).toMatchObject({ name: 'Ann' })
  })

  it('has its row dropped from the tab when the next account is made', () => {
    const w = world()
    register(w, 'ann@example.com')
    register(w, 'bob@example.com', 'Bob')
    age(w, 1, 31 * DAY)
    age(w, 2, 2 * DAY)
    register(w, 'cy@example.com', 'Cy')
    expect(w.book.tab('signups')).toHaveLength(3)
    expect(notices(w).map((n) => n.name)).toEqual(['Cy', 'Bob'])
  })

  it('is never one of more than 30 in a read', () => {
    const w = world()
    for (let i = 0; i < 40; i++) {
      register(w, `p${i}@example.com`, 'P' + i)
      age(w, w.book.tab('signups').length - 1, (41 - i) * 60 * 60 * 1000 + DAY)
    }
    const list = notices(w)
    expect(list).toHaveLength(30)
    expect(list[0].name).toBe('P39')
  })
})
