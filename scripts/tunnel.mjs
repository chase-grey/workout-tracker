/**
 * `npm run dev:tunnel` — the dev server plus a Cloudflare quick tunnel in front
 * of it, so the phone can reach it from anywhere (cell data, home wifi, a gym).
 *
 * Why this exists: the chat coach needs the /api/chat proxy in vite.config.ts,
 * which holds the Epic key and can reach llmproxy.epic.com. That proxy only runs
 * in the dev server, and the Epic LLM endpoint is internal-network-only — so the
 * deployed GitHub Pages build can't have it. Tunnelling the dev server keeps the
 * network hop on this machine: phone → Cloudflare → this dev server → Epic proxy.
 * Only this computer needs to be on Epic wifi/VPN.
 *
 * Both children die with this process, so Ctrl+C tears the whole thing down.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const PORT = Number(process.env.PORT || 5173)

// cloudflared usually isn't on PATH on Windows — it's often just an .exe dropped
// in the home directory. Try the obvious places before giving up.
function resolveCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    path.join(process.env.USERPROFILE || process.env.HOME || '', 'cloudflared.exe'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', 'cloudflared'),
  ].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  return 'cloudflared' // fall back to PATH; spawn reports ENOENT if it isn't there
}

const children = []
function run(command, args, opts = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, ...opts })
  children.push(child)
  return child
}

function shutdown() {
  for (const c of children) {
    if (c.exitCode !== null || c.signalCode !== null) continue
    // Windows doesn't propagate a kill down the process tree, and killing the
    // node shim doesn't stop the vite server it started — so a plain c.kill()
    // leaves an orphan holding the port. taskkill /T takes the whole subtree.
    if (process.platform === 'win32') {
      try {
        spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' })
        continue
      } catch {
        /* fall through to the portable kill */
      }
    }
    c.kill()
  }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(sig, () => {
    shutdown()
    process.exit(0)
  })
}
process.on('exit', shutdown)

// --- the dev server -------------------------------------------------------
// Run Vite's JS entry under this Node rather than the `vite` shim: Node on
// Windows refuses to spawn .cmd wrappers without a shell, and this skips the
// shell (and the npx resolution step) entirely. Located via package.json rather
// than resolved directly — vite doesn't list bin/ in its "exports".
const viteBin = path.join(
  path.dirname(createRequire(import.meta.url).resolve('vite/package.json')),
  'bin',
  'vite.js',
)
const vite = run(process.execPath, [viteBin, '--host', '--port', String(PORT), '--strictPort'])
vite.stdout.on('data', (d) => process.stdout.write(d))
// --strictPort on purpose: a bumped port would leave the tunnel pointed at
// whatever is on 5173, which is a confusing way to fail. Name the real problem.
let portTaken = false
vite.stderr.on('data', (d) => {
  process.stderr.write(d)
  if (/already in use/i.test(String(d))) portTaken = true
})
vite.on('exit', (code) => {
  if (portTaken) {
    console.error(
      `\n  Something is already serving port ${PORT} — often a dev server from an earlier` +
        `\n  run that outlived its terminal. Stop it, or run with PORT=<other> set.\n`,
    )
  }
  shutdown()
  process.exit(code ?? 0)
})

// --- the tunnel -----------------------------------------------------------
const bin = resolveCloudflared()
const cf = run(bin, ['tunnel', '--url', `http://localhost:${PORT}`])
cf.on('error', (err) => {
  console.error(
    `\n  cloudflared failed to start (${err.code ?? err.message}).` +
      `\n  Install it, or set CLOUDFLARED_PATH to the executable.` +
      `\n  The dev server is still running on http://localhost:${PORT}\n`,
  )
})

// cloudflared prints the assigned hostname to stderr inside a banner. Pull it out
// and restate it plainly — it's the one line that matters here.
let announced = false
const watchForUrl = (chunk) => {
  const text = String(chunk)
  process.stderr.write(text)
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
  if (match && !announced) {
    announced = true
    console.log(
      `\n  Phone URL: ${match[0]}` +
        `\n  Also in the app under Settings → "open on your phone" (with a QR).\n`,
    )
  }
}
cf.stdout.on('data', watchForUrl)
cf.stderr.on('data', watchForUrl)
