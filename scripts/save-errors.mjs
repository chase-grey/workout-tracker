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
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
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
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
  return res.json()
}

try {
  await get('settings')
} catch (e) {
  console.error(`Backend did not answer: ${e.message}`)
  process.exit(2)
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
    console.log(`${r.at}  build ${r.build}  ${r.route}${size}  write ${r.writeId}  ${r.pending} queued`)
    console.log(`  ${r.message}`)
  }
  console.log('\nPayloads: npm run save-errors -- --json')
}
