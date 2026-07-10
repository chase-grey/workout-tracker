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
