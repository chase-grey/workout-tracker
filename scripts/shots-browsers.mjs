/**
 * The two browsers `npm run shots` can drive, behind one small interface, with
 * nothing installed: both are spoken to over a WebSocket Node already has.
 *
 *   chromium  the Edge or Chrome on this machine, headless, over the DevTools
 *             protocol;
 *   firefox   the Firefox on this machine, headless, over WebDriver BiDi. The
 *             phone runs Firefox for Android: the same engine, not the same
 *             browser, so this is the nearest a desk gets and still not the phone.
 *
 * A page here is: go to a URL, evaluate an expression, take a screenshot.
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PF = process.env.ProgramFiles || 'C:/Program Files'
const PF86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)'
const LOCAL = process.env.LOCALAPPDATA || ''

const CANDIDATES = {
  chromium: [
    process.env.SHOTS_CHROMIUM,
    path.join(PF86, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(PF, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(PF, 'Google/Chrome/Application/chrome.exe'),
    path.join(PF86, 'Google/Chrome/Application/chrome.exe'),
    path.join(LOCAL, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ],
  firefox: [
    process.env.SHOTS_FIREFOX,
    path.join(PF, 'Mozilla Firefox/firefox.exe'),
    path.join(PF86, 'Mozilla Firefox/firefox.exe'),
    path.join(LOCAL, 'Mozilla Firefox/firefox.exe'),
    '/Applications/Firefox.app/Contents/MacOS/firefox',
    '/usr/bin/firefox',
  ],
}

/** Where a browser lives on this machine, or null. */
export function findBrowser(kind) {
  return CANDIDATES[kind].find((p) => p && existsSync(p)) ?? null
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** A request/response channel over one WebSocket, plus whatever events arrive. */
async function channel(url, onEvent) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error(`could not connect to ${url}`))
  })
  let id = 0
  const waiting = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id != null && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg)
      waiting.delete(msg.id)
    } else onEvent?.(msg)
  }
  const send = (method, params = {}, timeoutMs = 60_000) =>
    new Promise((resolve, reject) => {
      const n = ++id
      const timer = setTimeout(() => {
        waiting.delete(n)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      waiting.set(n, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  return { send, close: () => ws.close() }
}

async function until(fn, what, tries = 80) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn()
      if (v) return v
    } catch (e) {
      last = e
    }
    await sleep(250)
  }
  throw new Error(`${what} did not come up${last ? `: ${last.message}` : ''}`)
}

function cleanProfile(dir) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  mkdirSync(dir, { recursive: true })
}

function removeProfile(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  } catch {
    /* the browser is still letting go of a file; the next run clears it */
  }
}

/** The browsers this process has started and not yet seen exit. */
const running = new Set()

function start(kind, exe, args, options) {
  const child = spawn(exe, args, options)
  child.shotsKind = kind
  running.add(child)
  child.once('exit', () => running.delete(child))
  return child
}

/** End a browser and the processes it started; on Windows the first is only a launcher. */
function endTree(child) {
  if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {})
  else child.kill()
}

/** Wait for a browser to exit by itself, and end it if it hasn't. */
async function gone(child) {
  const exited = new Promise((resolve) => child.once('exit', resolve))
  if (child.exitCode == null) await Promise.race([exited, sleep(5000)])
  if (child.exitCode == null) endTree(child)
  await sleep(300)
}

/** Evaluate `expression` (which may be a promise) and bring its value back as JSON. */
const asJson = (expression) => `(async () => JSON.stringify((await (${expression})) ?? null))()`

async function launchChromium(exe, profileDir) {
  cleanProfile(profileDir)
  const port = await freePort()
  const child = start(
    'chromium',
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const target = await until(async () => {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    return targets.find((t) => t.type === 'page')
  }, 'the browser')
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
  const errors = []
  const { send, close } = await channel(target.webSocketDebuggerUrl, (msg) => {
    if (msg.method === 'Runtime.exceptionThrown')
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
  })
  const call = async (method, params) => {
    const msg = await send(method, params)
    if (msg.error) throw new Error(`${method}: ${msg.error.message}`)
    return msg.result
  }
  await call('Runtime.enable')
  await call('Page.enable')
  await call('Network.enable')
  // The app is seeded to talk to a closed local port; this is the second lock.
  await call('Network.setBlockedURLs', { urls: ['*script.google.com*', '*googleusercontent.com*'] })

  return {
    kind: 'chromium',
    version: version.Browser,
    errors,
    async viewport(width, height, scale, mobile = true) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile })
    },
    async goto(url) {
      await call('Page.navigate', { url })
      await until(() => this.eval(`document.readyState === 'complete'`), url)
    },
    async eval(expression) {
      const r = await call('Runtime.evaluate', { expression: asJson(expression), awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return JSON.parse(r.result.value)
    },
    async shot(file, { fullPage = false } = {}) {
      const params = { format: 'png' }
      if (fullPage) {
        const { cssContentSize: size } = await call('Page.getLayoutMetrics')
        params.captureBeyondViewport = true
        params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 }
      }
      const r = await call('Page.captureScreenshot', params)
      writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    async close() {
      try {
        await Promise.race([send('Browser.close'), sleep(3000)])
      } catch {
        /* already gone */
      }
      close()
      await gone(child)
      removeProfile(profileDir)
    },
  }
}

/** Prefs for a Firefox that opens no welcome tab, phones nowhere, and speaks BiDi. */
const FIREFOX_PREFS = {
  'remote.active-protocols': 1,
  'browser.shell.checkDefaultBrowser': false,
  'browser.aboutwelcome.enabled': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'startup.homepage_welcome_url': 'about:blank',
  'startup.homepage_welcome_url.additional': '',
  'datareporting.policy.dataSubmissionEnabled': false,
  'datareporting.healthreport.uploadEnabled': false,
  'toolkit.telemetry.enabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'app.update.auto': false,
  'app.update.enabled': false,
  'app.normandy.enabled': false,
  'browser.tabs.warnOnClose': false,
  'browser.sessionstore.resume_from_crash': false,
  'ui.systemUsesDarkTheme': 1,
}

async function launchFirefox(exe, profileDir) {
  cleanProfile(profileDir)
  writeFileSync(
    path.join(profileDir, 'user.js'),
    Object.entries(FIREFOX_PREFS)
      .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
      .join('\n'),
  )
  const port = await freePort()
  const child = start(
    'firefox',
    exe,
    ['--headless', '--no-remote', '--profile', profileDir, '--remote-debugging-port', String(port), 'about:blank'],
    { stdio: 'ignore' },
  )
  const errors = []
  const { send, close } = await until(
    () =>
      channel(`ws://127.0.0.1:${port}/session`, (msg) => {
        if (msg.method !== 'log.entryAdded') return
        const e = msg.params
        if (e.level === 'error') errors.push(e.text ?? '')
      }),
    'Firefox',
    // The first start after Firefox has updated itself takes the better part of a minute.
    360,
  )
  const call = async (method, params) => {
    const msg = await send(method, params)
    if (msg.type === 'error' || msg.error) throw new Error(`${method}: ${msg.message ?? msg.error}`)
    return msg.result
  }
  const session = await call('session.new', { capabilities: {} })
  await call('session.subscribe', { events: ['log.entryAdded'] })
  // The first window can take a moment to exist after the session does, and a
  // question asked before it does is sometimes never answered: ask again.
  const context = await until(async () => {
    const msg = await send('browsingContext.getTree', {}, 4000)
    return msg.result?.contexts?.[0]?.context
  }, "Firefox's first window", 20)

  return {
    kind: 'firefox',
    version: `Firefox/${session.capabilities?.browserVersion ?? '?'}`,
    errors,
    async viewport(width, height, scale) {
      await call('browsingContext.setViewport', { context, viewport: { width, height }, devicePixelRatio: scale })
    },
    async goto(url) {
      await call('browsingContext.navigate', { context, url, wait: 'complete' })
    },
    async eval(expression) {
      const r = await call('script.evaluate', {
        expression: asJson(expression),
        target: { context },
        awaitPromise: true,
        resultOwnership: 'none',
      })
      if (r.type === 'exception') throw new Error(r.exceptionDetails?.text ?? 'evaluate failed')
      return JSON.parse(r.result.value)
    },
    async shot(file, { fullPage = false } = {}) {
      const r = await call('browsingContext.captureScreenshot', {
        context,
        origin: fullPage ? 'document' : 'viewport',
      })
      writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    async close() {
      try {
        await Promise.race([send('browser.close'), sleep(3000)])
      } catch {
        /* already gone */
      }
      close()
      await gone(child)
      removeProfile(profileDir)
    },
  }
}

/** Start a browser, or throw saying why it couldn't be, leaving none behind. */
export async function launch(kind, profileDir) {
  const exe = findBrowser(kind)
  if (!exe) throw new Error(`no ${kind} found on this machine`)
  try {
    return await (kind === 'firefox' ? launchFirefox(exe, profileDir) : launchChromium(exe, profileDir))
  } catch (e) {
    // A browser that started but never answered is still running, headless
    // and invisible, holding its profile and its port.
    for (const child of running) if (child.shotsKind === kind) endTree(child)
    throw e
  }
}
