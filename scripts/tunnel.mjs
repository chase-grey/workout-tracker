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
 * One command brings up everything the phone needs: the dev server, the public
 * tunnel in front of it, and the auto-fixer that drains `auto-fix` issues. All
 * three die with this process, so Ctrl+C tears the whole thing down — and while
 * it lives, the two that can fail quietly are supervised (see supervise).
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

/**
 * Every long-lived child this script owns, keyed by the name we call it by.
 *
 * A Map rather than a list because a supervised child replaces its own entry when
 * it restarts instead of adding a second one — a tunnel that has flapped all
 * morning should still leave exactly one process for shutdown to take down, not
 * a pile of corpses to step over.
 */
const children = new Map()
// Set once we're tearing down, so a child dying on the way out isn't mistaken
// for a crash worth restarting.
let stopping = false

function run(name, command, args, opts = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, ...opts })
  children.set(name, child)
  return child
}

function shutdown() {
  stopping = true
  for (const c of children.values()) {
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

/**
 * Keep a child running for as long as this script runs, and say so out loud when
 * it stops.
 *
 * cloudflared and the fixer were both started once and then trusted, and neither
 * announces its own death. When cloudflared exits, the coach goes unreachable from
 * the phone; when the fixer exits, the `auto-fix` queue stops draining. In both
 * cases vite keeps printing, this terminal keeps looking healthy, and the
 * launcher's chip stays lit — which is how a fixer that stopped on a Friday
 * afternoon left every reported issue untouched until somebody happened to open
 * the tracker four days later and ask whether it still worked.
 *
 * So restart, and narrate. A child that dies instantly every time is misconfigured
 * rather than unlucky, and restarting it forever would scroll the one message that
 * explains why off the screen — so the delays grow, and then it stops and names
 * what is no longer running.
 *
 * `start` is handed the name to spawn under and a `hopeless` callback for a
 * failure a restart cannot fix: a binary that isn't installed comes back to the
 * same ENOENT every time, and retrying it five times only buries the message
 * telling you to install it.
 */
const RESTART_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]
// Long enough that a child which got far enough to do its job doesn't spend the
// budget meant for one that can't start at all.
const SETTLED_MS = 10_000

function supervise(name, start, hint) {
  let attempt = 0
  const launch = () => {
    const startedAt = Date.now()
    let hopeless = false
    const child = start(name, () => {
      hopeless = true
    })
    child.on('exit', (code, signal) => {
      if (stopping || hopeless) return
      if (Date.now() - startedAt >= SETTLED_MS) attempt = 0
      const how = signal ? `signal ${signal}` : `code ${code}`
      const delay = RESTART_DELAYS_MS[attempt++]
      if (delay === undefined) {
        console.error(
          `\n  ${name} exited (${how}) and would not stay up, so it is not running.` +
            (hint ? `\n  ${hint}` : '') +
            '\n',
        )
        return
      }
      console.error(`\n  ${name} exited (${how}) — restarting in ${delay / 1000}s.\n`)
      setTimeout(launch, delay)
    })
  }
  launch()
}

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
// Not supervised: the dev server is the thing being tunnelled, so there is nothing
// left to keep alive once it's gone. Its exit deliberately takes the run with it.
const vite = run('the dev server', process.execPath, [
  viteBin,
  '--host',
  '--port',
  String(PORT),
  '--strictPort',
])
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
// cloudflared prints the assigned hostname to stderr inside a banner. Pull it out
// and restate it plainly — it's the one line that matters here. `announced` resets
// on every start, because a quick tunnel is handed a NEW random hostname each time
// it comes up: after a restart the address printed above is not the live one, and
// staying quiet about the replacement would leave the old one as the last word.
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

const bin = resolveCloudflared()
supervise(
  'cloudflared',
  (name, hopeless) => {
    announced = false
    // 127.0.0.1 rather than localhost: this is the address checked for a squatter
    // above, and `localhost` can also resolve to ::1, where nothing is listening.
    const cf = run(name, bin, ['tunnel', '--url', `http://127.0.0.1:${PORT}`])
    cf.on('error', (err) => {
      hopeless()
      console.error(
        `\n  cloudflared failed to start (${err.code ?? err.message}).` +
          `\n  Install it, or set CLOUDFLARED_PATH to the executable.` +
          `\n  The dev server is still running on http://localhost:${PORT}\n`,
      )
    })
    cf.stdout.on('data', watchForUrl)
    cf.stderr.on('data', watchForUrl)
    return cf
  },
  'The coach is unreachable from the phone until it comes back.',
)

// --- the auto-fixer -------------------------------------------------------
/**
 * The fixer rides along with the tunnel by default, rather than waiting to be
 * asked for with AUTOFIX=1.
 *
 * Opt-in read well on paper — the laptop is already awake serving the coach, so
 * draining `auto-fix` issues is a natural passenger — but it meant the queue only
 * moved when the tunnel happened to be started the one right way. Start it from a
 * bash prompt, or from any shortcut whose command predates the flag, and the coach
 * came up perfectly while nothing at all watched the tracker. Reporting a bug from
 * the phone is one tap, so the queue fills whether or not the fixer is up, and
 * there is no version of this where you want the coach on and the fixer off by
 * accident. The default should be the pair.
 *
 * AUTOFIX=0 still turns it off, for a run that has no business committing to `main`.
 */
if (process.env.AUTOFIX === '0') {
  console.log('\n  AUTOFIX=0 — the fixer is off for this run; `auto-fix` issues will queue.\n')
} else {
  supervise(
    'the auto-fixer',
    (name) => {
      const autofix = run(name, process.execPath, [
        path.join(process.cwd(), 'scripts', 'autofix.mjs'),
      ])
      autofix.stdout.on('data', (d) => process.stdout.write(d))
      autofix.stderr.on('data', (d) => process.stderr.write(d))
      return autofix
    },
    'Its own message above says why. `auto-fix` issues will sit until it is back.',
  )
}
