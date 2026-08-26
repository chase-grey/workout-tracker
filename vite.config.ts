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
import os from 'node:os'
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
 *
 * Every caller is same-origin: the browser on this machine, or a phone that
 * loaded this dev server over the LAN (see shareLink). So there is no CORS layer
 * and no token here — reaching this at all means already reaching this dev
 * server, which is as far as the key ever travels.
 */
function llmProxy(opts: {
  apiKey: string
  baseUrl: string
  model: string
  insecure: boolean
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
              // Nothing in this path buffers today, but anything that decided
              // to would silently undo the streaming.
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

// Adapters that answer on a real address but never reach a phone. Windows names
// its virtual switches after whatever created them, which is the only signal
// os.networkInterfaces() gives us to go on.
const VIRTUAL_ADAPTER = /vethernet|virtualbox|vmware|hyper-?v|wsl|docker|tailscale|zerotier|loopback/i

/**
 * The address a phone on this wifi can load this dev server at, or null.
 *
 * A laptop has several non-loopback addresses — wifi, ethernet, a VPN client, a
 * hypervisor's virtual switch — and only some of them are on the network the
 * phone is on. The virtual ones are dropped by name and wifi is preferred, that
 * being the network the phone is necessarily on; past those two rules it is a
 * guess, and SHARE_URL pins the answer when the guess is wrong.
 */
function lanAddress(port: number): string | null {
  const found: { name: string; address: string }[] = []
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue
    for (const a of addrs ?? []) {
      // family is 'IPv4' on current Node and 4 on some older ones.
      if (a.internal || (a.family !== 'IPv4' && (a.family as unknown as number) !== 4)) continue
      found.push({ name, address: a.address })
    }
  }
  if (!found.length) return null
  const wifi = found.find((f) => /wi-?fi|wlan|wireless/i.test(f.name))
  return `http://${(wifi ?? found[0]).address}:${port}`
}

/**
 * Serves /api/share: the address to open this dev server on a phone, or null.
 *
 * This is the whole of the phone coach now. The phone loads this dev server
 * itself, so its /api/chat proxy — and the Epic key behind it — is simply there,
 * same-origin, with no address published anywhere and no public hostname to
 * chase. What that costs is reach: both ends have to be on Epic private wifi, so
 * the phone has to be an Epic-managed device, and off that network there is no
 * coach at all.
 */
function shareLink(explicit: string | null): PluginOption {
  return {
    name: 'share-link',
    configureServer(server) {
      server.middlewares.use('/api/share', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        // The bound port rather than the configured one: they differ whenever the
        // config left it unset, and the phone has to dial the one in use.
        const bound = server.httpServer?.address()
        const port =
          bound && typeof bound === 'object' ? bound.port : (server.config.server.port ?? 5173)
        res.end(JSON.stringify({ url: explicit ?? lanAddress(port) }))
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
    // host: true binds the LAN, which is how a phone reaches this dev server —
    // and, the public tunnel having gone, how it reaches the coach at all (see
    // shareLink). Vite accepts IP-literal Host headers by default, so binding the
    // LAN needs no allowlist to go with it.
    server: {
      host: true,
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
      }),
      // The phone link Settings shows as a QR. SHARE_URL pins it on a machine
      // whose LAN address this guesses wrong.
      shareLink((env.SHARE_URL || '').trim().replace(/[/]$/, '') || null),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'icon.svg',
          'icon-maskable.svg',
          'icon-180.png',
          'icon-192.png',
          'icon-512.png',
          'icon-maskable-192.png',
          'icon-maskable-512.png',
        ],
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
                // A full 200 only. These are same-origin, so an opaque (status
                // 0) response means something answered that we can't read —
                // storing it would pin an unusable runtime in the cache, and
                // cache-first would keep serving it back. See getLandmarker in
                // src/lib/pose.ts for the other half of this.
                cacheableResponse: { statuses: [200] },
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
          // PNGs first, and PNGs at all, because that's what makes this install
          // as a real app rather than a browser shortcut: Chrome/Android mints a
          // WebAPK from raster manifest icons, so an SVG-only manifest gets you
          // the browser's own generated launcher icon instead of this one.
          // Relative srcs resolve against the manifest, i.e. under `scope`.
          // Regenerate all of these with `npm run icons`.
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // Full-bleed variants — see public/icon-maskable.svg for why the
            // rounded-corner one can't serve both roles.
            {
              src: 'icon-maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            // Vector last, for anything that would rather scale than resample.
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
      }),
    ],
    test: {
      environment: 'node',
      // scripts/ is plain .mjs run by node, not part of the bundle — but the
      // auto-fixer's reply parsing lives there and is worth covering.
      include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    },
  }
})
