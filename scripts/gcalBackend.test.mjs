import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

/**
 * The backend with Google, the property store and the cache replaced by
 * in-memory stand-ins. `google(req)` answers every outbound request.
 */
function backend({ props = {}, google }) {
  const cache = new Map()
  const calls = []
  const answer = (req) => {
    calls.push(req)
    const out = google(req) ?? { code: 200, body: {} }
    return { getResponseCode: () => out.code ?? 200, getContentText: () => JSON.stringify(out.body ?? {}) }
  }
  const ctx = runInNewContext(
    readFileSync('SimpleBackend.gs', 'utf8') +
      '\nresolveAccount = (t) => ({ id: t, prefix: "u" + t + "_", name: "sam", owner: false, email: "" });' +
      '({ doGet, doPost });',
    {
      SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
      ContentService: {
        createTextOutput: (text) => ({ text, setMimeType() { return this } }),
        MimeType: { JSON: 'json' },
      },
      HtmlService: { createHtmlOutput: (html) => ({ html, setTitle() { return this } }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => props[k] ?? null,
          setProperty: (k, v) => { props[k] = v },
          deleteProperty: (k) => { delete props[k] },
        }),
      },
      CacheService: {
        getScriptCache: () => ({
          get: (k) => cache.get(k) ?? null,
          put: (k, v) => { cache.set(k, v) },
          remove: (k) => { cache.delete(k) },
        }),
      },
      ScriptApp: { getService: () => ({ getUrl: () => 'https://script.test/exec' }) },
      Utilities: { getUuid: () => 'aaaa-bbbb' },
      UrlFetchApp: {
        fetch: (url, opts) => answer({ url, ...opts }),
        fetchAll: (reqs) => reqs.map(answer),
      },
    },
  )
  const post = (route, body = {}, user = 'u1') =>
    JSON.parse(ctx.doPost({ parameter: { route, user }, postData: { contents: JSON.stringify(body) } }).text)
  return { ...ctx, post, props, calls }
}

const CLIENT = { GCAL_CLIENT_ID: 'cid', GCAL_CLIENT_SECRET: 'shh' }
const linked = (over = {}) => ({
  ...CLIENT,
  gcal_u1: JSON.stringify({ refresh: 'r1', calendarId: 'cal1', base: ['s:2026-11-19'], ...over }),
})
const tokenOk = (req) => (req.url.includes('oauth2.googleapis.com/token') ? { body: { access_token: 'at', expires_in: 3600 } } : null)

it('is unavailable until the backend is given a Google client', () => {
  expect(backend({ google: () => null }).post('gcal_status')).toEqual({ saved: 1, available: false, connected: false })
  expect(backend({ props: { ...CLIENT }, google: () => null }).post('gcal_status')).toMatchObject({
    available: true,
    connected: false,
  })
  expect(backend({ props: linked(), google: () => null }).post('gcal_status')).toMatchObject({ connected: true })
})

it('hands out a consent link, and keeps the refresh token Google sends the person back with', () => {
  const b = backend({
    props: { ...CLIENT },
    google: (req) => (req.url.includes('/token') ? { body: { refresh_token: 'r9', access_token: 'at' } } : null),
  })
  const { url } = b.post('gcal_connect', { returnUrl: 'https://app.test/' })
  const q = new URL(url).searchParams
  expect(q.get('scope')).toBe('https://www.googleapis.com/auth/calendar.app.created')
  expect(q.get('redirect_uri')).toBe('https://script.test/exec')
  expect(q.get('access_type')).toBe('offline')

  const page = b.doGet({ parameter: { state: q.get('state'), code: 'c0de' } })
  expect(page.html).toContain('connected')
  expect(page.html).toContain('href="https://app.test/"')
  expect(JSON.parse(b.props.gcal_u1)).toEqual({ refresh: 'r9', calendarId: '', base: [] })
  expect(b.calls[0].payload).toMatchObject({ code: 'c0de', client_secret: 'shh', grant_type: 'authorization_code' })

  // The ticket is spent: the same link can't bind a second code.
  expect(b.doGet({ parameter: { state: q.get('state'), code: 'again' } }).html).toContain('expired')
})

it('refuses a callback it did not hand out, and a return address that is not a plain https one', () => {
  const b = backend({ props: { ...CLIENT }, google: () => null })
  expect(b.doGet({ parameter: { state: 'made-up', code: 'x' } }).html).toContain('expired')
  expect(b.props.gcal_u1).toBeUndefined()
  const { url } = b.post('gcal_connect', { returnUrl: 'javascript:alert(1)' })
  const page = b.doGet({ parameter: { state: new URL(url).searchParams.get('state') } })
  expect(page.html).not.toContain('href=')
})

it('reads back only the events that carry its mark, with the set last agreed', () => {
  const b = backend({
    props: linked(),
    google: (req) =>
      tokenOk(req) ?? {
        body: {
          items: [
            { id: 'e1', summary: 'push', start: { date: '2026-11-19' }, extendedProperties: { private: { wt: 'strength' } } },
            { id: 'e2', summary: 'run', start: { dateTime: '2026-11-21T07:00:00-06:00' }, extendedProperties: { private: { wt: 'cardio' } } },
            { id: 'e3', summary: 'dentist', start: { date: '2026-11-20' } },
          ],
        },
      },
  })
  expect(b.post('gcal_state', { from: '2026-11-18', to: '2027-01-10' })).toEqual({
    saved: 1,
    connected: true,
    events: [
      { id: 'e1', pillar: 'strength', date: '2026-11-19', title: 'push' },
      { id: 'e2', pillar: 'cardio', date: '2026-11-21', title: 'run' },
    ],
    base: ['s:2026-11-19'],
  })
  const list = b.calls.at(-1)
  expect(list.url).toContain('/calendars/cal1/events?')
  expect(list.headers.Authorization).toBe('Bearer at')
})

it('makes the calendar on the first read, and again with nothing agreed if it was deleted', () => {
  let lists = 0
  const b = backend({
    props: linked(),
    google: (req) => {
      if (tokenOk(req)) return tokenOk(req)
      if (req.method === 'post' && req.url.endsWith('/calendars')) return { body: { id: 'cal2' } }
      return ++lists === 1 ? { code: 404 } : { body: { items: [] } }
    },
  })
  expect(b.post('gcal_state', { from: '2026-11-18', to: '2027-01-10' })).toMatchObject({ events: [], base: [] })
  expect(JSON.parse(b.props.gcal_u1)).toMatchObject({ calendarId: 'cal2', base: [] })
})

it('applies the app’s changes and remembers the new agreement', () => {
  const b = backend({ props: linked(), google: (req) => tokenOk(req) ?? { body: { id: 'new' } } })
  const out = b.post('gcal_apply', {
    create: [{ pillar: 'cardio', date: '2026-11-30', title: 'easy run' }],
    update: [{ id: 'e1', title: 'pull' }],
    remove: ['e2'],
    base: ['s:2026-11-19', 'c:2026-11-30'],
  })
  expect(out).toEqual({ saved: 1, connected: true, failed: 0 })
  const [made, patched, deleted] = b.calls.slice(-3)
  expect(made.method).toBe('post')
  expect(JSON.parse(made.payload)).toMatchObject({
    summary: 'easy run',
    start: { date: '2026-11-30' },
    end: { date: '2026-12-01' },
    extendedProperties: { private: { wt: 'cardio' } },
  })
  expect(patched.url).toContain('/events/e1')
  expect(deleted.method).toBe('delete')
  expect(JSON.parse(b.props.gcal_u1).base).toEqual(['s:2026-11-19', 'c:2026-11-30'])
})

it('keeps the old agreement when Google refuses a change', () => {
  const b = backend({
    props: linked(),
    google: (req) => tokenOk(req) ?? (req.method === 'post' ? { code: 500 } : { code: 410 }),
  })
  const out = b.post('gcal_apply', {
    create: [{ pillar: 'cardio', date: '2026-11-30', title: 'run' }],
    remove: ['already-gone'],
    base: ['c:2026-11-30'],
  })
  // The delete of something already gone is fine; the failed create is not.
  expect(out.failed).toBe(1)
  expect(JSON.parse(b.props.gcal_u1).base).toEqual(['s:2026-11-19'])
})

it('says so, and forgets the link, when access was withdrawn in Google', () => {
  const b = backend({ props: linked(), google: () => ({ code: 400, body: { error: 'invalid_grant' } }) })
  expect(b.post('gcal_state', { from: '2026-11-18', to: '2027-01-10' })).toMatchObject({ connected: false })
  expect(b.props.gcal_u1).toBeUndefined()
})

it('keeps one account’s link away from another’s', () => {
  const b = backend({ props: linked(), google: (req) => tokenOk(req) ?? { body: { items: [] } } })
  expect(b.post('gcal_status', {}, 'u2')).toMatchObject({ connected: false })
  expect(b.post('gcal_state', { from: '2026-11-18', to: '2027-01-10' }, 'u2')).toMatchObject({ connected: false })
})

it('disconnecting removes the calendar it made, hands the access back and forgets the link', () => {
  const b = backend({ props: linked(), google: (req) => tokenOk(req) })
  expect(b.post('gcal_disconnect')).toEqual({ saved: 1 })
  expect(b.calls.some((c) => c.method === 'delete' && c.url.endsWith('/calendars/cal1'))).toBe(true)
  expect(b.calls.some((c) => c.url.includes('/revoke?token=r1'))).toBe(true)
  expect(b.props.gcal_u1).toBeUndefined()
})
