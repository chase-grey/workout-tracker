#!/usr/bin/env node
/**
 * Look at the app before reporting on it.
 *
 *   npm run shots                       # everything, in Chromium and Firefox
 *   npm run shots -- rhythm             # one family: rhythm, hold, rest, today, progress, session, settings
 *   npm run shots -- rhythm anvil       # narrower: every word must match a part of family/variant/phase
 *   npm run shots -- progress --browser firefox     # chromium | firefox | all (the default)
 *   npm run shots -- --refresh-data     # pull the owner's history first (needs the owner key; see below)
 *   npm run shots -- today --light      # on the light ground
 *   npm run shots -- rest --accent "#ff6600"   # in a swatch (rose) or a colour of your own
 *   npm run shots -- today progress --size 3438x1300   # in a desktop window instead of on a phone
 *
 * Renders the app's visual surfaces at a phone's 390x844 and writes one PNG per
 * shot plus a contact sheet to .scratch/shots/: index.html, and pictures of it,
 * sheet-<family>.png for each family and sheet.png of the whole page when a
 * narrow run leaves it short enough to be one image. The folder is emptied
 * first, so the sheet is always this run and nothing older.
 * The figures and shapes are drawn one at a time by the shots page
 * (shots.html, src/shots/main.tsx), each at a named moment; Today, Progress and
 * the two sessions are the real app, opened on a seeded history and clicked
 * through.
 *
 * The history is the owner's own when a snapshot of it is on disk
 * (.scratch/shots-data/snapshot.json in the main checkout, out of git), and a
 * made-up one otherwise (src/shots/seed.ts). --refresh-data writes the snapshot:
 * read-only GETs with the owner key, taken from CHAT_SHARED_SECRET in the
 * environment or the checkout's .env, never printed and never stored.
 *
 * Nothing is installed for this. It starts its own dev server on a free port
 * and drives the Edge/Chrome and the Firefox already on the machine (see
 * shots-browsers.mjs). A desktop Firefox is the phone's engine, not the phone.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import { findBrowser, launch } from './shots-browsers.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* A phone unless --size says otherwise. Past the shell's own 700px line the
   window is a desktop's: one pixel to the pixel, and a mouse rather than a thumb. */
const sizeArg = (() => {
  const i = process.argv.indexOf('--size')
  if (i < 0) return null
  const m = /^(\d+)x(\d+)$/.exec(process.argv[i + 1] ?? '')
  if (!m) {
    console.error('--size takes WIDTHxHEIGHT, e.g. 3438x1300')
    process.exit(1)
  }
  return { w: Number(m[1]), h: Number(m[2]) }
})()
const WIDTH = sizeArg?.w ?? 390
const HEIGHT = sizeArg?.h ?? 844
const PHONE = WIDTH <= 700
const SCALE = PHONE ? 2 : 1
const SHEET_WIDTH = 3000
const THUMB_WIDTH = 156
/** Taller than this and a browser won't hand back one screenshot of the page. */
const SHEET_MAX_HEIGHT = 9000
const APP_FAMILIES = ['today', 'progress', 'session', 'settings']
const FAMILIES = ['rhythm', 'hold', 'rest', ...APP_FAMILIES]

/* ------------------------------------------------------------------ args */

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const browserArg = option('--browser') ?? 'all'
if (!['chromium', 'firefox', 'all'].includes(browserArg)) {
  console.error('--browser takes chromium, firefox or all')
  process.exit(1)
}
const mode = flag('--light') ? 'light' : 'dark'
/** A swatch's name or `#rrggbb`; unset wears the default. */
const accent = option('--accent') ?? null
const words = args.filter((a, i) => !a.startsWith('--') && !['--browser', '--accent', '--size'].includes(args[i - 1])).map((w) => w.toLowerCase())
// A family's name picks the family (several pick each of them); any other word
// has to match the variant or the phase.
const wanted = (id) => {
  const parts = id.split('/')
  const families = words.filter((w) => FAMILIES.includes(w))
  const rest = words.filter((w) => !FAMILIES.includes(w))
  return (
    (families.length === 0 || families.includes(parts[0])) &&
    rest.every((w) => parts.slice(1).some((part) => part.includes(w)))
  )
}

/* ------------------------------------------------------------------ data */

/** The main checkout, which is where a worktree's snapshot and .env live too. */
function mainCheckout() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root })
    return path.dirname(common.toString().trim())
  } catch {
    return root
  }
}
const home = mainCheckout()
const snapshotFile = path.join(home, '.scratch', 'shots-data', 'snapshot.json')

const SNAPSHOT_ROUTES = ['workouts', 'bodyweight', 'measurements', 'calories', 'flexibility', 'cardio', 'durations', 'settings']
/** Settings that are a key to something, or point somewhere: never kept. */
const SECRET_SETTING = /key|token|secret|password|apiurl|baseurl/i

async function refreshData() {
  // A key already in the environment is the one to use; .env is only opened without one.
  for (const dir of process.env.CHAT_SHARED_SECRET ? [] : [root, home]) {
    try {
      process.loadEnvFile(path.join(dir, '.env'))
    } catch {
      /* no .env there */
    }
  }
  const key = (process.env.CHAT_SHARED_SECRET || '').trim()
  if (!key) throw new Error('no owner key: set CHAT_SHARED_SECRET or put it in .env')
  const config = readFileSync(path.join(root, 'src', 'config', 'backend.ts'), 'utf8')
  const url = process.env.API_URL || (config.match(/'(https?:[^']+\/exec)'/) || [])[1]
  if (!url) throw new Error('no backend URL: set API_URL or check src/config/backend.ts')
  const get = async (route) => {
    const u = new URL(url)
    u.searchParams.set('route', route)
    u.searchParams.set('user', key)
    const res = await fetch(u, { signal: AbortSignal.timeout(90_000) })
    if (!res.ok) throw new Error(`GET ${route}: HTTP ${res.status}`)
    const body = await res.json()
    if (body && body.error) throw new Error(`GET ${route}: ${body.error}`)
    return body
  }
  const parts = await Promise.all(SNAPSHOT_ROUTES.map(get))
  const data = Object.fromEntries(SNAPSHOT_ROUTES.map((r, i) => [r, parts[i]]))
  data.settings = Object.fromEntries(
    Object.entries(data.settings ?? {}).filter(([k]) => !SECRET_SETTING.test(k)),
  )
  data.fetchedAt = new Date().toISOString()
  mkdirSync(path.dirname(snapshotFile), { recursive: true })
  writeFileSync(snapshotFile, JSON.stringify(data))
  const counts = SNAPSHOT_ROUTES.filter((r) => Array.isArray(data[r])).map((r) => `${data[r].length} ${r}`)
  console.log(`Snapshot written (${counts.join(', ')}): ${snapshotFile}`)
}

function loadSnapshot() {
  if (!existsSync(snapshotFile)) return null
  try {
    return JSON.parse(readFileSync(snapshotFile, 'utf8'))
  } catch {
    console.error(`Snapshot unreadable, using the made-up history: ${snapshotFile}`)
    return null
  }
}

/* ------------------------------------------------------------------ the app, clicked through */

/** Press the first visible button with this label or text, the way a thumb does. */
const pressJs = (label, exact = true) => `(() => {
  const want = ${JSON.stringify(label)}
  const b = [...document.querySelectorAll('button')].find((b) => {
    const t = (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()
    return (${exact} ? t === want : t.startsWith(want)) && b.getClientRects().length > 0
  })
  if (!b) return false
  b.scrollIntoView({ block: 'center' })
  const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true }
  b.dispatchEvent(new PointerEvent('pointerdown', o))
  b.dispatchEvent(new PointerEvent('pointerup', o))
  b.click()
  return true
})()`

/** A tap on the blank screen, which is what advances a session. */
const tapScreenJs = `(() => {
  const el = document.querySelector('.session-type') ?? document.body
  const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: ${Math.round(WIDTH / 2)}, clientY: ${HEIGHT - 144} }
  el.dispatchEvent(new PointerEvent('pointerdown', o))
  el.dispatchEvent(new PointerEvent('pointerup', o))
  el.dispatchEvent(new MouseEvent('click', o))
  return true
})()`

/** A tap on whatever is drawn over the session: the rest, the count, "ready?". */
const tapOverlayJs = `(() => {
  const el = document.querySelector('.fixed.inset-0.z-50')
  if (!el) return false
  el.click()
  return true
})()`

const scrollMainJs = (top) => `(() => {
  const m = document.querySelector('main')
  if (!m) return 0
  m.scrollTop = ${top}
  return m.scrollHeight
})()`

const LIFT_DAYS = ['push + core', 'pull + legs', 'full body']
const STRETCH_ROUTINES = ['head to toe', 'side split', 'pelvic tilt']
const SESSION_TILES = [...LIFT_DAYS, ...STRETCH_ROUTINES]
const routineId = (r) => r.replace(/\s+/g, '-')

/** The first session tile on Today, as an expression. */
const firstTileJs = `[...document.querySelectorAll('main button')].find((b) => ${JSON.stringify(SESSION_TILES)}.includes(b.textContent.trim()))`

/** Wait for a stretch set to be the thing on screen: a hold or a figure, nothing over it. */
async function untilSetIsUp(page) {
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    const up = await page.eval(`!!document.querySelector('.hold-timer, .rhythm-guide') && !document.querySelector('.fixed.inset-0')`)
    if (up) return true
  }
  return false
}

/**
 * The app's own screens, as a list of flows. Each flow is run only if one of its
 * shots is wanted, and `take(id)` saves only the wanted ones.
 */
const APP_FLOWS = [
  {
    family: 'today',
    ids: [
      'today/top',
      'today/bottom',
      'today/calendar',
      'today/calendar-whole-week',
      'today/calendar-next-week',
      'today/tiles',
      'today/tiles-editing',
    ],
    async run({ page, take, note }) {
      await page.eval(scrollMainJs(0))
      await take('today/top')
      await page.eval(scrollMainJs(100000))
      await sleep(300)
      await take('today/bottom')
      // The small calendar: as it opens, the whole week, and the week after.
      const found = await page.eval(`(() => {
        const b = document.querySelector('button[aria-label="next week"]')
        if (!b) return false
        b.scrollIntoView({ block: 'center' })
        return true
      })()`)
      if (!found) note('today: no calendar on Today')
      else {
        await sleep(300)
        await take('today/calendar')
        if (await page.eval(pressJs('show the whole week'))) {
          await sleep(500)
          await take('today/calendar-whole-week')
        } else note('today: no "show the whole week" on the calendar')
        if (await page.eval(pressJs('next week'))) {
          await sleep(500)
          await take('today/calendar-next-week')
        }
      }
      // The tiles, and what they look like held open for changing.
      const tile = await page.eval(`(() => {
        const b = ${firstTileJs}
        if (!b) return false
        b.scrollIntoView({ block: 'center' })
        return true
      })()`)
      if (!tile) return note('today: no session tiles on Today')
      await sleep(300)
      await take('today/tiles')
      // A tile is changed by holding it: press, and let go past the hold.
      await page.eval(`(() => {
        const b = ${firstTileJs}
        const r = b.getBoundingClientRect()
        const o = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }
        b.dispatchEvent(new PointerEvent('pointerdown', o))
        window.__shotsLetGo = () => b.dispatchEvent(new PointerEvent('pointerup', o))
        return true
      })()`)
      await sleep(1200)
      await page.eval(`(window.__shotsLetGo(), true)`)
      await sleep(400)
      const editing = await page.eval(`!!document.querySelector('button[aria-label="add tile"], button[aria-label^="remove "]')`)
      if (editing) await take('today/tiles-editing')
      else note('today: holding a tile did not open the tiles for changing')
    },
  },
  {
    family: 'settings',
    ids: ['settings/theme', 'settings/custom-colour'],
    async run({ page, take, note }) {
      if (!(await page.eval(pressJs('settings', false)))) return note('settings: no tab button')
      const toSwatches = `(() => {
        const b = document.querySelector('button[aria-label="custom"]')
        if (!b) return false
        b.scrollIntoView({ block: 'center' })
        return true
      })()`
      // The tab is loaded on first use, and the look of the app is on its
      // second page; give both a while to arrive.
      let there = false
      for (let i = 0; i < 20 && !there; i++) {
        await sleep(400)
        await page.eval(pressJs('app'))
        there = await page.eval(toSwatches)
      }
      if (!there) return note('settings: no custom swatch')
      await sleep(300)
      await take('settings/theme')
      await page.eval(pressJs('custom'))
      await sleep(400)
      await page.eval(toSwatches)
      await sleep(300)
      await take('settings/custom-colour')
    },
  },
  {
    family: 'progress',
    ids: [
      'progress/muscle-vs-fat',
      'progress/body-fat-%',
      'progress/whole-body',
      ...Array.from({ length: 10 }, (_, i) => `progress/page-${i + 1}`),
    ],
    async run({ page, take, note }) {
      if (!(await page.eval(pressJs('progress')))) return note('progress: no tab button')
      await sleep(1200)
      const section = `[...document.querySelectorAll('h4')].find((h) => h.textContent.startsWith('body fat'))?.parentElement`
      for (const metric of ['muscle vs fat', 'body fat %', 'whole body']) {
        if (!(await page.eval(pressJs(metric)))) note(`progress: no "${metric}" pill (not the owner's charts?)`)
        await page.eval(`(${section})?.scrollIntoView({ block: 'start' }) ?? null`)
        // Recharts draws its lines in over a second and a half.
        await sleep(1900)
        await take(`progress/${metric.replace(/\s+/g, '-')}`)
      }
      // The whole tab, a screen at a time, so every other chart is seen too.
      const step = HEIGHT - 160
      for (let i = 0; i < 10; i++) {
        const height = await page.eval(scrollMainJs(i * step))
        if (i > 0 && i * step > height - HEIGHT / 2) break
        await sleep(1200)
        await take(`progress/page-${i + 1}`)
      }
    },
  },
  {
    family: 'session',
    ids: [
      'session/lift-set',
      'session/lift-rest',
      'session/lift-how-to',
      'session/lift-menu',
      'session/lift-paused',
      ...STRETCH_ROUTINES.flatMap((r) => [
        `session/${routineId(r)}-opens`,
        `session/${routineId(r)}-get-ready`,
        `session/${routineId(r)}-set`,
      ]),
      'session/pelvic-tilt-into-thrust',
      'session/pelvic-tilt-thrust',
      'session/stretch-paused',
      'session/stretch-how-to',
    ],
    async run({ page, take, note, reload }) {
      const startLift = async () => {
        for (const day of LIFT_DAYS) if (await page.eval(pressJs(day))) return true
        return false
      }
      if (!(await startLift())) note('session: no lift tile on Today')
      else {
        await sleep(1500)
        await take('session/lift-set')
        await page.eval(tapScreenJs)
        await sleep(1500)
        await take('session/lift-rest')
        // The ? beside the movement, the kebab, and the pause curtain, each from a clean start.
        await reload()
        await startLift()
        await sleep(1200)
        if (await page.eval(pressJs('how to do', false))) {
          await sleep(900)
          await take('session/lift-how-to')
        } else note('session: no ? beside the lift')
        await reload()
        await startLift()
        await sleep(1200)
        if (await page.eval(pressJs('more options'))) {
          await sleep(500)
          await take('session/lift-menu')
          if (await page.eval(pressJs('pause workout'))) {
            await sleep(900)
            await take('session/lift-paused')
          } else note('session: no "pause workout" in the lift menu')
        } else note('session: no kebab on the lift')
      }
      // Each stretch routine, from a clean start: nothing is logged.
      for (const routine of STRETCH_ROUTINES) {
        await reload()
        if (!(await page.eval(pressJs(routine)))) {
          note(`session: no "${routine}" tile on Today`)
          continue
        }
        const id = routineId(routine)
        await sleep(1500)
        await take(`session/${id}-opens`)
        // Past the photo and measuring steps, to the first movement.
        for (let i = 0; i < 6 && !(await page.eval(pressJs('Begin', false))); i++) {
          if (!(await page.eval(pressJs('skip all'))) && !(await page.eval(pressJs('skip')))) break
          await sleep(700)
        }
        await sleep(1500)
        await take(`session/${id}-get-ready`)
        if (!(await untilSetIsUp(page))) note(`session: ${routine} never reached a hold or a figure`)
        await sleep(2500)
        await take(`session/${id}-set`)
        if (routine === 'pelvic tilt') {
          // Through both tilts to the typed-in set, which is asked for like any
          // other new exercise of this routine (see lib/settleIn).
          await page.eval(tapScreenJs)
          await sleep(1200)
          await page.eval(tapOverlayJs)
          if (!(await untilSetIsUp(page))) note('session: the standing tilt never came up')
          await page.eval(tapScreenJs)
          // Longer than the five-second count this used to be, so a count that
          // ran out on its own shows here as the card rather than "ready?".
          await sleep(7000)
          await take('session/pelvic-tilt-into-thrust')
          await page.eval(tapOverlayJs)
          await sleep(1200)
          await take('session/pelvic-tilt-thrust')
        }
        if (routine !== STRETCH_ROUTINES[0]) continue
        // The pause curtain first, then back off it for the ? beside the movement.
        const menu = await page.eval(pressJs('more options'))
        await sleep(500)
        if (menu && (await page.eval(pressJs('pause routine')))) {
          await sleep(900)
          await take('session/stretch-paused')
          await page.eval(pressJs('paused, resume'))
          await sleep(900)
        } else note('session: no "pause routine" in the stretch menu')
        if (await page.eval(pressJs('how to do', false))) {
          await sleep(900)
          await take('session/stretch-how-to')
        } else note('session: no ? beside the stretch')
      }
    },
  },
]

/* ------------------------------------------------------------------ one browser's run */

async function shootWith(kind, base, outDir, snapshot) {
  const started = Date.now()
  // A profile of this run's own: one left locked by a run that died can't stop the next.
  const page = await launch(kind, path.join(root, '.scratch', 'shots-tmp', `${kind}-${process.pid}`))
  const taken = []
  const notes = []
  try {
    await page.viewport(WIDTH, HEIGHT, SCALE, PHONE)

    const save = async (id, meta) => {
      const file = path.join(outDir, kind, `${id}.png`)
      mkdirSync(path.dirname(file), { recursive: true })
      await page.shot(file)
      taken.push({ id, browser: kind, file, ...meta })
    }

    // The figures and shapes, on the shots page.
    await page.goto(`${base}/shots.html`)
    const source = await page.eval(`window.__shots.seed(${JSON.stringify(snapshot)}, ${JSON.stringify(mode)}, ${JSON.stringify(accent)})`)
    await page.goto(`${base}/shots.html`)
    const size = await page.eval(`({ w: innerWidth, h: innerHeight })`)
    if (size.w !== WIDTH || size.h !== HEIGHT) notes.push(`viewport is ${size.w}x${size.h}, not ${WIDTH}x${HEIGHT}`)
    const list = (await page.eval(`window.__shots.list()`)).filter((s) => wanted(s.id))
    for (const s of list) {
      const ok = await page.eval(`window.__shots.show(${JSON.stringify(s.id)})`)
      if (!ok) notes.push(`${s.id}: not drawn`)
      else await save(s.id, s)
    }

    // The app itself, on the seeded history.
    const flows = APP_FLOWS.filter((f) => f.ids.some(wanted))
    const open = async () => {
      await page.goto(`${base}/shots.html`)
      await page.eval(`window.__shots.seed(${JSON.stringify(snapshot)}, ${JSON.stringify(mode)}, ${JSON.stringify(accent)})`)
      await page.goto(`${base}/`)
      // A press made from script has no real pointer behind it, so there is
      // nothing for the app's setPointerCapture to capture. Let it pass.
      await page.eval(`(() => {
        const capture = Element.prototype.setPointerCapture
        Element.prototype.setPointerCapture = function (id) {
          try { capture.call(this, id) } catch {}
        }
        return true
      })()`)
      await sleep(2500)
    }
    for (const flow of flows) {
      await open()
      await flow.run({
        page,
        reload: open,
        note: (text) => notes.push(text),
        take: async (id) => {
          if (!wanted(id)) return
          const [family, phase] = id.split('/')
          await save(id, { family, group: family, variant: family, phase: phase.replace(/-/g, ' ') })
        },
      })
    }
    return { kind, version: page.version, taken, notes, errors: [...new Set(page.errors)], source, page, ms: Date.now() - started }
  } catch (e) {
    await page.close()
    throw e
  }
}

/* ------------------------------------------------------------------ the contact sheet */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const thumbJs = (url) => `(async () => {
  const bmp = await createImageBitmap(await (await fetch(${JSON.stringify(url)})).blob())
  const c = document.createElement('canvas')
  c.width = ${THUMB_WIDTH * 2}
  c.height = Math.round((bmp.height * c.width) / bmp.width)
  const g = c.getContext('2d')
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.85)
})()`

function sheetHtml(runs, outDir, source) {
  const browsers = runs.map((r) => r.kind)
  const all = runs.flatMap((r) => r.taken)
  const rel = (file) => path.relative(outDir, file).split(path.sep).join('/')
  const sections = FAMILIES.filter((f) => all.some((s) => s.family === f)).map((family) => {
    const inFamily = all.filter((s) => s.family === family)
    const groups = [...new Set(inFamily.map((s) => s.group))]
    const body = groups.map((group) => {
      const variants = [...new Set(inFamily.filter((s) => s.group === group).map((s) => s.variant))]
      const strips = variants.map((variant) => {
        const rows = browsers.map((b) => {
          const cells = inFamily
            .filter((s) => s.variant === variant && s.browser === b)
            .map((s) => `<a href="${esc(rel(s.file))}"><img loading="eager" src="${esc(rel(s.thumb ?? s.file))}" width="${THUMB_WIDTH}" alt=""><span>${esc(s.phase)}</span></a>`)
            .join('')
          return cells ? `<div class="row"><b>${esc(b)}</b>${cells}</div>` : ''
        })
        return `<div class="strip"><h3>${esc(variant)}</h3>${rows.join('')}</div>`
      })
      const heading = group === family ? '' : `<h2>${esc(group)}</h2>`
      return `${heading}<div class="strips">${strips.join('')}</div>`
    })
    return `<section id="${esc(family)}"><h1>${esc(family)}</h1>${body.join('')}</section>`
  })
  const seen = runs.map((r) => `${r.kind} (${r.version})`).join(', ')
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>shots</title>
<style>
  body { margin: 0; padding: 16px; background: #1b1b1b; color: #ddd; font: 13px/1.3 system-ui, sans-serif; }
  header { margin-bottom: 12px; color: #999; }
  h1 { font-size: 22px; margin: 22px 0 6px; color: #fff; }
  h2 { font-size: 15px; margin: 14px 0 4px; color: #9c9; font-weight: 600; }
  h3 { font-size: 13px; margin: 0 0 4px; color: #fff; }
  .strips { display: flex; flex-wrap: wrap; gap: 14px 18px; }
  .strip { background: #262626; border-radius: 6px; padding: 6px 8px 8px; }
  .row { display: flex; gap: 6px; align-items: flex-start; margin-top: 4px; }
  .row b { writing-mode: vertical-rl; font-weight: 400; font-size: 11px; color: #888; }
  a { display: flex; flex-direction: column; gap: 2px; color: #aaa; text-decoration: none; font-size: 11px; }
  img { display: block; border: 1px solid #3a3a3a; }
</style>
<header>${esc(new Date().toLocaleString())} · ${WIDTH}x${HEIGHT} · ${esc(mode)}${accent ? ` · accent ${esc(accent)}` : ''} · seen in ${esc(seen)} · history: ${esc(source)} · the phone was not observed</header>
${sections.join('\n')}
</html>
`
}

/* ------------------------------------------------------------------ main */

if (flag('--refresh-data')) {
  try {
    await refreshData()
  } catch (e) {
    console.error(`Could not refresh the snapshot: ${e.message}`)
    process.exit(2)
  }
}
const snapshot = loadSnapshot()

const kinds = (browserArg === 'all' ? ['chromium', 'firefox'] : [browserArg]).filter((k) => {
  if (findBrowser(k)) return true
  console.error(`${k}: not found on this machine, not run`)
  return false
})
if (kinds.length === 0) process.exit(1)

const outDir = path.join(root, '.scratch', 'shots')
try {
  // Profiles left by a run that was stopped part-way.
  rmSync(path.join(root, '.scratch', 'shots-tmp'), { recursive: true, force: true })
} catch {
  /* still held by a browser that hasn't gone yet */
}
rmSync(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
mkdirSync(outDir, { recursive: true })

const server = await createServer({
  root,
  plugins: [
    {
      // The finished shots, served back to the page that shrinks them for the sheet.
      name: 'shots-out',
      configureServer(server) {
        server.middlewares.use('/__shots-out/', (req, res, next) => {
          const file = path.join(outDir, decodeURIComponent((req.url || '').split('?')[0]))
          if (!file.startsWith(outDir) || !existsSync(file)) return next()
          res.setHeader('Content-Type', 'image/png')
          res.end(readFileSync(file))
        })
      },
    },
  ],
  logLevel: 'error',
  // Its own cache, so a dev server someone has running here is left alone.
  cacheDir: path.join(root, 'node_modules', '.vite-shots'),
  // The watcher keeps out of .scratch: the browsers' profiles live there for the
  // run, and a file a browser holds open stops the watcher dead on Windows.
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
    open: false,
    hmr: false,
    watch: { ignored: ['**/.scratch/**', '**/.worktrees/**', '**/.autofix/**'] },
  },
})
await server.listen()
const base = `http://127.0.0.1:${server.httpServer.address().port}`

const started = Date.now()
const results = await Promise.allSettled(kinds.map((k) => shootWith(k, base, outDir, snapshot)))
const runs = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
results.forEach((r, i) => {
  if (r.status === 'rejected') console.error(`${kinds[i]}: failed, not run to the end: ${r.reason?.message ?? r.reason}`)
})

let sheet = null
const pictures = []
if (runs.some((r) => r.taken.length > 0)) {
  const source = runs[0].source === 'snapshot' ? `the owner's snapshot (${snapshot?.fetchedAt ?? 'undated'})` : 'made up (no snapshot)'
  sheet = path.join(outDir, 'index.html')
  // The sheet shows small copies: six hundred full-size screenshots on one page
  // is more than a browser will decode. One browser shrinks them, one at a time.
  try {
    const page = runs[0].page
    await page.goto(`${base}/shots.html`)
    for (const shot of runs.flatMap((r) => r.taken)) {
      const url = `/__shots-out/${path.relative(outDir, shot.file).split(path.sep).map(encodeURIComponent).join('/')}`
      const data = await page.eval(thumbJs(url))
      const thumb = path.join(outDir, 'thumbs', path.relative(outDir, shot.file).replace(/\.png$/, '.jpg'))
      mkdirSync(path.dirname(thumb), { recursive: true })
      writeFileSync(thumb, Buffer.from(data.split(',')[1], 'base64'))
      shot.thumb = thumb
    }
  } catch (e) {
    console.error(`thumbnails not made, the sheet shows the full files: ${e.message}`)
  }
  writeFileSync(sheet, sheetHtml(runs, outDir, source))
  // Pictures of the sheet, from whichever browser came up first: one per family,
  // and one of the whole page when it is short enough to be a single image.
  try {
    const page = runs[0].page
    await page.viewport(SHEET_WIDTH, 300, 1, false)
    await page.goto(pathToFileURL(sheet).href)
    await page.eval(`Promise.all([...document.images].map((i) => i.decode().catch(() => null))).then(() => true)`)
    const height = await page.eval(`document.documentElement.scrollHeight`)
    const families = await page.eval(`[...document.querySelectorAll('section')].map((s) => s.id)`)
    if (height <= SHEET_MAX_HEIGHT) {
      await page.shot(path.join(outDir, 'sheet.png'), { fullPage: true })
      pictures.push('sheet.png')
    }
    for (const family of families.length > 1 || pictures.length === 0 ? families : []) {
      await page.eval(`document.querySelectorAll('section').forEach((s) => { s.hidden = s.id !== ${JSON.stringify(family)} })`)
      await page.shot(path.join(outDir, `sheet-${family}.png`), { fullPage: true })
      pictures.push(`sheet-${family}.png`)
    }
  } catch (e) {
    console.error(`pictures of the sheet stopped at ${pictures.length}: ${e.message}`)
  }
}
await Promise.all(runs.map((r) => r.page.close()))
await server.close()
try {
  rmSync(path.join(root, '.scratch', 'shots-tmp'), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
} catch {
  /* a browser still letting go of its profile; the next run clears it */
}

for (const r of runs) {
  console.log(`${r.kind} (${r.version}): ${r.taken.length} shots in ${Math.round(r.ms / 1000)}s`)
  for (const n of r.notes) console.log(`  note: ${n}`)
  for (const e of r.errors.slice(0, 10)) console.log(`  page error: ${String(e).split('\n')[0].slice(0, 200)}`)
}
if (runs.length > 0) {
  console.log(`History: ${runs[0].source === 'snapshot' ? `the owner's snapshot, ${snapshotFile}` : 'made up (no snapshot; --refresh-data writes one)'}`)
}
if (sheet) console.log(`Contact sheet: ${sheet}
  as pictures: ${pictures.join(', ') || 'none'} (same folder)`)
console.log(`Total ${Math.round((Date.now() - started) / 1000)}s. The phone was not observed.`)
process.exit(runs.length === kinds.length && sheet ? 0 : 1)
