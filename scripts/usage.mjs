#!/usr/bin/env node
/**
 * Read how often each feature is used off the backend's usage tab.
 *
 *   npm run usage                # every feature, most used first
 *   npm run usage -- settings    # only ids starting "settings."
 *   npm run usage -- --json
 *
 * The app tallies uses on the phone and folds them into the tab (see
 * services/usage.ts and SimpleBackend.gs foldUsage). Settings counts one per
 * visit in which a section was used, so `share` against `settings.visit` is
 * the fraction of visits that came for it — the order the page should follow.
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
const prefix = args.find((a) => !a.startsWith('--'))

const u = new URL(url)
u.searchParams.set('route', 'usage')
let rows
try {
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  rows = await res.json()
} catch (e) {
  console.error(`Backend did not answer: ${e.message}`)
  process.exit(2)
}
if (rows && rows.error) {
  console.error(`Backend answers but has no usage route (${rows.error}). Run npm run deploy:backend.`)
  process.exit(3)
}
if (prefix) rows = rows.filter((r) => r.feature.startsWith(`${prefix}.`))
if (asJson) {
  console.log(JSON.stringify(rows, null, 2))
} else if (rows.length === 0) {
  console.log('Backend answers. Nothing counted yet.')
} else {
  const visits = new Map(rows.filter((r) => r.feature.endsWith('.visit')).map((r) => [r.feature.split('.')[0], r.count]))
  const width = Math.max(...rows.map((r) => r.feature.length))
  for (const r of rows) {
    const v = visits.get(r.feature.split('.')[0])
    const share = v && !r.feature.endsWith('.visit') ? `  ${Math.round((100 * r.count) / v)}% of visits` : ''
    console.log(`${r.feature.padEnd(width)}  ${String(r.count).padStart(5)}${share}  last ${r.lastAt.slice(0, 10)}`)
  }
}
