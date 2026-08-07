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

// Repo name — used as the GitHub Pages base path in production.
const REPO = 'workout-tracker'

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
 * POST JSON to an upstream. Internal Epic hosts present a cert Node doesn't trust
 * by default, so `insecure` mirrors the `--insecure` in Noggin's example curl.
 * Runs ONLY in the local dev server — never in the browser bundle.
 */
function postJson(
  urlString: string,
  headers: Record<string, string>,
  payload: unknown,
  insecure: boolean,
): Promise<{ status: number; body: string }> {
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
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode || 502, body }))
      },
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
function llmProxy(opts: { apiKey: string; baseUrl: string; model: string; insecure: boolean }): PluginOption {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        const json = (status: number, obj: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
        if (!opts.apiKey) return json(503, { error: { message: 'No OPENAI_API_KEY in .env' } })

        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body || '{}') as {
              messages: unknown
              tools?: unknown
              model?: string
            }
            const payload: Record<string, unknown> = {
              model: parsed.model || opts.model,
              messages: parsed.messages,
            }
            if (Array.isArray(parsed.tools) && parsed.tools.length) {
              payload.tools = parsed.tools
              payload.tool_choice = 'auto'
            }
            const upstream = await postJson(
              `${opts.baseUrl}/chat/completions`,
              { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
              payload,
              opts.insecure,
            )
            res.statusCode = upstream.status
            res.setHeader('content-type', 'application/json')
            res.end(upstream.body)
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
function shareLink(explicit: string | null): PluginOption {
  const nonce = `wt-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  let cache: { at: number; value: { url: string; verified: boolean } | null } = { at: 0, value: null }

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

  return {
    base: mode === 'production' ? `/${REPO}/` : '/',
    // host: true binds to the LAN so a phone on the same wifi can reach the dev
    // server directly. allowedHosts lets a Cloudflare quick tunnel reach it too —
    // Vite otherwise rejects Host headers it doesn't recognize with "Blocked
    // request." Scoped to the tunnel domain, not opened wide.
    server: { host: true, allowedHosts: ['.trycloudflare.com'] },
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
      }),
      // The phone link Settings shows as a QR. SHARE_URL pins it (a named tunnel
      // or a LAN address); left unset, a Cloudflare quick tunnel is auto-detected.
      shareLink((env.SHARE_URL || '').trim().replace(/\/$/, '') || null),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icon.svg'],
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
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
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
