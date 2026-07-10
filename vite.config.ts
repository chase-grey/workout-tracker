/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import http from 'node:http'
import https from 'node:https'

// Repo name — used as the GitHub Pages base path in production.
const REPO = 'workout-tracker'

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
    plugins: [
      react(),
      tailwindcss(),
      llmProxy({
        apiKey: env.OPENAI_API_KEY || '',
        baseUrl,
        model: env.OPENAI_MODEL || 'gpt-4o',
        insecure,
      }),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icon.svg'],
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
