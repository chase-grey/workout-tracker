#!/usr/bin/env node
/**
 * Push and deploy the Google Apps Script backend via clasp.
 *
 * Prereqs (one-time):
 *   npm install -g @google/clasp
 *   clasp login
 *   Create a Google Sheet, open Extensions > Apps Script, and either:
 *     - copy the scriptId from the script's URL into .clasp.json, or
 *     - run this script and let `clasp create` make a standalone project,
 *       then bind it to your sheet (Project settings > container).
 *
 * NOTE: never run `clasp deploy --deploymentId <id>` on an existing
 * deployment — it converts the deployment into a library. Create a fresh
 * deployment (as below) or redeploy from the Apps Script UI instead.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const claspConfig = path.join(__dirname, '.clasp.json')

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

function ensureClasp() {
  try {
    execSync('clasp --version', { stdio: 'ignore' })
  } catch {
    console.error('clasp is not installed. Run: npm install -g @google/clasp')
    process.exit(1)
  }
}

function ensureProject() {
  if (fs.existsSync(claspConfig)) {
    const { scriptId } = JSON.parse(fs.readFileSync(claspConfig, 'utf8'))
    console.log(`Using existing Apps Script project: ${scriptId}`)
    return
  }
  console.log('No .clasp.json found — creating a new Apps Script project…')
  run('clasp create --title "Workout Tracker Backend" --type webapp --rootDir .')
}

function main() {
  ensureClasp()
  ensureProject()
  console.log('Pushing code…')
  run('clasp push -f')
  console.log('Creating a new web app deployment…')
  const out = execSync('clasp deploy --description "Workout Tracker backend"', { encoding: 'utf8' })
  process.stdout.write(out)
  const url = out.match(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/)
  if (url) {
    fs.writeFileSync(path.join(__dirname, '.env'), `VITE_API_URL="${url[0]}"\n`)
    console.log(`\nWrote .env with VITE_API_URL=${url[0]}`)
  } else {
    console.log('\nDeployed. Grab the /exec URL from the Apps Script UI and put it in .env or Settings.')
  }
}

main()
