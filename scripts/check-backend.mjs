#!/usr/bin/env node
/**
 * Is the deployed backend at least the version this checkout needs?
 *
 *   node scripts/check-backend.mjs          # exit 0 current, 1 behind, 2 unreachable
 *
 * The Pages workflow runs this after every frontend deploy, so a commit that
 * bumps SimpleBackend.gs turns the run red until the backend is redeployed too.
 * A red run is a notification that already reaches someone; a queued write on a
 * phone is not (2026-10-29). The URL comes from API_URL, else the one baked
 * into src/config/backend.ts; the version from src/config/backendVersion.ts.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')

const url = process.env.API_URL || (read('src/config/backend.ts').match(/'(https:[^']+\/exec)'/) || [])[1]
if (!url) {
  console.error('No backend URL: set API_URL or check src/config/backend.ts')
  process.exit(2)
}
const required = Number((read('src/config/backendVersion.ts').match(/REQUIRED_BACKEND_VERSION = (\d+)/) || [])[1])
if (!Number.isFinite(required)) {
  console.error('src/config/backendVersion.ts has no REQUIRED_BACKEND_VERSION. Run: npm run backend:stamp')
  process.exit(2)
}

let live
try {
  const u = new URL(url)
  u.searchParams.set('route', 'version')
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  // An older backend answers {error: 'Unknown route'}: version 0.
  live = typeof body?.version === 'number' ? body.version : 0
} catch (e) {
  console.error(`Backend did not answer: ${e.message}`)
  process.exit(2)
}

if (live < required) {
  console.error(`Deployed backend is version ${live}; this build needs ${required}. Redeploy it: npm run deploy:backend`)
  process.exit(1)
}
console.log(`Deployed backend is version ${live}; this build needs ${required}. Current.`)
