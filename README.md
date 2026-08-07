# Workout Tracker

A mobile-first PWA for quick in-gym workout logging, strength progress, and body
weight tracking during a bulk. Data lives in a Google Sheet via a Google Apps
Script backend. Deployed as a static site on GitHub Pages.

> Full product spec: Obsidian vault → `20 Projects/Personal/Workout Tracker.md`.

## Stack

- React + TypeScript + Vite, Tailwind CSS v4, dark mode only
- Recharts for progress charts
- PWA (installable, offline-tolerant write queue) via `vite-plugin-pwa`
- Backend: Google Apps Script web app over a Google Sheet (see [BACKEND.md](./BACKEND.md))

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # vitest (pure logic: streaks, Epley, dates, progress)
npm run build      # typecheck + production build
```

Create `.env` from `.env.example` and set `VITE_API_URL` to your Apps Script
`/exec` URL — or just enter it in the app's **Settings** at runtime.

## Install on your phone

The deployed site is a PWA, so it installs from the browser — no store, no packaging step.

- **Android:** open the Pages URL in **Chrome** → menu → **Install app**. Chrome mints a WebAPK,
  so it lands in the launcher and the app drawer as a real app: own icon, own task, no browser
  UI. Firefox's *Add to home screen* works too, but it only ever makes a Firefox-hosted
  shortcut with a Firefox-generated icon — install from Chrome to get the real thing.
- **iOS:** open it in **Safari** — the only browser iOS lets install — then Share → **Add to
  Home Screen**.

Already installed, and the icon looks stale? Android caches the WebAPK icon and only refreshes
it on its own schedule; uninstall and reinstall to pick up a new one immediately.

### The icon

`public/` holds three SVGs and five PNGs of the same barbell, all generated: edit the geometry
in [`scripts/make-icons.mjs`](./scripts/make-icons.mjs) and run `npm run icons` to rewrite them
together. The manifest lists the PNGs first on purpose — Chrome builds the installed app's icon
from a raster, and iOS reads nothing but `icon-180.png`.

## AI chat assistant

The chat can answer questions about your data and edit your plans. Two ways to power it:

- **Deployed app (GitHub Pages):** needs a **standard OpenAI key**, entered in Settings
  (stored on-device, sent directly to OpenAI).
- **Epic (Noggin) key:** the Epic LLM proxy (`llmproxy.epic.com`) is **internal-network only**,
  so it can't be reached from the public site or a cross-origin browser call. Use it by running
  the app **locally on Epic's network**:
  1. In `.env` set `OPENAI_API_KEY="<your Epic key>"` (already defaults `OPENAI_BASE_URL`
     to `https://llmproxy.epic.com/v1` and `OPENAI_MODEL=gpt-4o`).
  2. `npm run dev` and open the local URL.
  3. The Chat tab now routes through the Vite dev proxy (`/api/chat` in `vite.config.ts`),
     which injects the key server-side and relaxes TLS for `*.epic.com`. The key never enters
     the browser bundle. (`.env` is gitignored — never commit your key.)

### Chat on your phone (installed app + Epic key)

The Epic proxy is internal-only, so the deployed site can't call it — only a computer on Epic's
network can. The installed phone app therefore sends chat **to your computer**, which forwards it:
phone → Cloudflare → your dev server → Epic proxy. Only the computer needs Epic wifi/VPN.

The app stays installed from the GitHub Pages URL, which never changes. Your computer's tunnel
hostname *does* change every run, so the dev server publishes its current address to the Apps Script
backend and the app looks it up. You never see the churn.

```
install once:  https://<you>.github.io/workout-tracker/     (permanent)
each run:      dev:tunnel → random trycloudflare hostname
               └─ published to the Apps Script config sheet
phone chat:    reads that address → POSTs /api/chat → Epic proxy
```

**One-time setup.** Pick a token — `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
— and put that same value in three places:

1. `CHAT_SHARED_SECRET` in `.env`.
2. The Apps Script project: **Project Settings → Script properties → Add**, name `CHAT_SHARED_SECRET`.
   Redeploy the web app so the `chat_endpoint` route in `SimpleBackend.gs` goes live.
3. The phone: **Settings → coach token**. It should then read `coach found ✓` while your computer is
   running. This also brings the Chat tab back on the phone.

The token is why the setup is safe to hang off a public backend: the `/exec` URL is baked into the
web bundle, so without it anyone could read your live tunnel address and spend the Epic key behind
it. Both reading the address and calling the proxy require it, and the dev server refuses
cross-origin chat without it.

**Then, every time you want the coach:** run `npm run dev:tunnel` on your computer before you leave.
It needs [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
on `PATH`, in your home directory, or at `CLOUDFLARED_PATH`. The computer has to stay awake and
connected — asleep, chat says it can't reach the coach and everything else in the app keeps working.

**Other ways in:**

- **Same wifi, no install:** `npm run dev:host`, then open the printed **Network** URL on your phone.
- **The dev server itself, from anywhere:** `npm run dev:tunnel` also shows its URL as a QR under
  **Settings → open on your phone**. Loading that gives you the live dev build rather than the
  installed app — handy for testing, but the address changes each run so don't install from it.
- **No computer at all:** put a standard OpenAI key in Settings and chat talks to OpenAI directly.

## Report bugs from the chat, and auto-fix them

You can file a bug or feature request about the app straight from the coach chat,
and — optionally — let the locally-installed `claude` pick those issues up and fix
them on its own.

### Reporting (always available)

Tell the coach something's broken and ask it to file it — *"the rest timer doesn't
reset between sets, file that as a bug"*. It calls a `report_issue` tool, a grey
"filed #N" line appears in the chat, and a GitHub issue is created on
`chase-grey/workout-tracker` labelled `from-app`, with your userAgent, the current
URL, and the last few chat turns attached so it's actionable.

The report goes through the **always-on Apps Script backend** (not your laptop), so
it works even when your computer is asleep. It's gated by the same coach token as
the chat, so only you can file.

**One-time setup:**

1. Create a GitHub **fine-grained PAT** at
   [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta),
   scoped to **only** `chase-grey/workout-tracker`, with **Issues: Read/Write**.
2. Add it to the Apps Script project: **Project Settings → Script properties → Add**,
   name `GITHUB_ISSUE_TOKEN`.
3. Redeploy the web app so the `report_issue` route in `SimpleBackend.gs` goes live
   (`npm run deploy:backend`, then redeploy `/exec` — see [BACKEND.md](./BACKEND.md)).

### Auto-fixing (opt-in, laptop must be awake)

`npm run autofix` watches for issues labelled `auto-fix` and hands each to your
local `claude`, which fixes it in a **dedicated git worktree** (`.autofix/`, never
your live checkout), commits straight to `main`, comments the commit SHA, and closes
the issue. `main` auto-deploys, and the deploy workflow runs `npm test` first, so a
change that breaks tests fails the deploy instead of shipping.

It runs **locally, not as a GitHub Action**, on purpose: the `claude` here is signed
in with an Epic work account, and that credential must never go into a public repo's
Action secrets. The tradeoff is it only works while this machine is awake — which it
usually is when `dev:tunnel` is up for the phone coach, so `AUTOFIX=1 npm run
dev:tunnel` runs the fixer alongside the tunnel.

**One-time setup:**

1. Put the same fine-grained PAT in `.env` as `GITHUB_ISSUE_TOKEN` — the local fixer
   additionally needs **Contents: Read/Write** on it (to push to `main`).
2. Label an issue `auto-fix`, then run `npm run autofix` (or `AUTOFIX=1 npm run
   dev:tunnel`).

`AUTOFIX_PERMISSION` in `.env` controls how hands-off it is: `acceptEdits` (default)
lets `claude` edit files while the script handles git; `skip` passes
`--dangerously-skip-permissions` so it can run `npm test` itself before the commit
(more autonomous, riskier).

## Deploy

- **Frontend:** push to `main` → GitHub Actions builds and publishes to Pages
  (`.github/workflows/deploy.yml`). The Vite `base` is `/workout-tracker/` in
  production; rename `REPO` in `vite.config.ts` if the repo name differs.
- **Backend:** see [BACKEND.md](./BACKEND.md).

## Status

MVP: logging, rest timer, streaks + freeze credits, body weight, progress
charts, CSV export. **Post-MVP:** AI chat assistant, historical data import
(parser + confirmation UI).

## Structure

```
src/
  config/plan.ts        # the hardcoded workout plan (edit here)
  types/                # shared data model
  lib/                  # pure logic (streaks, epley, dates, progress, csv) + tests
  services/             # storage (localStorage) + api (Apps Script client)
  store/                # DataContext: state, optimistic writes, offline queue
  components/           # RestTimer, StreakBar, Sparkline, BottomNav
  features/today|progress|chat|settings/
SimpleBackend.gs        # Apps Script backend
deploy-backend.js       # clasp deploy helper
```
