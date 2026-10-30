import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import {
  BACKEND_FILE, CONFIG_FILE, fingerprintOf, readConfig, renderConfig, stampStatus, versionOf,
} from './backend-stamp.mjs'

const backend = readFileSync(BACKEND_FILE, 'utf8')
const config = readFileSync(CONFIG_FILE, 'utf8')

function doGet(route) {
  const api = runInNewContext(backend + '\n;({ doGet })', {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
    ContentService: {
      createTextOutput: (text) => ({ text, setMimeType() { return this } }),
      MimeType: { JSON: 'json' },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  })
  return JSON.parse(api.doGet({ parameter: { route } }).text)
}

// The guard this whole arrangement rests on: edit SimpleBackend.gs and this is
// what fails until the version moves, which is what the app's banner and the
// deploy workflow compare the live backend against.
it('SimpleBackend.gs is stamped: BACKEND_VERSION bumped and the fingerprint current', () => {
  const status = stampStatus(backend, config)
  expect(status.reason === undefined ? 'ok' : `${status.reason}. Run: npm run backend:stamp`).toBe('ok')
})

it('answers its stamped version at ?route=version', () => {
  expect(doGet('version')).toEqual({ version: readConfig(config).version })
  expect(versionOf(backend)).toBe(readConfig(config).version)
})

it('reads a CRLF checkout as the same backend', () => {
  const lf = backend.replace(/\r\n/g, '\n')
  expect(fingerprintOf(lf.replace(/\n/g, '\r\n'))).toBe(fingerprintOf(lf))
})

it('tells a moved number from a changed file', () => {
  const text = 'x\nconst BACKEND_VERSION = 3\ny\n'
  const shipped = renderConfig(3, fingerprintOf(text))
  expect(stampStatus(text, shipped).ok).toBe(true)
  expect(stampStatus(text + '// edit\n', shipped).reason).toMatch(/changed since version 3/)
  expect(stampStatus(text.replace('= 3', '= 4'), shipped).reason).toMatch(/says BACKEND_VERSION = 4 but the app ships 3/)
  expect(stampStatus(text, '').reason).toMatch(/ships 0/)
})
