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
- Nothing anyone types can run as a formula. Sheets treats a string that opens
  with `=` (and, typed by hand, `+`, `-` or `@`) as one, and every account's
  tabs sit in the same book as the `users` tab and its keys. So the script
  writes cells only through `addRow`, `writeRows` and `writeCell`, which mark
  such a string as text with a leading apostrophe. Sheets does not keep the
  apostrophe as part of the value, so the app reads back exactly what was
  typed. A new write path uses those three; `scripts/formulaBackend.test.mjs`
  fails on a raw `appendRow`, `setValue` or `setValues`.
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
| GET | `?route=account` | `user` | `{ name, owner, email }` (see Accounts) |
| GET | `?route=people` | `user` (the owner's) | `[{ name, email, createdAt, lastSeen, owner }]` |
| POST | `?route=register` | `{ email, password, name }` | `{ saved, token, name, owner }` |
| POST | `?route=login` | `{ email, password }` | `{ saved, token, name, owner }` |
| POST | `?route=claim_owner` | `{ secret, email, password }` | `{ saved, token, name, owner }` |
| POST | `?route=set_login` | `{ email, password }` + `user` | `{ saved }` |
| POST | `?route=join` | `{ invite, name, claim }` | `{ saved, token, name }` |
| POST | `?route=invite` | `{ secret }` | `{ saved, code }` |
| GET | `?route=cardio&since=YYYY-MM-DD` | — | `{id, date, kind, minutes?, distanceMi?}[]` |
| POST | `?route=cardio` | `{ id, date, kind, minutes?, distanceMi? }` or `{ id, deleted: true }` | `{ saved }` |
| POST | `?route=feedback` | `{ message, build }` | `{ saved }` |
| GET | `?route=save_errors&limit=N` | — | failed-save reports (owner only) |
| GET | `?route=settings` | — | settings blob, or `null` |
| POST | `?route=settings` | `{ settings: {…} }` | `{ saved, stale? }` |
| GET | `?route=share` | — | the summary my-brain reads, or `null` |
| POST | `?route=share` | `{ share: {…} }` | `{ saved }` |
| GET | `?route=issues&secret=…` | — | `TrackedIssue[]` |
| POST | `?route=report_issue` | `{ secret, title, body, area, context }` | `{ number, url }` |
| GET | `?route=issue_thread&secret=…&number=N` | — | `{ number, title, state, labels, comments }` |
| POST | `?route=answer_issue` | `{ secret, number, answer }` | `{ answered }` |
| POST | `?route=gcal_status` | — | `{ saved, available, connected }` (see Google Calendar sync) |
| POST | `?route=gcal_connect` | `{ returnUrl }` | `{ saved, url }`: Google's consent page for this account |
| POST | `?route=gcal_state` | `{ from, to }` | `{ saved, connected, events: [{id, pillar, date, title}], base }` |
| POST | `?route=gcal_apply` | `{ create, update, remove, base }` | `{ saved, connected, failed }` |
| POST | `?route=gcal_disconnect` | — | `{ saved }` |
| GET | `?state=…&code=…` (no `route`) | — | an HTML page: Google's redirect back from consent |

Every route except `version`, `join`, `register`, `login`, `claim_owner` and the four issue routes (and `invite`)
takes a `user` query parameter, the account key (see Accounts).

### Accounts

One deployment can host friends as well as the owner. The manifest scope is
`spreadsheets.currentonly`, so the script can only ever see the sheet it is bound
to; everyone's data therefore lives in that one spreadsheet, in tabs carrying a
per-user prefix. A user whose id is `ab12cd` has `uab12cd_workouts`,
`uab12cd_body_weight`, `uab12cd_cardio` and so on. The owner's tabs keep their
bare names, so nothing the owner already logged moved.

Four tabs belong to the book rather than to anyone in it and are never prefixed:
`users` (`token, id, name, created_at, email, pass_salt, pass_hash, owner, last_seen`), `invites` (`code, created_at, used_at,
used_by, claim, user_id`), `save_errors` and `feedback`. Failed-save reports from every account
land in `save_errors` with the account's name in a last `user` column, and
`save_errors` can only be read by the owner. `feedback` (`at, user, build,
message`) is where the app's feedback box writes.

Each request names its account with `?user=<key>`, on GET and POST alike:

- Blank or missing is the owner, which is what every request was before hosting —
  until the owner has an account row (below), after which it is refused.
- The `CHAT_SHARED_SECRET` script property is also the owner.
- A key found in the `users` tab is that user; the row marked `owner = yes` is
  the owner, on the bare tabs.
- Anything else throws `Unknown account`. It never falls back to the owner, so a
  mistyped key cannot read or write someone else's data.

Setting a `REQUIRE_ACCOUNT` script property to anything non-empty makes a blank
`user` throw `Sign in required` instead. Set it once the owner's own phone has
the owner key, so the open door is shut. `version` and `join` need no account;
the issue routes and `invite` carry their own `secret` and always act as the owner.

To add someone, the owner calls `POST ?route=invite` with `{ secret }` and gets an
eight-character code, good once. The friend sends `POST ?route=join` with
`{ invite, name, claim }` (the code is case-insensitive, the name up to 40 characters)
and gets back `{ saved, token, name }`; the token is their account key and the
only copy that exists to give them. `claim` is an id the phone mints for its
attempt and repeats on every retry: a join whose reply was lost is answered
again with the same token for the same claim, rather than refused as spent.
`GET ?route=account` returns `{ name, owner, email }`
for a key, which is how the app checks one that was pasted in.

### Email and password

Accounts are open: anyone can `POST ?route=register` with an email, a password
(8 characters or more) and a name, and gets a key back. An email is letters,
digits and `. _ % + -` before the `@`, never opening with `+`, `-` or `.`, then a
dotted host name; the app checks the same pattern (`src/lib/login.ts`). `login` trades the same
email and password for the key. The password itself is never stored: `pass_hash`
is SHA-256 run 1000 times over a per-account random `pass_salt` and the password
(Apps Script has nothing stronger built in). After 10 wrong passwords for one
email inside 15 minutes, `login` stops checking that email until the window
passes (`CacheService`). `register` with an email that is already an account's
is refused with `Could not create that account`, whatever the password: it
never checks a stored password and never returns an existing key, so it is no
way round that limit. The app answers that refusal by trying `login` with the
same email and password (`registerOrSignIn` in `src/lib/login.ts`), which is
how a phone whose reply was lost still ends up signed in.

The owner's account predates all this and has no row. `claim_owner` makes one,
proven by `CHAT_SHARED_SECRET`: the row is marked `owner = yes`, its key reaches
the bare tabs (so nothing moves), and from then on a request with no key is
refused. The app does this from the owner's old phone, which carries the secret
as its issue token. Calling it again resets the owner's email and password — the
secret is the owner's way back in. `set_login` sets or changes the signed-in
account's own email and password, which is how an account made by invite gets
one.

Every request that resolves to a row stamps its `last_seen`, at most once an
hour per account. `GET ?route=people` lists every account for the owner, with
no keys or hashes in it.

Each user takes about a dozen tabs of their own, and one spreadsheet can only
hold so many, so the tab limit of the book is the ceiling on how many people it
can host.

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

`report_issue` locks the issue it creates. The thread is going to be read by the auto-fixer and
handed to a model, and on a public repo anyone can comment on an open issue; locked, only
collaborators can, which here is the token's own account — the one `answer_issue` posts as. The
fixer also drops every comment not by that account (see "What the fixer is allowed to do" in the
[README](./README.md)); the lock just stops the words arriving at all. A failed lock is logged
and the filing still succeeds, since throwing would have the app file the issue twice.

`issue_thread` and `answer_issue` are the question round-trip: the auto-fixer parks an issue it
can't act on under a `needs-input` label and comments its questions, the app reads that comment and
takes a reply, and `answer_issue` posts the reply and swaps the label back to `auto-fix` — which is
the handoff that puts the issue back in front of the fixer. Both refuse any issue not carrying
`from-app`: the token can write to every issue in the repo, and there's no reason these routes
should reach one the app didn't file.

### Google Calendar sync

Someone who schedules their week can keep it in step with a calendar in their
own Google account, both ways (`src/lib/calendarSync.ts` has the merge and says
what "both ways" means). The backend's part is narrow: it keeps each account's
Google refresh token, which a browser can't, and makes the calls the app's merge
decided on. It never decides anything itself, and it runs no timer: a change
made in Google is picked up when the app next opens, which is the only place it
could be seen.

- The link is one script property per account, `gcal_<account id>` (`gcal_owner`
  for the owner): `{ refresh, calendarId, base }`. `base` is the set of sessions
  both sides agreed on at the last sync. It is a property rather than a tab
  because it holds a credential.
- The scope is `calendar.app.created`: calendars this app made and the events on
  them. It cannot read a person's own calendar. The app makes one calendar,
  "Workout Tracker", on the first sync, marks its events with a private `wt`
  property, and ignores anything in that calendar without the mark.
- Disconnecting deletes that calendar from the person's account, revokes the
  token and deletes the property.
- `gcal_apply` only saves the new `base` when every Google call landed. A base
  that claimed an event Google never took would read, next sync, as that event
  deleted by hand, and take the day off in the app.

**Setting it up (once).** Until this is done `gcal_status` answers
`available: false` and the app doesn't offer the sync at all.

1. In Google Cloud Console, make a project, enable the **Google Calendar API**,
   and configure the OAuth consent screen: user type **External**, the scope
   `https://www.googleapis.com/auth/calendar.app.created`.
2. **Publish the app** ("In production"). Left in "Testing", Google expires
   every refresh token after seven days and only listed test users can connect.
   Unverified, it shows a "Google hasn't verified this app" screen and stops at
   100 users; submitting it for verification lifts both.
3. Create an **OAuth client ID** of type **Web application** whose authorised
   redirect URI is this deployment's `/exec` URL, exactly (the value of
   `DEFAULT_API_URL` in `src/config/backend.ts`).
4. In the Apps Script project, **Project Settings → Script properties**, set
   `GCAL_CLIENT_ID` and `GCAL_CLIENT_SECRET` from that client. Set
   `GCAL_REDIRECT_URI` to the same `/exec` URL too if the consent page reports a
   redirect mismatch; unset, the script uses its own service URL.

No new manifest scope is needed: the calls go out through `UrlFetchApp`, which
`script.external_request` already covers.

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
Rows land in the owner's `save_errors` tab, trimmed to the newest 300.
`GET ?route=save_errors&limit=N` reads them back newest first, and
`npm run save-errors` prints them. The route takes no lock, because a busy lock
is one of the failures it reports. It is owner-only: a joined user's key
gets `Owner only`, and a blank `user` is the owner. An older backend answers `Unknown route`, which the app ignores.

To ship a backend change without changing the `/exec` URL every device uses,
paste `SimpleBackend.gs` into the Apps Script editor, then **Deploy → Manage
deployments → (pencil) → Version: New version → Deploy**.
