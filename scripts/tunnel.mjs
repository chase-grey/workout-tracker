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
import net from 'node:net'
import { createRequire } from 'node:module'
import path from 'node:path'

/**
 * The dev server port, and the port the tunnel is aimed at.
 *
 * Deliberately not `PORT`: that name is ambient on a dev box. Epic's Session
 * Runner sets PORT=3991 for everything it launches and serves its own app on
 * 127.0.0.1:3991, so inheriting it aimed the tunnel at that app rather than this
 * dev server, and nothing complained — see loopbackPortTaken for why --strictPort
 * sails past it. The phone was then handed a coach address that answered every
 * request with a 404.
 */
const PORT = Number(process.env.WT_PORT || 5173)

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

/**
 * Kill this project's leftovers from a previous run before starting.
 *
 * The shutdown handler below covers Ctrl+C, but nothing runs when the parent is
 * killed outright — closing the terminal, or a tool that SIGKILLs the wrapper.
 * Then the dev server keeps port 5173 and the next run dies on "already in use",
 * with a stale public tunnel still pointed at it. Since a hard kill can't be
 * intercepted, reclaim on the way in instead.
 *
 * Matching is deliberately narrow: only a vite serving THIS checkout on THIS
 * port, and only a cloudflared tunnelling that same port. Other projects' dev
 * servers and tunnels — often several here — must not be touched.
 */
function reclaimStaleProcesses() {
  if (process.platform !== 'win32') return // POSIX kills the tree with the parent
  const root = process.cwd().toLowerCase()
  const script = `
    Get-CimInstance Win32_Process |
      Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine } |
      Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`
  let procs
  try {
    const out = spawnSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    }).stdout
    procs = JSON.parse(out || '[]')
  } catch {
    return // can't enumerate; the port check below will report the conflict
  }
  if (!Array.isArray(procs)) procs = [procs]

  const stale = procs.filter((p) => {
    const cmd = String(p?.CommandLine || '').toLowerCase()
    const ourVite =
      cmd.includes(path.join(root, 'node_modules', 'vite', 'bin', 'vite.js').toLowerCase()) &&
      cmd.includes(`--port ${PORT}`)
    const ourTunnel =
      cmd.includes('cloudflared') &&
      (cmd.includes(`--url http://127.0.0.1:${PORT}`) ||
        cmd.includes(`--url http://localhost:${PORT}`))
    return ourVite || ourTunnel
  })

  for (const p of stale) {
    console.log(`  Reclaiming a leftover process from an earlier run (pid ${p.ProcessId}).`)
    spawnSync('taskkill', ['/pid', String(p.ProcessId), '/T', '/F'], { stdio: 'ignore' })
  }
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

reclaimStaleProcesses()

/**
 * Is something already answering on the loopback address the tunnel will dial?
 *
 * `--strictPort` cannot see this one. A server bound to the specific address
 * 127.0.0.1 and a Vite bound to the wildcard 0.0.0.0 sit on the same port without
 * either failing to start, and a loopback connection goes to the specific one. So
 * the dev server comes up clean, the tunnel comes up clean, and every request
 * through the tunnel lands on the other server. Check the address the tunnel will
 * actually dial, not the one Vite reports.
 */
function loopbackPortTaken(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const settle = (taken) => {
      socket.destroy()
      resolve(taken)
    }
    socket.setTimeout(1500)
    socket.once('connect', () => settle(true))
    socket.once('timeout', () => settle(false))
    socket.once('error', () => settle(false))
  })
}

// A process reclaimed a moment ago can hold its socket a little longer, so wait
// out our own leftovers rather than refusing to start over them.
let portFree = false
for (let i = 0; i < 5 && !portFree; i++) {
  if (i) await new Promise((resolve) => setTimeout(resolve, 400))
  portFree = !(await loopbackPortTaken(PORT))
}
if (!portFree) {
  console.error(
    `\n  Something else is already serving http://127.0.0.1:${PORT}. The tunnel would` +
      `\n  reach that instead of this dev server, and the phone would be handed an` +
      `\n  address that isn't the coach. Stop it, or run with WT_PORT=<other> set.\n`,
  )
  process.exit(1)
}

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
        `\n  run that outlived its terminal. Stop it, or run with WT_PORT=<other> set.\n`,
    )
  }
  shutdown()
  process.exit(code ?? 0)
})

// --- the tunnel -----------------------------------------------------------
const bin = resolveCloudflared()
// 127.0.0.1 rather than localhost: this is the address checked for a squatter
// above, and `localhost` can also resolve to ::1, where nothing is listening.
const cf = run(bin, ['tunnel', '--url', `http://127.0.0.1:${PORT}`])
cf.on('error', (err) => {
  console.error(
    `\n  cloudflared failed to start (${err.code ?? err.message}).` +
      `\n  Install it, or set CLOUDFLARED_PATH to the executable.` +
      `\n  The dev server is still running on http://localhost:${PORT}\n`,
  )
})

// --- the auto-fixer (opt-in) ---------------------------------------------
// AUTOFIX=1 rides the fixer along with the tunnel: the laptop is already awake
// serving the phone coach, so it's a natural time to drain `auto-fix` issues.
// Off by default so the coach tunnel can run without it.
if (process.env.AUTOFIX === '1') {
  const autofix = run(process.execPath, [path.join(process.cwd(), 'scripts', 'autofix.mjs')])
  autofix.stdout.on('data', (d) => process.stdout.write(d))
  autofix.stderr.on('data', (d) => process.stderr.write(d))
}

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
