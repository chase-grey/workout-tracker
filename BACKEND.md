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
| POST | `?route=notes` | `{ session, exercise, notes }` | `{ saved }` |
| POST | `?route=bodyweight` | `{ date, weightLbs }` | `{ saved }` |
| GET | `?route=vitamins&since=YYYY-MM-DD` | — | `{date, vitamins, iron, loggedAt?}[]` |
| POST | `?route=vitamins` | `{ date, vitamins, iron, loggedAt }` | `{ saved }` |
| GET | `?route=whitening&since=YYYY-MM-DD` | — | `{date, strips, loggedAt?}[]` |
| POST | `?route=whitening` | `{ date, strips, loggedAt }` | `{ saved }` |
| GET | `?route=settings` | — | settings blob, or `null` |
| POST | `?route=settings` | `{ settings: {…} }` | `{ saved, stale? }` |
| GET | `?route=issues&secret=…` | — | `TrackedIssue[]` |
| POST | `?route=report_issue` | `{ secret, title, body, area, context }` | `{ number, url }` |
| GET | `?route=issue_thread&secret=…&number=N` | — | `{ number, title, state, labels, comments }` |
| POST | `?route=answer_issue` | `{ secret, number, answer }` | `{ answered }` |

### Vitamins

A `vitamins` tab, one row per date, holding the day's two doses as booleans: the
multivitamin and the iron that rides along every other day. Upserted by date — a
day is sent whole, so a new row for a date replaces it rather than appending, and
a backfill that carries no `loggedAt` keeps the timestamp already stored.

### Whitening

A `whitening` tab, one row per date, holding whether that day's whitening strip
went on. Upserted by date on exactly the same terms as the pills — a day is one
boolean, so the row is replaced rather than appended, and a backfill keeps the
`loggedAt` already stored.

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
