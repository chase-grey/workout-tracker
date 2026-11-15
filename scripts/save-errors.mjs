#!/usr/bin/env node
/**
 * Read the phones' failed-save reports off the backend.
 *
 *   npm run save-errors            # newest 20, payloads summarised
 *   npm run save-errors -- 50      # newest 50
 *   npm run save-errors -- --json  # everything, payloads whole
 *
 * The app reports a write its outbox couldn't deliver to the save_errors tab
 * (see SimpleBackend.gs appendSaveError). This is the reading end, so a "couldn't
 * save" on the phone can be diagnosed from here. It also says whether the backend
 * answers at all, which covers the one failure a phone can't report.
 *
 * The backend takes no request without a key once the owner has signed in, and
 * save_errors is the owner's alone, so this goes as the owner: the issue token
 * in .env (CHAT_SHARED_SECRET), which the backend accepts as the owner's key.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  /* no .env: the key can still come from the environment */
}
const key = (process.env.CHAT_SHARED_SECRET || '').trim()
if (!key) {
  console.error('No owner key: set CHAT_SHARED_SECRET in .env (the issue token from Settings).')
  process.exit(1)
}
const config = readFileSync(path.join(root, 'src', 'config', 'backend.ts'), 'utf8')
const url = process.env.API_URL || (config.match(/'(https:[^']+\/exec)'/) || [])[1]
if (!url) {
  console.error('No backend URL: set API_URL or check src/config/backend.ts')
  process.exit(1)
}

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const limit = Number(args.find((a) => /^[0-9]+$/.test(a))) || 20

async function get(route, params = {}) {
  const u = new URL(url)
  u.searchParams.set('route', route)
  u.searchParams.set('user', key)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
  return res.json()
}

let probe
try {
  probe = await get('settings')
} catch (e) {
  console.error(`Backend did not answer: ${e.message}`)
  process.exit(2)
}
if (probe && typeof probe.error === 'string') {
  console.error(`Backend refused the owner key (${probe.error}). Check CHAT_SHARED_SECRET in .env against the script's.`)
  process.exit(4)
}

const reports = await get('save_errors', { limit: String(limit) })
if (reports && reports.error) {
  console.error(`Backend answers but has no save_errors route (${reports.error}). Redeploy SimpleBackend.gs.`)
  process.exit(3)
}
if (asJson) {
  console.log(JSON.stringify(reports, null, 2))
} else if (reports.length === 0) {
  console.log('Backend answers. No failed saves reported.')
} else {
  for (const r of reports) {
    const p = r.payload && typeof r.payload === 'object' ? r.payload : null
    const size = p && Array.isArray(p.rows) ? ` (${p.rows.length} rows)` : ''
    const who = r.user && String(r.user).trim() ? `  user ${r.user}` : ''
    console.log(`${r.at}  build ${r.build}  ${r.route}${size}  write ${r.writeId}  ${r.pending} queued${who}`)
    console.log(`  ${r.message}`)
  }
  console.log('\nPayloads: npm run save-errors -- --json')
}
