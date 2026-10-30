#!/usr/bin/env node
/**
 * Deploy SimpleBackend.gs to the Apps Script web app the phone already talks to.
 *
 *   npm run deploy:backend                       # push, version, redeploy, verify
 *   npm run deploy:backend -- --script-id <id>   # first run: record the script id
 *   npm run deploy:backend -- --deployment <id>  # a deployment other than the baked URL's
 *
 * One-time setup, on the Google account that owns the sheet (not necessarily
 * the one clasp is signed into for anything else — clasp keeps named logins):
 *
 *   npm install -g @google/clasp
 *   clasp login --user workout
 *   echo CLASP_USER=workout >> .env
 *   npm run deploy:backend -- --script-id <Apps Script editor → Project settings → Script ID>
 *
 * What a run does, in order, and why each step is there:
 *   1. `npm run backend:stamp -- --check`: refuses to deploy a backend whose
 *      BACKEND_VERSION wasn't bumped, because the app's banner and the Pages
 *      workflow compare that number and a stale one would say "current" of a
 *      backend that isn't.
 *   2. `clasp push -f`: uploads SimpleBackend.gs and appsscript.json (and only
 *      those — see .claspignore) to the script's head.
 *   3. `clasp version`: freezes the head as an immutable version.
 *   4. `clasp redeploy <deploymentId> -V <n>`: points the EXISTING deployment at
 *      that version. This is the editor's "Manage deployments → New version",
 *      so the /exec URL baked into the app and stored on the phone stays the
 *      same. The deployment id is the `/s/<id>/exec` segment of that URL.
 *   5. Asks the live URL for ?route=version and compares it with what was just
 *      pushed. A deployment that answers anything else is reported, with the
 *      editor steps to put it right, rather than trusted.
 *
 * Never `clasp deploy` (create-deployment) for a routine update: that makes a
 * second web app at a new URL and the phone keeps talking to the old one.
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))
const claspConfig = path.join(root, '.clasp.json')
const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}

function readEnv(key) {
  if (process.env[key]) return process.env[key]
  try {
    const line = fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
      .find((l) => l.trim().startsWith(`${key}=`))
    return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^"(.*)"$/, '$1') : undefined
  } catch {
    return undefined
  }
}

const user = readEnv('CLASP_USER') || 'default'
const clasp = (cmdArgs) =>
  execFileSync('clasp', ['--user', user, ...cmdArgs], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' })

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

function ensureClasp() {
  try {
    execFileSync('clasp', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' })
  } catch {
    fail('clasp is not installed. Run: npm install -g @google/clasp')
  }
}

function ensureProject() {
  const scriptId = flag('--script-id')
  if (scriptId) {
    fs.writeFileSync(claspConfig, JSON.stringify({ scriptId, rootDir: '.' }, null, 2) + '\n')
    console.log(`Recorded script id in .clasp.json (gitignored).`)
  }
  if (!fs.existsSync(claspConfig)) {
    fail('No .clasp.json. Run once with --script-id <id> (Apps Script editor → Project settings → Script ID).')
  }
}

function bakedUrl() {
  const src = fs.readFileSync(path.join(root, 'src', 'config', 'backend.ts'), 'utf8')
  return (src.match(/'(https:[^']+\/exec)'/) || [])[1]
}

function deploymentIdOf(url) {
  return (url.match(/\/macros\/s\/([\w-]+)\/exec/) || [])[1]
}

function requiredVersion() {
  const src = fs.readFileSync(path.join(root, 'src', 'config', 'backendVersion.ts'), 'utf8')
  return Number((src.match(/REQUIRED_BACKEND_VERSION = (\d+)/) || [])[1])
}

async function liveVersion(url) {
  const u = new URL(url)
  u.searchParams.set('route', 'version')
  const res = await fetch(u, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  return typeof body?.version === 'number' ? body.version : 0
}

async function main() {
  ensureClasp()
  ensureProject()
  const url = readEnv('VITE_API_URL') || bakedUrl()
  const deploymentId = flag('--deployment') || deploymentIdOf(url || '')
  if (!deploymentId) fail('No deployment id: pass --deployment <id>, or bake the /exec URL into src/config/backend.ts')
  const version = requiredVersion()

  console.log('Checking the version stamp…')
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts', 'backend-stamp.mjs'), '--check'], { stdio: 'inherit' })
  } catch {
    fail('Stamp first: npm run backend:stamp')
  }

  console.log(`Pushing SimpleBackend.gs as ${user}…`)
  clasp(['push', '-f'])

  console.log('Creating a version…')
  // --json: clasp's plain output is a spinner line that doesn't survive a pipe.
  const out = clasp(['version', '--json', `workout-tracker-backend-v${version}`])
  const created = out.match(/"versionNumber":\s*(\d+)/)
  if (!created) fail(`Could not read the new version number from clasp:\n${out}`)
  const scriptVersion = created[1]
  console.log(`Script version ${scriptVersion}.`)

  console.log(`Pointing deployment ${deploymentId.slice(0, 12)}… at it…`)
  clasp(['redeploy', deploymentId, '-V', scriptVersion, '-d', `workout-tracker-backend-v${version}`])

  console.log('Asking the live URL what it is now…')
  let live
  try {
    live = await liveVersion(url)
  } catch (e) {
    fail(`The deployment no longer answers (${e.message}). In the Apps Script editor: Deploy → Manage deployments → edit → Version ${scriptVersion} → Deploy, and check it is still a Web app.`)
  }
  if (live !== version) {
    fail(`Live backend answers version ${live}, expected ${version}. In the Apps Script editor: Deploy → Manage deployments → edit → Version ${scriptVersion} → Deploy.`)
  }
  console.log(`Deployed. Live backend is version ${live}.`)
}

main()
