# Backend — Google Sheets via Apps Script

The app stores everything in a single Google Sheet, reached through a Google
Apps Script web app (`SimpleBackend.gs`). No service account, no server to host.

## One-time setup

1. **Create the sheet.** New Google Sheet named e.g. `Workout-Backend`. Tabs
   (`workouts`, `body_weight`) are created automatically on first write, so you
   don't have to add them by hand.

2. **Attach the script.** In the sheet: **Extensions → Apps Script**. This makes
   a *container-bound* project (so `SpreadsheetApp.getActiveSpreadsheet()`
   resolves to your sheet).

3. **Deploy.** Two options:

   **A. clasp (scripted):**
   ```bash
   npm install -g @google/clasp
   clasp login
   # Put the script's ID (from its URL) into .clasp.json:
   #   { "scriptId": "…", "rootDir": "." }
   npm run deploy:backend
   ```

   **B. Manual:** paste `SimpleBackend.gs` and `appsscript.json` into the Apps
   Script editor, then **Deploy → New deployment → Web app** with
   **Execute as: Me** and **Who has access: Anyone**. Copy the `/exec` URL.

4. **Point the app at it.** Paste the `/exec` URL into the app's **Settings**
   screen (or set `VITE_API_URL` in `.env` / the `VITE_API_URL` repo secret to
   bake it into the build).

## Notes

- POSTs use `text/plain` so the browser treats them as CORS "simple requests"
  and skips a preflight Apps Script can't answer. The body is JSON.
- Apps Script `/exec` responses are readable cross-origin (from GitHub Pages)
  for these simple requests — no custom CORS headers are set server-side.
- ⚠️ **Never** run `clasp deploy --deploymentId <id>` against an existing
  deployment — it turns the deployment into a library. Make a *new* deployment,
  or redeploy from the Apps Script UI.

## API

| Method | Route | Body / params | Returns |
|---|---|---|---|
| GET | `?route=workouts&since=YYYY-MM-DD` | — | `WorkoutRow[]` |
| GET | `?route=bodyweight&since=YYYY-MM-DD` | — | `{date, weightLbs}[]` |
| POST | `?route=session` | `{ rows: WorkoutRow[] }` | `{ saved }` |
| POST | `?route=import` | `{ rows: WorkoutRow[] }` | `{ saved }` |
| POST | `?route=bodyweight` | `{ date, weightLbs }` | `{ saved }` |
| GET | `?route=settings` | — | settings blob, or `null` |
| POST | `?route=settings` | `{ settings: {…} }` | `{ saved, stale? }` |
| GET | `?route=chat_endpoint&secret=…` | — | `{ url, updatedAt }` |
| POST | `?route=chat_endpoint` | `{ url, secret }` | `{ saved }` |

### Settings

A `config` row holding the app's settings, above all the goals the user has **committed** to (see
`src/lib/goalLock.ts`). Everything else the app shows can be recomputed from the logged rows; a
commitment can't, so leaving it in a phone's `localStorage` meant a reinstall destroyed it.

Each device keeps a full copy and merges on fetch rather than replacing — `src/lib/settingsSync.ts`
has the rules. Commitments merge *per goal*, newest lock winning, because whole-copy last-write-wins
lets a device that hasn't synced in a while erase a goal committed on the other one. For the same
reason a POST carrying an older `updatedAt` than the stored copy is declined with `{saved: 0, stale:
true}` — the one route here that deliberately stores nothing rather than throwing.

The API URL and the OpenAI/chat keys are **not** synced. This route is unauthenticated and the
`/exec` URL is public (see below), so a key stored here would be a key published.

### Chat endpoint

`chat_endpoint` is a `config` row holding the address of whichever computer is currently running
`npm run dev:tunnel`, so the installed phone app can find the chat coach behind a tunnel hostname
that changes every run. See "Chat on your phone" in the [README](./README.md).

Both directions require a `CHAT_SHARED_SECRET` **script property** (Project Settings → Script
properties). The `/exec` URL above is public and baked into the web bundle, so without the secret
anyone could read the live tunnel address — or publish one of their own and receive the chat. If the
property is missing, both routes throw rather than failing open.
