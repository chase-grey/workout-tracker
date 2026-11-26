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
  const makeSheet = (rows) => ({
    rows,
    getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((w, r) => Math.max(w, r.length), 0),
    appendRow: (row) => rows.push([...row]),
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
      const sh = makeSheet([])
      tabs.set(name, sh)
      return sh
    },
    getSpreadsheetTimeZone: () => 'UTC',
    tab: (name) => (tabs.has(name) ? tabs.get(name).rows : undefined),
  }
}

const SECRET = 'owner-secret'
const bw = { date: '2026-11-01', weightLbs: 180 }

function world() {
  const book = fakeBook()
  const cache = new Map()
  const properties = { CHAT_SHARED_SECRET: SECRET }
  function run(method, params, body) {
    const api = runInNewContext(SOURCE + '\n;({ doGet, doPost })', {
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
    const res = method === 'GET'
      ? api.doGet({ parameter: params })
      : api.doPost({ parameter: params, postData: { contents: JSON.stringify(body || {}) } })
    return JSON.parse(res.text)
  }
  return {
    book,
    cache,
    get: (params) => run('GET', params),
    post: (params, body) => run('POST', params, body),
  }
}

const register = (w, email, password = 'hunter22', name = 'Ann') =>
  w.post({ route: 'register' }, { email, password, name })
const login = (w, email, password) => w.post({ route: 'login' }, { email, password })

describe('register and login', () => {
  it('makes an account anyone can sign back into, with its own tabs', () => {
    const w = world()
    const r = register(w, 'Ann@Example.com ')
    expect(r).toMatchObject({ saved: 1, name: 'Ann', owner: false })
    expect(login(w, 'ann@example.com', 'hunter22').token).toBe(r.token)
    w.post({ route: 'bodyweight', user: r.token }, bw)
    expect(w.get({ route: 'bodyweight', user: r.token })).toHaveLength(1)
    expect(w.book.tab('body_weight')).toBeUndefined()
  })

  it('never stores the password itself', () => {
    const w = world()
    register(w, 'ann@example.com', 'hunter22')
    const row = w.book.tab('users')[1]
    expect(row.join('|')).not.toContain('hunter22')
    expect(row[6]).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses a wrong password and an unknown email the same way', () => {
    const w = world()
    register(w, 'ann@example.com')
    expect(login(w, 'ann@example.com', 'wrong-one').error).toBe('Wrong email or password')
    expect(login(w, 'bob@example.com', 'hunter22').error).toBe('Wrong email or password')
  })

  it('stops checking an email after too many wrong passwords', () => {
    const w = world()
    register(w, 'ann@example.com')
    for (let i = 0; i < 10; i++) login(w, 'ann@example.com', 'nope-nope')
    expect(login(w, 'ann@example.com', 'hunter22').error).toMatch(/Too many tries/)
  })

  it('refuses a taken email the same way whatever the password, and never hands out its key', () => {
    const w = world()
    const first = register(w, 'ann@example.com')
    const right = register(w, 'ann@example.com')
    const wrong = register(w, 'Ann@Example.com', 'other-pass')
    expect(right).toEqual({ error: 'Could not create that account' })
    expect(wrong).toEqual(right)
    expect(JSON.stringify([right, wrong])).not.toContain(first.token)
    expect(w.book.tab('users')).toHaveLength(2)
    // The account is still reached by signing in.
    expect(login(w, 'ann@example.com', 'hunter22').token).toBe(first.token)
  })

  it('gives no way round the limit on wrong passwords', () => {
    const w = world()
    const first = register(w, 'ann@example.com')
    for (let i = 0; i < 10; i++) login(w, 'ann@example.com', 'nope-nope')
    // Locked out of login: sign-up with the right password must not be a side door.
    expect(register(w, 'ann@example.com', 'hunter22')).toEqual({ error: 'Could not create that account' })
    expect(login(w, 'ann@example.com', 'hunter22').error).toMatch(/Too many tries/)
    // Nor does any number of sign-up tries count against, or reset, that limit.
    const fresh = world()
    register(fresh, 'bob@example.com')
    for (let i = 0; i < 50; i++) register(fresh, 'bob@example.com', 'guess-' + i + '-long')
    expect(fresh.cache.size).toBe(0)
    expect(first.token).toBeTruthy()
  })

  it('checks email, password and name', () => {
    const w = world()
    expect(register(w, 'not-an-email').error).toMatch(/email/)
    expect(register(w, 'a@b.co', 'short').error).toMatch(/at least 8/)
    expect(register(w, 'a@b.co', 'hunter22', ' ').error).toMatch(/name/)
  })

  it('refuses an email that opens like a formula or carries what no address needs', () => {
    const w = world()
    for (const email of [
      '=a@b.co', '+a@b.co', '-a@b.co', '@a@b.co', '=IMPORTRANGE("x","users!A:A")@b.co', '"a"@b.co', "o'a@b.co",
      'a&b@b.co', 'a(b)@b.co', 'a b@b.co', 'a@b .co', 'a=b@b.co', 'a@b.co"', 'a@-b.co', 'a@b..co',
    ]) {
      expect(register(w, email).error, email).toMatch(/email/)
      expect(w.post({ route: 'claim_owner' }, { secret: SECRET, email, password: 'hunter22' }).error, email).toMatch(/email/)
    }
    expect(w.book.tab('users')).toBeUndefined()
    expect(register(w, 'Ann+Gym@Mail.Example.co.uk').saved).toBe(1)
    expect(register(w, 'first.last_x-y%z@ex-ample.io').saved).toBe(1)
  })
})

describe('the owner claiming an email', () => {
  it('reaches the owner tabs by the new token, and shuts the tokenless door', () => {
    const w = world()
    w.post({ route: 'bodyweight' }, bw) // the old phone, before
    const r = w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'hunter22' })
    expect(r).toMatchObject({ saved: 1, owner: true })
    expect(w.get({ route: 'bodyweight', user: r.token })).toHaveLength(1)
    expect(w.get({ route: 'account', user: r.token })).toMatchObject({ owner: true, email: 'me@example.com' })
    expect(w.get({ route: 'bodyweight' }).error).toBe('Sign in required')
    expect(login(w, 'me@example.com', 'hunter22')).toMatchObject({ token: r.token, owner: true })
  })

  it('needs the secret, and resets the login when called again', () => {
    const w = world()
    expect(w.post({ route: 'claim_owner' }, { secret: 'x', email: 'me@example.com', password: 'hunter22' }).error).toBe('Bad chat secret')
    const r = w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'hunter22' })
    const again = w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'new-pass-1' })
    expect(again.token).toBe(r.token)
    expect(login(w, 'me@example.com', 'hunter22').error).toBe('Wrong email or password')
    expect(login(w, 'me@example.com', 'new-pass-1').token).toBe(r.token)
  })

  it("won't take another account's email", () => {
    const w = world()
    register(w, 'ann@example.com')
    expect(w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'ann@example.com', password: 'hunter22' }).error).toMatch(/already exists/)
  })
})

describe('the issue routes', () => {
  // Past the owner check the next thing asked for is the GitHub token, which
  // this world has none of: that error is the check having let the request by.
  const PAST = /GITHUB_ISSUE_TOKEN/
  const report = (w, secret) => w.post({ route: 'report_issue' }, { secret, title: 'a bug' }).error

  it("take the owner's account key as well as the secret", () => {
    const w = world()
    const owner = w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'hunter22' })
    for (const proof of [SECRET, owner.token]) {
      expect(report(w, proof)).toMatch(PAST)
      expect(w.get({ route: 'issues', secret: proof }).error).toMatch(PAST)
      expect(w.get({ route: 'issue_thread', secret: proof, number: '1' }).error).toMatch(PAST)
      expect(w.post({ route: 'answer_issue' }, { secret: proof, number: 1, answer: 'yes' }).error).toMatch(PAST)
    }
  })

  it("refuse anyone else's key, a wrong secret and none at all", () => {
    const w = world()
    w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'hunter22' })
    const ann = register(w, 'ann@example.com')
    for (const proof of [ann.token, 'x', '', undefined]) {
      expect(report(w, proof)).toBe('Bad chat secret')
      expect(w.get({ route: 'issues', secret: proof }).error).toBe('Bad chat secret')
      expect(w.get({ route: 'issue_thread', secret: proof, number: '1' }).error).toBe('Bad chat secret')
      expect(w.post({ route: 'answer_issue' }, { secret: proof, number: 1, answer: 'yes' }).error).toBe('Bad chat secret')
    }
  })

  it('leave claim_owner and invite to the secret alone', () => {
    const w = world()
    const owner = w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'hunter22' })
    expect(w.post({ route: 'claim_owner' }, { secret: owner.token, email: 'me@example.com', password: 'new-pass-1' }).error).toBe('Bad chat secret')
    expect(w.post({ route: 'invite' }, { secret: owner.token }).error).toBe('Bad chat secret')
  })
})

describe('set_login', () => {
  it('gives an invite-made account an email and password', () => {
    const w = world()
    const { code } = w.post({ route: 'invite' }, { secret: SECRET })
    const { token } = w.post({ route: 'join' }, { invite: code, name: 'Cy' })
    expect(w.post({ route: 'set_login', user: token }, { email: 'cy@example.com', password: 'hunter22' })).toEqual({ saved: 1 })
    expect(login(w, 'cy@example.com', 'hunter22').token).toBe(token)
  })

  it('needs a signed-in account and a free email', () => {
    const w = world()
    const ann = register(w, 'ann@example.com').token
    const bob = register(w, 'bob@example.com', 'hunter22', 'Bob').token
    expect(w.post({ route: 'set_login', user: bob }, { email: 'ann@example.com', password: 'hunter22' }).error).toMatch(/already exists/)
    expect(w.post({ route: 'set_login', user: 'nope' }, { email: 'x@y.co', password: 'hunter22' }).error).toBe('Unknown account')
    expect(ann).toBeTruthy()
  })
})

describe('people', () => {
  it('lists every account for the owner, with when each was last seen, and nothing secret', () => {
    const w = world()
    const owner = w.post({ route: 'claim_owner' }, { secret: SECRET, email: 'me@example.com', password: 'hunter22' }).token
    const ann = register(w, 'ann@example.com').token
    w.get({ route: 'workouts', user: ann })
    const people = w.get({ route: 'people', user: owner })
    expect(people).toHaveLength(2)
    expect(people.find((p) => p.email === 'ann@example.com')).toMatchObject({ name: 'Ann', owner: false })
    expect(people.every((p) => p.lastSeen)).toBe(true)
    expect(JSON.stringify(people)).not.toContain(ann)
  })

  it('is the owner\'s alone', () => {
    const w = world()
    const ann = register(w, 'ann@example.com').token
    expect(w.get({ route: 'people', user: ann }).error).toBe('Owner only')
  })
})
