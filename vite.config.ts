/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import http from 'node:http'
import https from 'node:https'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_API_URL } from './src/config/backend.js'

// Repo name — used as the GitHub Pages base path in production.
const REPO = 'workout-tracker'

/**
 * The origin the installed phone app is served from, which chats to this dev
 * server cross-origin (see llmProxy).
 *
 * This has to be declared to Vite, not just handled in our own middleware:
 * Vite's CORS layer answers the preflight before any plugin middleware runs, and
 * it only echoes an `access-control-allow-origin` for origins it has been told
 * to trust. Anything else gets a 204 with no such header, which curl ignores and
 * a browser treats as a refusal.
 *
 * Derived from the git remote so a fork doesn't have to edit it; PAGES_ORIGIN
 * overrides for a custom domain.
 */
function pagesOrigin(explicit: string): string {
  if (explicit) return explicit.replace(/\/$/, '')
  try {
    const remote = execSync('git remote get-url origin').toString().trim()
    const owner = /github\.com[:/]([^/]+)\//.exec(remote)?.[1]
    if (owner) return `https://${owner.toLowerCase()}.github.io`
  } catch {
    /* no remote, or not a GitHub one */
  }
  return ''
}

// Vite's default: localhost in any form. Overriding server.cors replaces this
// rather than adding to it, so it has to be carried along.
const LOCALHOST_ORIGIN = /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/

// Build stamp baked into the bundle so Settings can show exactly which build is
// running — the quickest way to tell whether a phone is on a stale cached copy.
const COMMIT = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
})()
const BUILD_TIME = new Date().toISOString()

/**
 * Pose detection needs a wasm runtime and a model file at measure time. Both
 * used to come from public CDNs, so a phone that couldn't reach them — spotty
 * gym wifi, a network that blocks them — got no measurement at all. Serve them
 * from our own origin instead: the wasm comes out of node_modules (so it always
 * matches the JS bundle we import) and the model is fetched once at build time.
 * The service worker caches both on first use, so later measurements work
 * offline. See src/lib/pose.ts for the consuming side.
 */
const MEDIAPIPE_DIR = 'mediapipe'
const POSE_MODEL_FILE = 'pose_landmarker_full.task'
const POSE_MODEL_URL = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/${POSE_MODEL_FILE}`
// Only the variants FilesetResolver actually asks for: it picks the nosimd pair
// when the browser lacks wasm SIMD, and the plain pair otherwise.
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

const wasmSourceDir = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision')),
  'wasm',
)
// Downloaded once and kept out of git; CI re-fetches it on a cold cache.
const modelCachePath = path.join('node_modules', '.cache', MEDIAPIPE_DIR, POSE_MODEL_FILE)

async function cachedModel(): Promise<string> {
  if (!existsSync(modelCachePath)) {
    const res = await fetch(POSE_MODEL_URL)
    if (!res.ok) throw new Error(`pose model download failed: ${res.status} ${POSE_MODEL_URL}`)
    await mkdir(path.dirname(modelCachePath), { recursive: true })
    await writeFile(modelCachePath, Buffer.from(await res.arrayBuffer()))
  }
  return modelCachePath
}

/** Serve the pose runtime + model from our own origin, in dev and in the build. */
function mediapipeAssets(): PluginOption {
  const served = `/${MEDIAPIPE_DIR}/`
  return {
    name: 'mediapipe-assets',
    configureServer(server) {
      server.middlewares.use(served, (req, res, next) => {
        const name = path.basename((req.url || '').split('?')[0])
        const file =
          name === POSE_MODEL_FILE
            ? null
            : WASM_FILES.includes(name)
              ? path.join(wasmSourceDir, name)
              : undefined
        if (file === undefined) return next()
        void (async () => {
          try {
            const source = file ?? (await cachedModel())
            res.setHeader(
              'content-type',
              source.endsWith('.wasm')
                ? 'application/wasm'
                : source.endsWith('.js')
                  ? 'text/javascript'
                  : 'application/octet-stream',
            )
            res.end(await readFile(source))
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
        })()
      })
    },
    async writeBundle(options) {
      const outDir = path.join(options.dir || 'dist', MEDIAPIPE_DIR)
      await mkdir(outDir, { recursive: true })
      for (const name of WASM_FILES) {
        await copyFile(path.join(wasmSourceDir, name), path.join(outDir, name))
      }
      await copyFile(await cachedModel(), path.join(outDir, POSE_MODEL_FILE))
    },
  }
}

/**
 * POST JSON to an upstream and resolve with the response, still unread, so the
 * caller can pipe it straight through — a streamed completion has to reach the
 * browser token by token, not be collected here first.
 *
 * Internal Epic hosts present a cert Node doesn't trust by default, so `insecure`
 * mirrors the `--insecure` in Noggin's example curl.
 * Runs ONLY in the local dev server — never in the browser bundle.
 */
function postJson(
  urlString: string,
  headers: Record<string, string>,
  payload: unknown,
  insecure: boolean,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString)
    const mod = u.protocol === 'http:' ? http : https
    const data = JSON.stringify(payload)
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method: 'POST',
        headers: { ...headers, 'content-length': Buffer.byteLength(data) },
        ...(u.protocol === 'https:' ? { rejectUnauthorized: !insecure } : {}),
      },
      resolve,
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

/**
 * Dev-only chat proxy. The Epic API key lives in this Node process (from .env)
 * and is NEVER shipped to the client bundle. The browser POSTs { messages, tools,
 * model } to /api/chat; we inject the key + base URL and forward to the LLM.
 * Only works locally (`npm run dev`) — the Epic proxy is internal-network-only.
 */
function llmProxy(opts: {
  apiKey: string
  baseUrl: string
  model: string
  insecure: boolean
  sharedSecret: string
}): PluginOption {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        const json = (status: number, obj: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }

        // The installed phone app is served from GitHub Pages, so its calls here
        // are cross-origin: they need CORS, and a preflight for the JSON
        // content-type and token header.
        const origin = req.headers.origin
        if (origin) {
          res.setHeader('access-control-allow-origin', origin)
          res.setHeader('vary', 'origin')
          res.setHeader('access-control-allow-headers', 'content-type, x-chat-token')
          res.setHeader('access-control-max-age', '86400')
        }
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          return res.end()
        }
        if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

        // A cross-origin caller reached us over the public tunnel, so it has to
        // prove it's the phone. Same-origin dev browsing doesn't — nothing but
        // this machine can make a same-origin request to it.
        const crossOrigin = (() => {
          if (!origin) return false
          try {
            return new URL(origin).host !== req.headers.host
          } catch {
            return true
          }
        })()
        if (crossOrigin) {
          if (!opts.sharedSecret) {
            return json(503, { error: { message: 'No CHAT_SHARED_SECRET in .env' } })
          }
          if (req.headers['x-chat-token'] !== opts.sharedSecret) {
            return json(401, { error: { message: 'Bad or missing chat token' } })
          }
        }

        if (!opts.apiKey) return json(503, { error: { message: 'No OPENAI_API_KEY in .env' } })

        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}') as {
              messages: unknown
              tools?: unknown
              model?: string
              stream?: boolean
            }
            const payload: Record<string, unknown> = {
              model: parsed.model || opts.model,
              messages: parsed.messages,
            }
            if (Array.isArray(parsed.tools) && parsed.tools.length) {
              payload.tools = parsed.tools
              payload.tool_choice = 'auto'
            }
            if (parsed.stream) payload.stream = true
            const upstream = await postJson(
              `${opts.baseUrl}/chat/completions`,
              {
                'content-type': 'application/json',
                authorization: `Bearer ${opts.apiKey}`,
                ...(parsed.stream ? { accept: 'text/event-stream' } : {}),
              },
              payload,
              opts.insecure,
            )
            // Hand back whatever the upstream is sending — event-stream for a
            // streamed reply, JSON for a whole one or an error — and pipe rather
            // than buffer so each token leaves as it lands. An error answer to a
            // stream request comes back as JSON, which the client sorts out by
            // content type.
            res.statusCode = upstream.statusCode || 502
            res.setHeader('content-type', upstream.headers['content-type'] || 'application/json')
            if (parsed.stream) {
              res.setHeader('cache-control', 'no-cache, no-transform')
              // Nothing in this path buffers today, but a proxy in front of the
              // tunnel that decides to would silently undo the streaming.
              res.setHeader('x-accel-buffering', 'no')
              res.flushHeaders?.()
            }
            upstream.pipe(res)
          } catch (err) {
            json(500, { error: { message: `proxy_error: ${String(err)}` } })
          }
        })
      })
    },
  }
}

/**
 * A Cloudflare quick tunnel (`npm run dev:tunnel`) publishes this dev server at a
 * random *.trycloudflare.com hostname, which is how the phone reaches it from
 * anywhere — including off Epic's wifi. cloudflared advertises that hostname on a
 * local metrics port (20241 by default, walking up when it's taken), so the dev
 * server can discover its own public URL and hand it to Settings as a QR.
 */
const CF_METRICS_PORTS = [20241, 20242, 20243, 20244, 20245]

/** GET JSON with a deadline; any failure is just "no answer" — every caller here
 *  is probing something that may not exist. */
async function getJson(url: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Serves /api/share: the public URL to open this dev server on a phone, or null.
 *
 * A tunnel being alive doesn't make it OURS — other dev servers on this machine
 * may have tunnels of their own. This process mints a nonce and serves it at
 * /api/share/ping; a tunnel is only reported once a round trip through the public
 * hostname comes back with THIS nonce. If the round trip can't complete at all (no
 * egress), a single detected tunnel is reported unverified rather than dropped.
 */
function shareLink(
  explicit: string | null,
  publish: { apiUrl: string; secret: string },
): PluginOption {
  const nonce = `wt-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  let cache: { at: number; value: { url: string; verified: boolean } | null } = { at: 0, value: null }
  let published: string | null = null

  /**
   * Leave this tunnel's address on the Apps Script backend so the installed
   * phone app can find it. That indirection is the whole point: the quick tunnel
   * hostname changes every run, but the app stays installed from its permanent
   * GitHub Pages URL and looks the current one up. See saveChatEndpoint in
   * SimpleBackend.gs for why both directions need the shared secret.
   */
  const publishEndpoint = async (url: string) => {
    if (url === published || !publish.apiUrl || !publish.secret) return
    try {
      const res = await fetch(`${publish.apiUrl}?route=chat_endpoint`, {
        method: 'POST',
        // text/plain keeps this a CORS "simple request", which is what the Apps
        // Script web app can answer — same trick as src/services/api.ts.
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ url, secret: publish.secret }),
        signal: AbortSignal.timeout(15000),
      })
      const body = (await res.json()) as { saved?: number; error?: string }
      if (body.error) throw new Error(body.error)
      published = url
      console.log(`\n  Coach published to your phone: ${url}\n`)
    } catch (err) {
      console.warn(
        `\n  Could not publish the chat endpoint (${String(err)}).` +
          `\n  The phone won't find the coach until this succeeds.\n`,
      )
    }
  }

  const detect = async () => {
    const hits = await Promise.all(
      CF_METRICS_PORTS.map((p) => getJson(`http://127.0.0.1:${p}/quicktunnel`, 700)),
    )
    const hosts = [...new Set(hits.map((h) => h?.hostname).filter(Boolean))] as string[]
    if (!hosts.length) return null
    // true = answered with our nonce, false = someone else's server, null = no answer.
    const checked = await Promise.all(
      hosts.map(async (host) => {
        const pong = await getJson(`https://${host}/api/share/ping`, 6000)
        return { host, mine: pong ? pong.nonce === nonce : null }
      }),
    )
    const verified = checked.find((c) => c.mine === true)
    if (verified) return { url: `https://${verified.host}`, verified: true }
    if (checked.length === 1 && checked[0].mine === null)
      return { url: `https://${checked[0].host}`, verified: false }
    return null
  }

  return {
    name: 'share-link',
    configureServer(server) {
      // Publishing can't wait for someone to open Settings — the phone needs the
      // address whether or not this machine's browser is ever touched. Poll until
      // the tunnel is up and verified, then publish once and stop. The tunnel
      // takes a few seconds longer than the dev server to come up, so a miss on
      // the first passes is normal.
      // Skipping this silently is the worst outcome: the tunnel comes up, the
      // terminal looks healthy, and the phone just says no computer is running.
      if (!publish.secret) {
        console.warn(
          '\n  No CHAT_SHARED_SECRET in .env — not publishing an address, so the' +
            '\n  installed phone app will not find the coach. See README.\n',
        )
      }

      if (explicit) {
        void publishEndpoint(explicit)
      } else if (publish.apiUrl && publish.secret) {
        let tries = 0
        const timer = setInterval(() => {
          if (published || ++tries > 40) return clearInterval(timer)
          void detect()
            .catch(() => null)
            .then((found) => {
              if (found?.verified) {
                clearInterval(timer)
                void publishEndpoint(found.url)
              }
            })
        }, 3000)
        timer.unref?.() // never hold the process open on this alone
      }

      server.middlewares.use('/api/share/ping', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ nonce }))
      })

      server.middlewares.use('/api/share', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        if (explicit) return res.end(JSON.stringify({ url: explicit, verified: true }))
        // Probing costs an internet round trip, so hold the answer briefly —
        // reopening Settings shouldn't re-run the whole dance.
        if (Date.now() - cache.at < 20_000) return res.end(JSON.stringify(cache.value ?? { url: null }))
        void detect()
          .catch(() => null) // report no link rather than fail the request
          .then((value) => {
            cache = { at: Date.now(), value }
            res.end(JSON.stringify(value ?? { url: null }))
          })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix → load all vars (incl. non-VITE) from .env into this Node config.
  const env = loadEnv(mode, process.cwd(), '')
  const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const host = (() => {
    try {
      return new URL(baseUrl).hostname
    } catch {
      return ''
    }
  })()
  // Skip TLS verification for internal Epic hosts by default; allow explicit override.
  const insecure =
    env.OPENAI_INSECURE_TLS === 'true' ||
    (env.OPENAI_INSECURE_TLS !== 'false' && host.endsWith('.epic.com'))
  const pages = pagesOrigin((env.PAGES_ORIGIN || '').trim())

  return {
    base: mode === 'production' ? `/${REPO}/` : '/',
    // host: true binds to the LAN so a phone on the same wifi can reach the dev
    // server directly. allowedHosts lets a Cloudflare quick tunnel reach it too —
    // Vite otherwise rejects Host headers it doesn't recognize with "Blocked
    // request." Scoped to the tunnel domain, not opened wide.
    server: {
      host: true,
      allowedHosts: ['.trycloudflare.com'],
      // Chat from the installed app is cross-origin; everything else here stays
      // same-origin. The token in llmProxy is what actually guards /api/chat —
      // this only gets the browser's preflight past Vite.
      cors: { origin: pages ? [LOCALHOST_ORIGIN, pages] : [LOCALHOST_ORIGIN] },
    },
    define: {
      __APP_COMMIT__: JSON.stringify(COMMIT),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    plugins: [
      react(),
      tailwindcss(),
      mediapipeAssets(),
      llmProxy({
        apiKey: env.OPENAI_API_KEY || '',
        baseUrl,
        model: env.OPENAI_MODEL || 'gpt-4o',
        insecure,
        sharedSecret: (env.CHAT_SHARED_SECRET || '').trim(),
      }),
      // The phone link Settings shows as a QR, and the address published to the
      // backend so the installed app can find this machine. SHARE_URL pins it (a
      // named tunnel or a LAN address); left unset, a quick tunnel is detected.
      shareLink((env.SHARE_URL || '').trim().replace(/\/$/, '') || null, {
        apiUrl: ((env.VITE_API_URL || '').trim() || DEFAULT_API_URL).replace(/\/$/, ''),
        secret: (env.CHAT_SHARED_SECRET || '').trim(),
      }),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icon.svg', 'icon-maskable.svg'],
        workbox: {
          // The pose runtime and model are tens of megabytes — far too big to
          // precache on install. Cache them the first time a measurement runs
          // instead, after which measuring works offline.
          globIgnores: [`**/${MEDIAPIPE_DIR}/**`],
          runtimeCaching: [
            {
              urlPattern: new RegExp(`/${MEDIAPIPE_DIR}/`),
              handler: 'CacheFirst',
              options: {
                cacheName: 'pose-detector',
                expiration: { maxEntries: WASM_FILES.length + 1 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        manifest: {
          name: 'Workout Tracker',
          short_name: 'Lift',
          description: 'Quick in-gym workout logging, strength progress, and body weight tracking.',
          theme_color: '#0a0a0a',
          background_color: '#0a0a0a',
          display: 'standalone',
          orientation: 'portrait',
          start_url: `/${REPO}/`,
          scope: `/${REPO}/`,
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            // Full-bleed variant — see public/icon-maskable.svg for why the
            // rounded-corner one can't serve both roles.
            { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
      }),
    ],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
