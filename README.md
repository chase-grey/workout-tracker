# Workout Tracker

A mobile-first PWA for the gym and the stretch mat: quick one-handed workout
logging, strength progress, flexibility measurement from a photo, body weight and
composition, and the daily habits around a bulk. Data lives in a Google Sheet via
a Google Apps Script backend. Deployed as a static site on GitHub Pages.

**Live app, and where you install it from:**
**https://chase-grey.github.io/workout-tracker/**

> Full product spec: Obsidian vault → `20 Projects/Personal/Workout Tracker.md`.
> Working notes for agents: [CLAUDE.md](./CLAUDE.md). Second stretch routine's
> spec: [HEAD-TO-TOE.md](./HEAD-TO-TOE.md).

## Stack

- React 19 + TypeScript + Vite, Tailwind CSS v4, dark mode only
- Recharts for progress charts, `react-icons` for glyphs
- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) for pose landmarks, runtime
  and model served from our own origin — see
  [Camera measurement](#camera-measurement-and-the-pose-model)
- PWA (installable, offline-tolerant write queue) via `vite-plugin-pwa`
- Vitest for the pure logic in `src/lib`, oxlint for lint
- Backend: Google Apps Script web app over a Google Sheet (see [BACKEND.md](./BACKEND.md))

## What's in it

**Today** — start a push, pull, or full-body session (push alternates an A/B
variant), or one of the two stretch routines (side split / head to toe), whichever
was done last dimmed so the other reads as up next. Guided sessions advance on a
tap anywhere: rest timer with animated shapes, get-into-position counts, paced-rep
and hold timers, pause curtain, per-set grading, a recap when you finish. Plus this
week at a glance, streak with freeze credits, body weight, the daily habits
(food log against an on-pace calorie target), and a progress
photo nudge when one is due.

**Progress** — per-exercise charts (est. 1RM, top set, volume), body weight, body
fat and waist, weekly calorie surplus, time spent, a muscle-coverage avatar, lift
and flexibility ladders against strength standards, a goals panel, and monthly /
yearly reviews.

**Coach** — a chat that answers questions about your own data, proposes edits to
your workout plan or stretch routines for you to approve, and files bugs about the
app itself (see [Report bugs](#report-bugs-from-the-chat-and-auto-fix-them)). The tab
is off until you switch it on in Settings and give it an API key — OpenAI, Anthropic,
OpenRouter, or any OpenAI-compatible server. See [AI chat assistant](#ai-chat-assistant).

**Settings** — sync and the build stamp, the plan editor, restoring a coach-edited
stretch routine, the issue token, the issues you've filed and what the fixer did with
them, the QR that opens the dev server on your phone, the coach switch, and the coach's
provider, key and model.

## Develop

```bash
npm install
npm run dev        # local dev server
npm run dev:phone  # bind the LAN for a phone + run the auto-fixer
npm test           # vitest — the pure logic in src/lib (one test file per module)
npm run lint       # oxlint
npm run build      # typecheck + production build
```

The Apps Script `/exec` URL is baked in as `DEFAULT_API_URL`
(`src/config/backend.ts`), so a fresh install connects with nothing to paste. A
`VITE_API_URL` in `.env`, or an `apiUrl` in saved settings, overrides it — point
those at your own deployment. Copy `.env` from `.env.example` for the keys the dev
server needs (coach, auto-fixer); it's gitignored.

## Install on your phone

The deployed site is a PWA, so it installs from the browser — no store, no packaging step.

**https://chase-grey.github.io/workout-tracker/**

- **Android:** open that URL in **Chrome** → menu → **Install app**. Chrome mints a WebAPK,
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

### Camera measurement and the pose model

A stretch session can measure your split angle from a photo: the camera screen
auto-captures, MediaPipe finds your body's landmarks, and the angle editor opens
with its handles already placed (drag them if they're off).

The wasm runtime and the `pose_landmarker_full` model are served from **this app's
own origin**, not a public CDN — `mediapipeAssets()` in `vite.config.ts` copies the
runtime out of `node_modules` and fetches the model once at build time into the
`dist/mediapipe/` the Pages deploy publishes. So measuring on the installed app
needs nothing but the app: no CDN, no tunnel, no computer of yours awake.

The catch is size — about 20 MB across the runtime and the model, downloaded the
first time you measure and then held by the service worker, after which measuring
works offline. Take that first measurement on wifi you trust. A download cut short
poisons the cache, and because the cache is read cache-first every later attempt
reads the same wreckage, so `getLandmarker` in `src/lib/pose.ts` drops the
`pose-detector` cache and retries once before giving up.

If it does give up, the angle editor says *"couldn't load the pose model"* and hands
you guessed handles — the measurement still gets logged, you just place the points
yourself.

## AI chat assistant

The chat can answer questions about your data, propose edits to your plan and stretch
routines, and file bugs about the app. The Coach tab starts hidden on every device: Settings
has a **coach** switch, and turning it on shows the tab and the key fields together. Two ways
to power it:

- **Deployed site, with the coach switched on:** pick a provider in Settings and enter
  **your own key** for it (stored on-device, never synced, sent directly to that service),
  with a model field beside it that takes any id the service knows. The presets are
  **OpenAI**, **Anthropic** (via the official SDK, straight from the browser) and
  **OpenRouter**; **other** takes the base URL of anything that speaks OpenAI's
  chat-completions wire (a local server, Groq, Mistral, …). Google's compatible endpoint
  isn't offered because it refuses browser calls. The provider table is
  `src/lib/aiProvider.ts`; the Anthropic translation is `src/lib/anthropicWire.ts`.
- **Epic (Noggin) key:** the Epic LLM proxy (`llmproxy.epic.com`) is **internal-network only**,
  so it can't be reached from the public site or a cross-origin browser call. Use it by running
  the app **locally on Epic's network**:
  1. In `.env` set `OPENAI_API_KEY="<your Epic key>"` (already defaults `OPENAI_BASE_URL`
     to `https://llmproxy.epic.com/v1` and `OPENAI_MODEL=gpt-4o`).
  2. `npm run dev`, open the local URL, and switch the coach on in Settings (no key needed).
  3. The Chat tab now routes through the Vite dev proxy (`/api/chat` in `vite.config.ts`),
     which injects the key server-side and relaxes TLS for `*.epic.com`. The key never enters
     the browser bundle. (`.env` is gitignored — never commit your key.)

### Chat on your phone (Epic device, on Epic private wifi)

The Epic proxy is internal-only, so the deployed site can't call it — only a computer on Epic's
network can. So the phone doesn't call the coach: it **loads the dev server itself**, over the
LAN. `/api/chat` is then same-origin, the Epic key stays in the `.env` on that computer, and
there's nothing to publish, no token to share, and no public hostname anywhere in it.

```
computer:  npm run dev:phone  → binds the LAN, prints its address
phone:     scan the QR under Settings → "open on your phone"
           → loads that dev server → /api/chat → Epic proxy
```

**What it needs, and it's the whole of the catch:** an **Epic-managed phone**, joined to **Epic
private wifi**, on the same network as the computer. That's the entire reach. From cell data,
home wifi, or a gym on guest wifi the address doesn't answer and there is no coach at all — the
installed app keeps logging every workout, stretch, and measurement — it just has no coach,
and so no way to file or answer an issue from the phone either. A key of your own brings a
coach back anywhere, talking to its service rather than to Epic, behind the same Settings
**coach** switch.

What the phone loads this way is the dev build, not the installed app: handy for testing the real
thing, but don't install from it — the address changes with the network you're on.

The QR names one of this machine's addresses, and a laptop has several — wifi, ethernet, a VPN
client, a Hyper-V or WSL switch. The virtual ones are dropped by name and wifi is preferred, but
if the QR ever names the wrong adapter, pin it with `SHARE_URL` in `.env`.

`npm run dev:phone` runs the auto-fixer alongside the dev server, so the two below come up
together by default.

## Report bugs from the chat, and auto-fix them

You can file a bug or feature request about the app straight from the coach chat,
and — optionally — let the locally-installed `claude` pick those issues up and fix
them on its own.

### Reporting (always available)

Tell the coach something's broken and ask it to file it — *"the rest timer doesn't
reset between sets, file that as a bug"*. It calls a `report_issue` tool, a grey
"filed #N" line appears in the chat, and a GitHub issue is created on
`chase-grey/workout-tracker` labelled `from-app` **and `auto-fix`**, with your
userAgent, the current URL, and the last few chat turns attached so it's actionable.
The `auto-fix` label hands it straight to the fixer below (if it's running) — so a
coach-filed bug fixes itself with no extra step. The issue is locked the moment it's
filed: its thread is going to be read to a model, and on a public repo anyone can
comment on an open issue. Locked, only you can.

The report goes through the **always-on Apps Script backend** (not your laptop), so
it works even when your computer is asleep — and unlike the coach, from any network.
It's gated by a shared token, so only you can file.

**One-time setup:**

1. Create a GitHub **fine-grained PAT** at
   [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta),
   scoped to **only** `chase-grey/workout-tracker`, with **Issues: Read/Write**.
2. Add it to the Apps Script project: **Project Settings → Script properties → Add**,
   name `GITHUB_ISSUE_TOKEN`.
3. Pick a token —
   `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` —
   and add it as a second script property named `CHAT_SHARED_SECRET`. Enter the same
   value on the phone under **Settings → issue token**. The `/exec` URL is baked into
   the public web bundle, so without this anyone holding the bundle could file issues
   on the repo, or read the ones already filed. (The name is historical: it once
   reached the coach too.)
4. Redeploy the web app so the `report_issue` route in `SimpleBackend.gs` goes live
   (`npm run deploy:backend`, then redeploy `/exec` — see [BACKEND.md](./BACKEND.md)).

### Auto-fixing (opt-in, laptop must be awake)

`npm run autofix` watches for issues labelled `auto-fix` and hands each to your
local `claude`, which writes the fix in a **dedicated git worktree** (`.autofix/`,
never your live checkout). The harness then audits the change, typechecks it, runs
the suite in a sandbox, pushes it to `autofix/issue-<n>` and **opens a pull
request**. Merging the PR is yours to do — GitHub's mobile app is enough — and the
merge closes the issue and deploys. Until then the issue reads `review` in the app.

It runs **locally, not as a GitHub Action**, on purpose: the `claude` here is signed
in with an Epic work account, and that credential must never go into a public repo's
Action secrets. The tradeoff is it only works while this machine is awake — which it
usually is when `dev:phone` is up for the phone coach, so `npm run dev:phone` runs
the fixer alongside the dev server by default (`AUTOFIX=0` opts out).

**One-time setup:**

1. Put the same fine-grained PAT in `.env` as `GITHUB_ISSUE_TOKEN` — the local fixer
   additionally needs **Contents: Read/Write** (to push the fix branch) and **Pull
   requests: Read/Write** (to open the PR).
2. Run `npm run autofix` (or `npm run dev:phone`). Coach-filed issues
   already carry the labels it looks for. To hand it an issue raised any other way,
   open the issue yourself and label it both `from-app` and `auto-fix` — it will not
   touch an issue opened by anyone else, whatever its labels.
3. To send a reviewed fix back for another go, take `autofix-review` off the issue
   and put `auto-fix` back. The next run force-pushes the same branch, and the open
   PR follows it.

### What the fixer is allowed to do

The fixer runs a model on text typed into a public GitHub issue, on a work PC that
holds far more than this project. So every run is built as if the issue were
hostile, and the controls are in the harness, not in the prompt:

| | |
|---|---|
| **Who is heard** | Only issues opened by the token's own account and labelled `from-app`; only that account's comments in the thread. Everyone else's words never reach the model. |
| **What the model can do** | `claude --restricted`: no Bash, no WebFetch, no MCP servers (`--strict-mcp-config`), none of your settings files (so no global allow-list can hand it a shell), and `--tools` pinned to Read, Edit, Write, Glob, Grep. File tools are fenced to the worktree, junctions included, so the borrowed `node_modules` and the `.env` two directories up are unreachable. |
| **What it can see** | The worktree and the issue. The `.env` this script loads is stripped from the child's environment, with anything else named like a credential. |
| **What may change** | `src/`, `public/`, `index.html` and the top-level `.md` docs. A diff that touches anything else — build config, `scripts/`, workflows, `.claude/`, `CLAUDE.md`, the backend — adds a symlink, imports a Node built-in into browser code, or contains anything credential-shaped is rejected **before** anything in the tree is executed. |
| **How the tests run** | Under Node's permission model: reads confined to the worktree and `node_modules`, writes to one scratch dir, no child processes. The flags are forwarded into vitest's worker threads, which otherwise run unsandboxed. |
| **What ships** | Nothing, on its own. The fix is a branch and a pull request; `main` moves when you merge. |

What this does not cover: a test can still open a network connection (Node's
permission model has no network switch), and the sandboxed run is only `src/**`
tests — `scripts/` tests can't have changed, and the deploy runs the whole suite
again. The merge is the last gate, and it is a human one.

### When the fixer needs to ask you something

A vague report used to be a dead end — `claude -p` has no way to ask a question, so
the run just ended and the issue sat there `stalled`. Now it can ask, and you answer
on your phone without ever opening a terminal.

```
fixer can't act    → comments its questions, labels the issue `needs-input`
your phone         → dot on the settings tab; the issue reads "asks"
tap it             → the coach chat opens with the question above the composer
you reply          → posted as a comment, label swaps back to `auto-fix`
next poll (≤60s)   → the fixer picks it up again, thread and all
fix written        → pushed as a PR, issue reads "review" until you merge
```

Nothing is resumed from a stored Claude session: each attempt is a fresh run given
the whole comment thread, so the conversation survives restarting the fixer, and a
question answered days later still lands with its context intact.

Answering doesn't need the laptop awake to *reach* GitHub — it goes through the same
always-on Apps Script backend as filing, and the fix waits until the fixer is running
again. It does need a coach tab to type into, which the installed phone app doesn't
have (see [AI chat assistant](#ai-chat-assistant)) — so in practice you answer from the
dev-server copy or from a computer.

This needs the two extra backend routes (`issue_thread`, `answer_issue`), so
**redeploy the Apps Script web app** if you set the reporting up before this existed.
The token needs nothing new.

## Deploy

- **Frontend:** push to `main` → GitHub Actions builds and publishes to Pages
  (`.github/workflows/deploy.yml`), live at
  [chase-grey.github.io/workout-tracker](https://chase-grey.github.io/workout-tracker/).
  The workflow runs `npm test` before it builds, so a change that breaks tests
  fails the deploy instead of shipping. The Vite `base` is `/workout-tracker/` in
  production; rename `REPO` in `vite.config.ts` if the repo name differs.
- **Backend:** see [BACKEND.md](./BACKEND.md).

Settings shows the commit and build time baked into the running bundle — the
quickest way to tell whether a phone is still on a stale cached copy. When a
feature is missing on the phone, check the deploy before the code.

## Status

In daily use. Logging, rest timer, streaks with freeze credits, body weight and
composition, progress charts, goals and ladders, monthly/yearly reviews, the two
stretch routines with camera measurement, daily habits, the coach chat, and
in-app bug reporting with local auto-fixing are all shipped.

Known gaps: `npm test` covers only the pure logic in `src/lib` — there are no
component or session-flow tests, which is why the two guided sessions can diverge
silently (see [CLAUDE.md](./CLAUDE.md)). Historical import exists as a parser
(`src/lib/parseImport.ts`) with no UI wired to it.

## Structure

```
src/
  config/               # plan.ts (the workout plan), flexPlan/flexRoutines,
                        #   body.ts, photos.ts, backend.ts — data, edited by hand
                        #   or by an approved coach proposal
  types/                # shared data model
  lib/                  # pure logic + a test file each: streaks, epley, dates,
                        #   progress, goals, calories, flex/split angles, pose,
                        #   session flow, celebrations, rest-timer geometry,
                        #   plus the shared hooks (useWakeLock, usePressAction, …)
  services/             # storage (localStorage), api (Apps Script client),
                        #   openai (coach), issues (GitHub via the backend)
  store/                # DataContext: state, optimistic writes, offline queue;
                        #   CelebrationContext; useTrackedIssues
  components/           # RestTimer, RhythmGuide, HoldTimer, GetReady, overlays,
                        #   BottomNav, Sparkline, Confetti, …
  features/
    today/              # TodayTab, ActiveSession (the lift session), habits,
                        #   weight + measurement sheets, this week, streak history
    flex/               # StretchSession, CameraMeasure, AngleEditor, PhotoStep
    progress/           # ProgressTab, charts, GoalsPanel, ladders, MuscleAvatar
    chat/               # ChatTab (coach, plan edits, issue reporting)
    settings/           # SettingsTab, PlanEditor, PhoneLink
    setup/              # first-run HeightSetup
scripts/
  autofix.mjs           # the issue → claude → commit fixer
  dev-phone.mjs         # dev server bound to the LAN + the fixer
  make-icons.mjs        # regenerates every icon in public/
  seed-*.ts             # one-off data seeding
SimpleBackend.gs        # Apps Script backend
deploy-backend.js       # clasp deploy helper
```
