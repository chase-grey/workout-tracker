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

   **A. clasp (scripted, the routine path):**
   ```bash
   npm install -g @google/clasp
   clasp login --user workout        # the Google account that owns the sheet
   echo CLASP_USER=workout >> .env   # clasp keeps named logins; this picks it
   npm run deploy:backend -- --script-id <id>   # once: Project settings → Script ID
   npm run deploy:backend                       # every time after
   ```
   The first deployment still has to be made in the editor (step B) so there is
   an `/exec` URL to point at; after that `npm run deploy:backend` pushes the
   file, cuts a version, moves that **same deployment** onto it (`clasp
   redeploy`, which is what the editor's "New version" does, so the URL never
   changes) and then asks the live URL for its version to prove it took.

   **B. Manual:** paste `SimpleBackend.gs` and `appsscript.json` into the Apps
   Script editor, then **Deploy → New deployment → Web app** with
   **Execute as: Me** and **Who has access: Anyone**. Copy the `/exec` URL.
   For every later update: **Deploy → Manage deployments → ✎ → Version: New
   version → Deploy**. A *New deployment* instead makes a second web app at a
   new URL, and the phone goes on talking to the old one.

4. **Point the app at it.** Paste the `/exec` URL into the app's **Settings**
   screen (or set `VITE_API_URL` in `.env` / the `VITE_API_URL` repo secret to
   bake it into the build).

## Notes

- POSTs use `text/plain` so the browser treats them as CORS "simple requests"
  and skips a preflight Apps Script can't answer. The body is JSON.
- Apps Script `/exec` responses are readable cross-origin (from GitHub Pages)
  for these simple requests — no custom CORS headers are set server-side.
- ⚠️ For a routine update, never `clasp deploy` (create-deployment): it makes a
  new web app at a new URL. `npm run deploy:backend` uses `clasp redeploy`
  against the existing deployment, and verifies the live version afterwards.

## Versioning

The app and this file ship from one commit but deploy separately, and the
backend's deploy is the one somebody has to do by hand. Between the two, a write
the new app makes can be one the old backend rejects; the client rightly keeps
it queued, and for a month in autumn 2026 all anyone saw of that was "Couldn't
save" on a phone. So the gap is now measured:

- `SimpleBackend.gs` declares `BACKEND_VERSION` and answers it at
  `GET ?route=version`. A backend too old to have the route counts as **0**.
- The app ships the version it needs in `src/config/backendVersion.ts`, next to
  a fingerprint of this file at that version. **`npm run backend:stamp`** bumps
  both; `scripts/backendVersion.test.mjs` fails when the file changed and the
  number didn't, so a backend change cannot ship unstamped.
- After every sync the app asks the live backend its version
  (`store/useBackendVersion.ts`). When it's lower, the Today tab and Settings
  show **"Backend is behind"** with both numbers, until a sync says otherwise.
- The Pages workflow's last job runs `scripts/check-backend.mjs` and goes red
  when the backend answering is older than the app it just shipped.

The compatibility rules below still hold; the version is how a client says
"newer than you" by number instead of by the shape of an error. The order of
operations for a change that needs new backend behaviour is unchanged: stamp,
`npm run deploy:backend`, then push the commit.

## API

### Compatibility and recovery

Keep existing routes and fields compatible when deploying either side first.
New fields must be optional for old clients; new routes must fail explicitly on
old servers. Never return success for a write that was ignored. Changes that
require new server behavior should deploy the backend first.

The client retains writes in `wt.queue` until it receives a positive numeric
`saved` acknowledgment (the full row count for workout batches). Unknown queued
types survive app rollbacks for a newer version to retry. Requests time out after
30 seconds; pending writes retry on startup, reconnection, foregrounding, or
**Retry now**. A visible notice offers a JSON recovery download. Keep browser
storage intact until the pending notice clears; downloads can be retained for
manual recovery but are not automatically imported.

Workout retries use `(session_id, exercise, set_number)` as their identity.
The backend acknowledges rows already stored without appending duplicates.
Deploy this backend update to enable that protection; older backends can still
append duplicate rows on retries. Old clients need no new request fields.
Failed workout saves and saves made during a fetch remain visible locally.

Publishing the frontend through GitHub Pages does not deploy Apps Script; update
the backend separately using the deployment instructions above.

| Method | Route | Body / params | Returns |
|---|---|---|---|
| GET | `?route=version` | — | `{ version }` (see Versioning) |
| GET | `?route=workouts&since=YYYY-MM-DD` | — | `WorkoutRow[]` |
| GET | `?route=bodyweight&since=YYYY-MM-DD` | — | `{date, weightLbs}[]` |
| POST | `?route=session` | `{ rows: WorkoutRow[] }` | `{ saved }` |
| POST | `?route=import` | `{ rows: WorkoutRow[] }` | `{ saved }` |
| POST | `?route=notes` | `{ session, exercise, notes }` | `{ saved }` |
| POST | `?route=bodyweight` | `{ date, weightLbs }` | `{ saved }` |
| GET | `?route=settings` | — | settings blob, or `null` |
| POST | `?route=settings` | `{ settings: {…} }` | `{ saved, stale? }` |
| GET | `?route=issues&secret=…` | — | `TrackedIssue[]` |
| POST | `?route=report_issue` | `{ secret, title, body, area, context }` | `{ number, url }` |
| GET | `?route=issue_thread&secret=…&number=N` | — | `{ number, title, state, labels, comments }` |
| POST | `?route=answer_issue` | `{ secret, number, answer }` | `{ answered }` |

### Notes

The one route that edits workout rows instead of appending them. A note belongs
to the exercise log rather than to a set, so the app writes the same string onto
every set row of that exercise and this rewrites them together — which is what
lets a discomfort flag be added to a session that was already saved. `session` is
the session id, or the date for rows written before ids existed. Matching no rows
is an error, so the app keeps the write queued and retries.

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

### Issues

The four issue routes are the only authenticated ones here: each takes a `secret` checked against a
`CHAT_SHARED_SECRET` **script property** (Project Settings → Script properties), because the
`/exec` URL above is public and baked into the web bundle — without it anyone holding the bundle
could file issues on the repo, or read the ones already filed. Missing, they throw rather than
failing open. The name is historical: the same token once brokered the chat coach's public address
for the phone, which it no longer does (see "Chat on your phone" in the [README](./README.md)).

Past that they are a thin proxy onto the GitHub API, so a bug filed from the coach chat lands
even when the laptop running the auto-fixer is asleep. They need a `GITHUB_ISSUE_TOKEN` script
property — a fine-grained PAT scoped to this one repo with Issues: Read/Write — and the same
`CHAT_SHARED_SECRET` as the chat routes, for the same reason.

`issue_thread` and `answer_issue` are the question round-trip: the auto-fixer parks an issue it
can't act on under a `needs-input` label and comments its questions, the app reads that comment and
takes a reply, and `answer_issue` posts the reply and swaps the label back to `auto-fix` — which is
the handoff that puts the issue back in front of the fixer. Both refuse any issue not carrying
`from-app`: the token can write to every issue in the repo, and there's no reason these routes
should reach one the app didn't file.

### Body fat readings

Deploy the updated `SimpleBackend.gs` to enable scale body fat readings. The
`measurements` sheet automatically gains `body_fat_pct` and `abs_visibility`
columns after the existing columns. POST accepts `{date, bodyFatPct}` without
waist or neck and merges supplied fields with the existing row for that date.
Percentages must be greater than 0 and less than 100. The response includes
`bodyFatSupported: true`; clients keep readings pending until that acknowledgment
arrives, so an older backend cannot silently discard the new field.

### Failed-save reports

When the outbox fails to deliver a write, the app posts `save_error` with the
error, its build, the queue depth and the queued write itself. It sends at most
one report per write and error every six hours (`src/lib/saveErrorReport.ts`).
Rows land in a `save_errors` tab, trimmed to the newest 300.
`GET ?route=save_errors&limit=N` reads them back newest first, and
`npm run save-errors` prints them. The route takes no lock, because a busy lock
is one of the failures it reports. Like the other read routes it is
unauthenticated; the payloads are workout data the `workouts` route already
serves. An older backend answers `Unknown route`, which the app ignores.

To ship a backend change without changing the `/exec` URL every device uses,
paste `SimpleBackend.gs` into the Apps Script editor, then **Deploy → Manage
deployments → (pencil) → Version: New version → Deploy**.
