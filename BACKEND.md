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
