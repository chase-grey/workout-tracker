/**
 * Workout Tracker — Google Apps Script backend.
 *
 * A thin REST proxy over the bound Google Sheet. Deploy as a Web App
 * ("Execute as: Me", "Who has access: Anyone") and put the /exec URL into the
 * app's Settings (or VITE_API_URL at build time).
 *
 * Three rules hold across every write here:
 *   - Mutating routes run under `withLock` (see it for the race they lose).
 *   - A write that stores nothing THROWS rather than returning {saved: 0}. Apps
 *     Script can't set a status code, so a cheerful zero is indistinguishable
 *     from a real save: the client marks the row synced and drops it forever.
 *   - Cells are written only through `addRow`, `writeRows` and `writeCell`,
 *     never `appendRow` / `setValue` / `setValues` directly. Sheets runs a
 *     string that opens with = as a formula, and everyone's tabs and keys are in
 *     this one book (see plainText).
 *
 * One spreadsheet hosts several people. The manifest scope is
 * `spreadsheets.currentonly`, so a second spreadsheet per person is out; instead
 * each account's data tabs carry a prefix (`u<id>_workouts`) in this same book.
 * The owner's tabs keep their bare names, so the owner's data never moved. Every
 * request carries `?user=<token>` (blank = the owner); see resolveAccount.
 *
 * Tabs (created automatically on first write; per-account, so each is prefixed
 * `u<id>_` for a joined user):
 *   workouts:     session_id, date, day_type, exercise, set_number,
 *                 weight_lbs, reps, notes, is_historical, variant
 *                 (variant = which A/B slot of a Push + Core day the set was
 *                 trained in; blank for every other day and for imports)
 *   body_weight:  date, weight_lbs
 *   measurements: date, waist_in, neck_in, note
 *   durations:    date, kind, day_type, total_sec, rest_sec, routine  (per-session;
 *                 feeds Time-spent and the time-left estimate; `routine` names
 *                 which stretch routine a stretch session was)
 *   exercise_times: exercise, avg_active_sec, n  (per-exercise rolling averages
 *                 for time-left estimates; a sentinel exercise "__rest_ratio__"
 *                 row holds the pooled observed÷prescribed rest ratio, and the
 *                 legacy "__rest__" row holds pooled rest seconds — still written
 *                 for older clients, no longer served)
 *   config:       key, value  (one JSON blob per key: "plan", "settings")
 *   cardio:       id, date, kind, minutes, distance_mi  (one row per session; upsert by id)
 *
 * Owner-level tabs, never prefixed:
 *   users:        token, id, name, created_at  (who may sign in; see joinAccount)
 *   invites:      code, created_at, used_at, used_by, claim, user_id  (one-time codes; see mintInvite)
 *   save_errors:  at, build, route, write_id, message, pending, payload, user  (any
 *                 account's report of a write it couldn't deliver; see
 *                 appendSaveError)
 *   feedback:     at, user, build, message  (what a hosted user typed into the app)
 *
 * Routes:
 *   GET  ?route=version          -> { version: BACKEND_VERSION } (see the constant; no account)
 *   GET  ?route=account          -> { name, owner } for the `user` token sent
 *   POST ?route=join          body: { invite, name, claim } -> { saved: 1, token, name }
 *                 (spends an invite code and mints an account; no account needed)
 *   POST ?route=invite        body: { secret } -> { saved: 1, code }  (owner only, by secret)
 *   GET  ?route=workouts[&since=YYYY-MM-DD]
 *   GET  ?route=bodyweight[&since=YYYY-MM-DD]
 *   GET  ?route=measurements[&since=YYYY-MM-DD]
 *   GET  ?route=durations[&since=YYYY-MM-DD]
 *   GET  ?route=exercise_times   -> { active: { key: {avgSec,n} }, restRatio: {ratio,n} }
 *   GET  ?route=settings         -> the account's settings blob, or null (see getSettings)
 *   GET  ?route=share            -> the summary my-brain reads, or null (see getShare)
 *   POST ?route=share         body: { share: {…} }  (whole; the latest replaces the last)
 *   GET  ?route=cardio[&since=YYYY-MM-DD] -> [{ id, date, kind, minutes?, distanceMi? }]
 *   POST ?route=cardio        body: { id, date, kind, minutes?, distanceMi? } (upsert by id)
 *                 or { id, deleted: true } (removes it; fine if already gone)
 *   POST ?route=feedback      body: { message, build } (lands in the owner's feedback tab)
 *   GET  ?route=save_errors[&limit=N] -> failed-save reports, newest first (owner only; see getSaveErrors)
 *   POST ?route=save_error    body: { build, route, writeId, message, pending, payload }
 *                 (a write the outbox couldn't deliver, reported by the device; see appendSaveError)
 *   POST ?route=settings      body: { settings: {…} }  (whole; declines a stale copy)
 *   GET  ?route=issues&secret=…  -> [{ number, title, url, state, area, createdAt, closedAt }]
 *                 (the app-filed GitHub issues + their open/closed state; see listIssues)
 *   POST ?route=report_issue    body: { secret, title, body, area, context }
 *                 -> { number, url }  (files a GitHub issue; see createIssue)
 *   GET  ?route=issue_thread&secret=…&number=N
 *                 -> { number, title, state, labels, comments: [{id,author,body,createdAt}] }
 *                 (one issue's comment thread — how the fixer's question reaches the app)
 *   POST ?route=answer_issue    body: { secret, number, answer }
 *                 -> { answered: N }  (comments the answer and hands the issue back
 *                 to the auto-fixer; see answerIssue)
 *   POST ?route=session       body: { rows: WorkoutRow[] }
 *   POST ?route=import        body: { rows: WorkoutRow[] }   (historical)
 *   POST ?route=notes         body: { session, exercise, notes }
 *                 (rewrites the note on every set row of one logged exercise; see updateWorkoutNotes)
 *   POST ?route=bodyweight    body: { date, weightLbs }
 *   POST ?route=calories      body: { date, calories, label, loggedAt, lastAmount, helpings, protein, carbs, fat } (upsert by date; calories = running daily total,
 *                 loggedAt = ISO time of the last tap made ON that date and lastAmount = how many calories that tap added;
 *                 helpings = [{at, amount, protein?, carbs?, fat?}] every helping logged ON that date, stored as JSON;
 *                 all three omitted on a backfill, which keeps the stored ones;
 *                 protein, carbs, fat = running daily grams, each omitted by clients that predate it or by a
 *                 write that doesn't touch it, which keeps the stored value)
 *   POST ?route=measurements  body: { date, waistIn, neckIn, note } (upsert by date)
 *   POST ?route=durations     body: { date, kind, dayType, routine, totalSec, restSec } (append)
 *   POST ?route=exercise_times body: { exercises: [{exercise,totalActiveSec,sets}], restTotalSec, restPrescribedSec, restCount }
 *                 (folds a finished session's per-set active times + rests into the rolling averages)
 */

const ss = SpreadsheetApp.getActiveSpreadsheet()

const WORKOUT_HEADERS = [
  'session_id',
  'date',
  'day_type',
  'exercise',
  'set_number',
  'weight_lbs',
  'reps',
  'notes',
  'is_historical',
  'variant',
]
const BW_HEADERS = ['date', 'weight_lbs']
const FLEX_HEADERS = [
  'date',
  'split_deg',
  'cold_split_deg',
  'warm_split_deg',
  'tailors_left_deg',
  'tailors_right_deg',
  'tailors_cold_left_deg',
  'tailors_cold_right_deg',
  'tailors_warm_left_deg',
  'tailors_warm_right_deg',
  'note',
  // The head-to-toe columns, appended after `note` so every index above is
  // untouched. `routines` is a comma-joined list of the routines completed that
  // day, in completion order.
  'routines',
  'cold_toe_touch_deg',
  'warm_toe_touch_deg',
  'cold_leg_lift_left_deg',
  'cold_leg_lift_right_deg',
  'warm_leg_lift_left_deg',
  'warm_leg_lift_right_deg',
  'start_sides',
  // Standing pelvic tilt off a side-on photo: one reading, neither cold nor warm.
  'pelvic_tilt_deg',
]
const CONFIG_HEADERS = ['key', 'value']
const CALORIE_HEADERS = ['date', 'calories', 'label', 'logged_at', 'last_amount', 'helpings', 'protein', 'carbs', 'fat']
// The macro columns, by the name each travels under: grams, a running daily total.
const CALORIE_MACROS = [['protein', 6], ['carbs', 7], ['fat', 8]]
const MEASUREMENT_HEADERS = ['date', 'waist_in', 'neck_in', 'note', 'body_fat_pct', 'abs_visibility']
// `routine` is which stretch routine a stretch session was, blank for a workout
// and for a stretch logged before there were two. Appended, and the generic
// sheet() helper fills a missing header cell in on its own, so no migration.
const DURATION_HEADERS = ['date', 'kind', 'day_type', 'total_sec', 'rest_sec', 'routine']
const EXERCISE_TIME_HEADERS = ['exercise', 'avg_active_sec', 'n']
const SAVE_ERROR_HEADERS = ['at', 'build', 'route', 'write_id', 'message', 'pending', 'payload', 'user']
const CARDIO_HEADERS = ['id', 'date', 'kind', 'minutes', 'distance_mi']
// `email` and the password columns are blank for an account made by invite
// before sign-in by email existed, until it sets them (set_login). `owner` is
// 'yes' on the one row that is the owner's (`last_seen` is when the account
// last reached the backend, to the hour): its token reaches the unprefixed
// tabs, and once it exists a request with no token at all is refused.
const USER_HEADERS = ['token', 'id', 'name', 'created_at', 'email', 'pass_salt', 'pass_hash', 'owner', 'last_seen']
const U_TOKEN = 0
const U_ID = 1
const U_NAME = 2
const U_EMAIL = 4
const U_SALT = 5
const U_HASH = 6
const U_OWNER = 7
const U_SEEN = 8
const INVITE_HEADERS = ['code', 'created_at', 'used_at', 'used_by', 'claim', 'user_id']
const FEEDBACK_HEADERS = ['at', 'user', 'build', 'message']

// What this file answers at ?route=version. `npm run backend:stamp` bumps it on
// every change to this file and records the matching fingerprint for the app,
// which ships the number it needs (src/config/backendVersion.ts) and shows a
// banner when the deployed backend answers a lower one. A backend too old to
// have the route counts as version 0. See BACKEND.md "Versioning".
const BACKEND_VERSION = 14
// Sentinel "exercise" key whose row stores the pooled average rest per interval,
// in seconds. Retired: pooling full rests, circuit station changes and capped
// transitions into one duration underestimates every long rest. Still written so
// an older client keeps working, but no longer read back.
const REST_KEY = '__rest__'
// Sentinel key whose row stores the pooled rest RATIO (observed ÷ prescribed) in
// the avg_active_sec column and the interval count in n. Unitless, so each step
// can be priced against its own prescribed rest.
const REST_RATIO_KEY = '__rest_ratio__'

// Who this request is for. Each request runs in a fresh global scope, so these
// are set once at the top of doGet/doPost and never leak into the next caller.
let TAB_PREFIX = ''
let ACCOUNT = null
// Routes that carry their own `secret` and always act as the owner, with no
// `user` token involved. `version` and `join` skip account resolution too, but
// for the opposite reason: there's nobody signed in yet.
const OWNER_SECRET_ROUTES = { issues: true, report_issue: true, issue_thread: true, answer_issue: true, invite: true, claim_owner: true }
// Routes for someone who isn't signed in yet: they hand out a token rather than
// needing one.
const SIGN_IN_ROUTES = { join: true, register: true, login: true }

function doGet(e) {
  try {
    const route = e.parameter.route
    // Google sending someone back from its consent page: no route, no account
    // key, only the one-time `state` this backend handed out (see gcalConnect).
    if (!route && e.parameter.state) return gcalCallback(e.parameter)
    if (route !== 'version' && !OWNER_SECRET_ROUTES[route]) useAccount(e.parameter.user)
    switch (route) {
      case 'version':
        return json({ version: BACKEND_VERSION })
      case 'account':
        return json({ name: ACCOUNT.name, owner: ACCOUNT.owner, email: ACCOUNT.email || '' })
      case 'people':
        return json(listPeople())
      case 'cardio':
        return json(getCardio(e.parameter.since))
      case 'workouts':
        return json(getWorkouts(e.parameter.since))
      case 'bodyweight':
        return json(getBodyWeight(e.parameter.since))
      case 'flexibility':
        return json(getFlex(e.parameter.since))
      case 'calories':
        return json(getCalories(e.parameter.since))
      case 'measurements':
        return json(getMeasurements(e.parameter.since))
      case 'durations':
        return json(getDurations(e.parameter.since))
      case 'exercise_times':
        return json(getExerciseTimes())
      case 'plan':
        return json(getPlan())
      case 'settings':
        return json(getSettings())
      case 'share':
        return json(getShare())
      case 'save_errors':
        return json(getSaveErrors(e.parameter.limit))
      case 'issues':
        return json(listIssues(e.parameter.secret))
      case 'issue_thread':
        return json(getIssueThread(e.parameter.secret, e.parameter.number))
      default:
        return json({ error: 'Unknown route' }, 404)
    }
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500)
  }
}

/**
 * Serialise every mutating request.
 *
 * Apps Script runs concurrent requests from the same user in parallel, and each
 * write below is a read-modify-write over a whole tab. Two overlapping calls
 * both read the pre-write state, so an upsert appends a duplicate row instead of
 * updating one and a fresh tab gets inserted twice. Finishing a session fires
 * three POSTs at once (session + duration + exercise times), which is exactly
 * that race.
 *
 * Failing to get the lock throws rather than returning a cheerful `{saved: 0}`,
 * so the client treats it as a failed write and retries from its queue.
 */
function withLock(fn) {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(30000)) throw new Error('Backend busy, write not attempted')
  try {
    return fn()
  } finally {
    lock.releaseLock()
  }
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {}
    const route = e.parameter.route
    if (!SIGN_IN_ROUTES[route] && !OWNER_SECRET_ROUTES[route]) useAccount(e.parameter.user)
    switch (route) {
      case 'register':
        return json(withLock(function () { return registerAccount(body) }))
      case 'login':
        return json(logIn(body))
      case 'claim_owner':
        return json(withLock(function () { return claimOwner(body) }))
      case 'set_login':
        return json(withLock(function () { return setLogin(e.parameter.user, body) }))
      case 'join':
        return json(withLock(function () { return joinAccount(body) }))
      case 'invite':
        return json(withLock(function () { return mintInvite(body) }))
      case 'cardio':
        return json(withLock(function () { return saveCardio(body) }))
      case 'feedback':
        // Append only, so no lock - same reasoning as save_error below.
        return json(appendFeedback(body))
      case 'session':
      case 'import':
        return json(withLock(function () { return appendWorkoutRows(body.rows) }))
      case 'notes':
        return json(withLock(function () { return updateWorkoutNotes(body) }))
      case 'bodyweight':
        return json(withLock(function () { return appendBodyWeight(body) }))
      case 'flexibility':
        return json(withLock(function () { return appendFlex(body) }))
      case 'calories':
        return json(withLock(function () { return appendCalories(body) }))
      case 'measurements':
        return json(withLock(function () { return appendMeasurements(body) }))
      case 'durations':
        return json(withLock(function () { return appendDurations(body) }))
      case 'exercise_times':
        return json(withLock(function () { return foldExerciseTimes(body) }))
      case 'plan':
        return json(withLock(function () { return savePlan(body.plan) }))
      case 'settings':
        return json(withLock(function () { return saveSettings(body.settings) }))
      case 'share':
        return json(withLock(function () { return saveShare(body.share) }))
      // The calendar routes take no lock: they change nothing in the sheet, and
      // they wait on Google, which would hold every other write up behind them.
      case 'gcal_status':
        return json(gcalStatus())
      case 'gcal_connect':
        return json(gcalConnect(body))
      case 'gcal_state':
        return json(gcalState(body))
      case 'gcal_apply':
        return json(gcalApply(body))
      case 'gcal_disconnect':
        return json(gcalDisconnect())
      case 'save_error':
        // Not under withLock: "Backend busy" is one of the failures this exists
        // to report, and queueing on the same lock would lose exactly that one.
        return json(appendSaveError(body))
      case 'report_issue':
        // Not under withLock: GitHub is the store of record, not a sheet, and two
        // reports racing just make two issues — no row to clobber.
        return json(createIssue(body))
      case 'answer_issue':
        return json(answerIssue(body))
      default:
        return json({ error: 'Unknown route' }, 404)
    }
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500)
  }
}

function doOptions() {
  return json({})
}

/* ------------------------------------------------------------------ reads */

function getWorkouts(since) {
  const sh = sheet('workouts', WORKOUT_HEADERS)
  const rows = sh.getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[1])
    if (since && date < since) continue
    const row = {
      session_id: String(r[0]),
      date: date,
      day_type: String(r[2]),
      exercise: String(r[3]),
      set_number: Number(r[4]),
      weight_lbs: r[5] === '' || r[5] === null ? null : Number(r[5]),
      reps: Number(r[6]),
      notes: String(r[7] || ''),
      is_historical: r[8] === true || String(r[8]).toUpperCase() === 'TRUE',
    }
    // Left off entirely when blank — every row written before the column existed,
    // plus every day that doesn't run variants. The client reads a missing slot as
    // "comparable to either", so an empty string must not reach it.
    if (r[9]) row.variant = String(r[9])
    out.push(row)
  }
  return out
}

function getBodyWeight(since) {
  const sh = sheet('body_weight', BW_HEADERS)
  const rows = sh.getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[0])
    if (since && date < since) continue
    out.push({ date: date, weightLbs: Number(r[1]) })
  }
  return out
}

/* ----------------------------------------------------------------- writes */

function appendWorkoutRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows to save')
  rows.forEach(function (r) {
    if (!r || !r.session_id || !r.date || !r.exercise || !r.day_type ||
        !Number.isFinite(Number(r.set_number)) || Number(r.set_number) < 1 ||
        !Number.isFinite(Number(r.reps))) throw new Error('Invalid workout row; nothing saved')
  })
  const sh = sheet('workouts', WORKOUT_HEADERS)
  // Stable set identity makes retrying a lost response safe, including old clients.
  const key = (session, exercise, set) => JSON.stringify([String(session), String(exercise), Number(set)])
  const existing = new Set(sh.getDataRange().getValues().slice(1).map((r) => key(r[0], r[3], r[4])))
  const fresh = rows.filter((r) => {
    const id = key(r.session_id, r.exercise, r.set_number)
    if (existing.has(id)) return false
    existing.add(id)
    return true
  })
  const values = fresh.map((r) => [
    r.session_id,
    r.date,
    r.day_type,
    r.exercise,
    Number(r.set_number),
    r.weight_lbs === null || r.weight_lbs === undefined ? '' : Number(r.weight_lbs),
    Number(r.reps),
    r.notes || '',
    !!r.is_historical,
    r.variant || '',
  ])
  if (values.length) writeRows(sh, sh.getLastRow() + 1, 1, values)
  return { saved: rows.length }
}

/**
 * Rewrite the note on every set row of one already-logged exercise.
 *
 * The one place workout rows are edited rather than appended. A note belongs to
 * the exercise log — the client writes the same string onto all of that
 * exercise's rows — so a discomfort flag added after the session was saved has
 * to move them together, and appending instead would invent a set that was never
 * performed.
 *
 * Rows are addressed by the same session key the client uses: the session id, or
 * the date for rows written before ids existed.
 *
 * Nothing matching is an error, not a quiet {saved: 0} — the client keeps the
 * write queued and retries, which is what should happen when the session's own
 * rows haven't reached the sheet yet.
 */
function updateWorkoutNotes(body) {
  const session = String(body.session || '')
  const exercise = String(body.exercise || '')
  if (!session || !exercise) throw new Error('session and exercise are required')
  const notes = body.notes == null ? '' : String(body.notes)
  const sh = sheet('workouts', WORKOUT_HEADERS)
  const rows = sh.getDataRange().getValues()
  const notesCol = WORKOUT_HEADERS.indexOf('notes') + 1
  let saved = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0] && !r[1]) continue
    const key = r[0] ? String(r[0]) : isoDate(r[1])
    if (key !== session || String(r[3]) !== exercise) continue
    writeCell(sh, i + 1, notesCol, notes)
    saved++
  }
  if (saved === 0) throw new Error('No rows for ' + exercise + ' in that session')
  return { saved: saved }
}

function appendBodyWeight(body) {
  const sh = sheet('body_weight', BW_HEADERS)

  // Bulk form: { entries: [{ date, weightLbs }, ...] }
  if (Array.isArray(body.entries)) {
    const values = body.entries
      .filter(function (e) {
        return isFinite(Number(e.weightLbs)) && Number(e.weightLbs) > 0
      })
      .map(function (e) {
        return [e.date || isoDate(new Date()), Number(e.weightLbs)]
      })
    if (values.length) writeRows(sh, sh.getLastRow() + 1, 1, values)
    return { saved: values.length }
  }

  // Single form: { date, weightLbs }
  const weight = Number(body.weightLbs)
  if (!isFinite(weight) || weight <= 0) throw new Error('Invalid weight')
  addRow(sh, [body.date || isoDate(new Date()), weight])
  return { saved: 1 }
}

/* ------------------------------------------------------- flexibility + plan */

// Ensure the flexibility sheet uses the current cold/warm schema for both the
// side split and tailor's pose, migrating older layouts in place:
//   - oldest [date, angle_deg, note]                  -> angle_deg becomes split_deg
//   - prior  [date, split_deg, tl, tr, note]          -> cold/warm split columns inserted
//   - recent [date, split, cold, warm, tl, tr, note]  -> cold/warm tailor's columns inserted
// The legacy split_deg and tailors_*_deg columns are preserved: older untagged
// readings count as warm.
function flexSheet() {
  let sh = ss.getSheetByName(TAB_PREFIX + 'flexibility')
  if (!sh) {
    sh = ss.insertSheet(TAB_PREFIX + 'flexibility')
    writeRows(sh, 1, 1, [FLEX_HEADERS])
    return sh
  }
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]

  // Rewrite every data row through `map` into the current column layout. Each
  // map returns the columns it knows about; the rest are blank, so a map doesn't
  // have to be rewritten every time the sheet gains a column.
  function migrate(map) {
    const data = sh.getDataRange().getValues()
    const migrated = [FLEX_HEADERS]
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue
      const row = map(data[i])
      while (row.length < FLEX_HEADERS.length) row.push('')
      migrated.push(row)
    }
    sh.clearContents()
    writeRows(sh, 1, 1, migrated)
    return sh
  }

  // Oldest single-angle layout: [date, angle_deg, note].
  if (header[1] === 'angle_deg') {
    return migrate(function (r) {
      return [r[0], r[1], '', '', '', '', '', '', '', '', r[2] || '']
    })
  }

  // Layout without cold/warm split columns: tailor's sat at index 2.
  if (header[2] === 'tailors_left_deg') {
    return migrate(function (r) {
      return [r[0], r[1], '', '', r[2], r[3], '', '', '', '', r[4] || '']
    })
  }

  // Layout with cold/warm split but a single untagged tailor's pair (note at 6).
  if (header[6] === 'note') {
    return migrate(function (r) {
      return [r[0], r[1], r[2], r[3], r[4], r[5], '', '', '', '', r[6] || '']
    })
  }

  // Layout before the head-to-toe routine: the eleven columns up to `note`, and
  // nothing after it. Every existing column keeps its index, so the rows come
  // through as they are and only widen.
  if (header[11] !== 'routines') {
    return migrate(function (r) {
      return r.slice(0, 11)
    })
  }

  // A sheet from before the newest column: every existing column keeps its
  // index, so only the header row widens.
  if (header[FLEX_HEADERS.length - 1] !== FLEX_HEADERS[FLEX_HEADERS.length - 1]) {
    writeRows(sh, 1, 1, [FLEX_HEADERS])
  }

  return sh
}

/** Comma-joined routine list, deduped, first-seen order kept — see below. */
function joinRoutines(list) {
  const seen = {}
  const out = []
  ;(list || []).forEach(function (r) {
    const k = String(r || '').trim()
    if (!k || seen[k]) return
    seen[k] = true
    out.push(k)
  })
  return out.join(',')
}

/**
 * Union of a stored routine list and an incoming one, first-seen order kept.
 *
 * `keep` semantics are wrong for this column: a day that runs both routines syncs
 * twice, and last-write-wins would drop the first routine off the row — leaving
 * the alternation reading a day that did both as having done only the second.
 * This matches dedupeFlexByDate on the client.
 */
function mergeRoutines(current, incoming) {
  if (!incoming || !incoming.length) return current || ''
  const had = String(current || '')
    .split(',')
    .map(function (s) {
      return s.trim()
    })
  return joinRoutines(had.concat(incoming))
}

function numOrBlank(v) {
  return v === null || v === undefined || v === '' ? '' : Number(v)
}
function numOrNull(v) {
  return v === '' || v === null || v === undefined ? null : Number(v)
}

function getFlex(since) {
  const sh = flexSheet()
  const rows = sh.getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[0])
    if (since && date < since) continue
    out.push({
      date: date,
      splitDeg: numOrNull(r[1]),
      coldSplitDeg: numOrNull(r[2]),
      warmSplitDeg: numOrNull(r[3]),
      tailorsLeftDeg: numOrNull(r[4]),
      tailorsRightDeg: numOrNull(r[5]),
      tailorsColdLeftDeg: numOrNull(r[6]),
      tailorsColdRightDeg: numOrNull(r[7]),
      tailorsWarmLeftDeg: numOrNull(r[8]),
      tailorsWarmRightDeg: numOrNull(r[9]),
      note: String(r[10] || ''),
      routines: String(r[11] || '')
        .split(',')
        .map(function (s) {
          return s.trim()
        })
        .filter(function (s) {
          return s !== ''
        }),
      coldToeTouchDeg: numOrNull(r[12]),
      warmToeTouchDeg: numOrNull(r[13]),
      coldLegLiftLeftDeg: numOrNull(r[14]),
      coldLegLiftRightDeg: numOrNull(r[15]),
      warmLegLiftLeftDeg: numOrNull(r[16]),
      warmLegLiftRightDeg: numOrNull(r[17]),
      startSides: r[18] ? JSON.parse(String(r[18])) : undefined,
      pelvicTiltDeg: numOrNull(r[19]),
    })
  }
  return out
}

function appendFlex(body) {
  const sh = flexSheet()
  const list = Array.isArray(body.entries) ? body.entries : [body]
  const rows = sh.getDataRange().getValues()

  const rowByDate = {}
  for (let i = 1; i < rows.length; i++) {
    const d = isoDate(rows[i][0])
    if (d && !(d in rowByDate)) rowByDate[d] = i + 1
  }

  let saved = 0
  list
    .filter(function (e) {
      return e && e.date
    })
    .forEach(function (e) {
      const existingRow = rowByDate[e.date]
      if (existingRow) {
        // Merge: incoming non-null angle fields overwrite; nulls keep existing.
        const cur = sh.getRange(existingRow, 1, 1, FLEX_HEADERS.length).getValues()[0]
        const keep = function (v, i) {
          return v == null ? cur[i] : Number(v)
        }
        writeRows(sh, existingRow, 1, [
          [
            e.date,
            keep(e.splitDeg, 1),
            keep(e.coldSplitDeg, 2),
            keep(e.warmSplitDeg, 3),
            keep(e.tailorsLeftDeg, 4),
            keep(e.tailorsRightDeg, 5),
            keep(e.tailorsColdLeftDeg, 6),
            keep(e.tailorsColdRightDeg, 7),
            keep(e.tailorsWarmLeftDeg, 8),
            keep(e.tailorsWarmRightDeg, 9),
            e.note ? e.note : cur[10] || '',
            mergeRoutines(cur[11], e.routines),
            keep(e.coldToeTouchDeg, 12),
            keep(e.warmToeTouchDeg, 13),
            keep(e.coldLegLiftLeftDeg, 14),
            keep(e.coldLegLiftRightDeg, 15),
            keep(e.warmLegLiftLeftDeg, 16),
            keep(e.warmLegLiftRightDeg, 17),
            e.startSides ? JSON.stringify(Object.assign({}, cur[18] ? JSON.parse(String(cur[18])) : {}, e.startSides)) : cur[18] || '',
            keep(e.pelvicTiltDeg, 19),
          ],
        ])
      } else {
        addRow(sh, [
          e.date,
          numOrBlank(e.splitDeg),
          numOrBlank(e.coldSplitDeg),
          numOrBlank(e.warmSplitDeg),
          numOrBlank(e.tailorsLeftDeg),
          numOrBlank(e.tailorsRightDeg),
          numOrBlank(e.tailorsColdLeftDeg),
          numOrBlank(e.tailorsColdRightDeg),
          numOrBlank(e.tailorsWarmLeftDeg),
          numOrBlank(e.tailorsWarmRightDeg),
          e.note || '',
          joinRoutines(e.routines),
          numOrBlank(e.coldToeTouchDeg),
          numOrBlank(e.warmToeTouchDeg),
          numOrBlank(e.coldLegLiftLeftDeg),
          numOrBlank(e.coldLegLiftRightDeg),
          numOrBlank(e.warmLegLiftLeftDeg),
          numOrBlank(e.warmLegLiftRightDeg),
          e.startSides ? JSON.stringify(e.startSides) : '',
          numOrBlank(e.pelvicTiltDeg),
        ])
        rowByDate[e.date] = sh.getLastRow()
      }
      saved++
    })
  return { saved: saved }
}

function getCalories(since) {
  const sh = sheet('calories', CALORIE_HEADERS)
  const rows = sh.getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[0])
    if (since && date < since) continue
    const entry = { date: date, calories: Number(r[1]) || 0, label: String(r[2] || '') }
    // Only send a log time when one was actually recorded — a blank cell must
    // reach the client as "unknown", not as an unparseable empty string.
    const loggedAt = String(r[3] || '')
    if (loggedAt) entry.loggedAt = loggedAt
    // The helping only means anything paired with the time it was logged at, so
    // it doesn't travel without one — and a blank cell is "unknown", not zero.
    if (loggedAt && r[4] !== '' && r[4] !== null && r[4] !== undefined && isFinite(Number(r[4]))) {
      entry.lastAmount = Number(r[4])
    }
    // The day's breakdown, JSON in one cell. Unreadable is the same as absent.
    if (loggedAt && r[5]) {
      try {
        const helpings = JSON.parse(String(r[5]))
        if (Array.isArray(helpings)) entry.helpings = helpings
      } catch (err) {
        /* leave it off */
      }
    }
    // Grams of each macro, a running total like the calories. Blank is a day
    // from before it was tracked, which the app reads as none logged.
    for (let m = 0; m < CALORIE_MACROS.length; m++) {
      const cell = r[CALORIE_MACROS[m][1]]
      if (cell !== '' && cell !== null && cell !== undefined && isFinite(Number(cell))) {
        entry[CALORIE_MACROS[m][0]] = Number(cell)
      }
    }
    out.push(entry)
  }
  return out
}

// Upsert by date: a day's calories are stored as a single running total, so a
// new value for a date overwrites that date's row. Any extra legacy rows for
// the date (from the old per-tap append model) are removed, so touching an old
// date self-migrates it to one total row.
function appendCalories(body) {
  const sh = sheet('calories', CALORIE_HEADERS)
  const list = Array.isArray(body.entries) ? body.entries : [body]
  let saved = 0
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (!e || !e.date || !isFinite(Number(e.calories))) continue
    // A day's total is a running value that can be corrected down (the −100
    // button); never store a negative total.
    const lastAmount = isFinite(Number(e.lastAmount)) && e.lastAmount !== null && e.lastAmount !== undefined
      ? Number(e.lastAmount)
      : ''
    const helpings = Array.isArray(e.helpings) ? JSON.stringify(e.helpings) : ''
    // Null when the client didn't send it: an app from before a macro must not
    // blank the grams a newer one logged for the same day.
    const macros = CALORIE_MACROS.map(function (m) {
      const g = e[m[0]]
      return g !== null && g !== undefined && g !== '' && isFinite(Number(g)) ? Math.max(0, Number(g)) : null
    })
    upsertCalorieDate(sh, e.date, Math.max(0, Number(e.calories)), e.label || '', e.loggedAt || '', lastAmount, helpings, macros)
    saved++
  }
  if (saved === 0 && list.length) {
    throw new Error('No valid calorie rows among ' + list.length + ' submitted')
  }
  return { saved: saved }
}

function upsertCalorieDate(sh, date, calories, label, loggedAt, lastAmount, helpings, macros) {
  const rows = sh.getDataRange().getValues()
  let firstRow = -1
  let storedLoggedAt = ''
  let storedLastAmount = ''
  let storedHelpings = ''
  let storedMacros = CALORIE_MACROS.map(function () { return '' })
  const extraRows = []
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] && isoDate(rows[r][0]) === date) {
      if (firstRow === -1) {
        firstRow = r + 1 // 1-based sheet row
        storedLoggedAt = String(rows[r][3] || '')
        storedLastAmount = rows[r][4] === undefined || rows[r][4] === null ? '' : rows[r][4]
        storedHelpings = String(rows[r][5] || '')
        storedMacros = CALORIE_MACROS.map(function (m) {
          const cell = rows[r][m[1]]
          return cell === undefined || cell === null ? '' : cell
        })
      } else extraRows.push(r + 1)
    }
  }
  if (firstRow === -1) {
    addRow(sh, [date, calories, label, loggedAt, lastAmount, helpings].concat(macros.map(function (g) { return g === null ? '' : g })))
    return
  }
  // A backfill sends no log time; keep the time and the helping already stored
  // rather than blanking a real same-day stamp with the correction's silence.
  // The two move together — a kept time beside this tap's amount would claim a
  // helping the day being shown never had.
  const at = loggedAt ? loggedAt : storedLoggedAt
  const amount = loggedAt ? lastAmount : storedLastAmount
  const list = loggedAt ? helpings : storedHelpings
  const grams = macros.map(function (g, m) { return g === null ? storedMacros[m] : g })
  writeRows(sh, firstRow, 1, [[date, calories, label, at, amount, list].concat(grams)])
  // Delete leftover legacy rows bottom-up so earlier indices stay valid.
  for (let k = extraRows.length - 1; k >= 0; k--) {
    sh.deleteRow(extraRows[k])
  }
}

function getMeasurements(since) {
  const rows = sheet('measurements', MEASUREMENT_HEADERS).getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[0])
    if (since && date < since) continue
    const entry = { date: date, note: String(r[3] || '') }
    if (Number(r[1]) > 0) entry.waistIn = Number(r[1])
    if (Number(r[2]) > 0) entry.neckIn = Number(r[2])
    if (Number(r[4]) > 0 && Number(r[4]) < 100) entry.bodyFatPct = Number(r[4])
    if (['none', 'faint', 'clear'].indexOf(r[5]) !== -1) entry.absVisibility = r[5]
    out.push(entry)
  }
  return out
}

// Merge fields by date so scale readings and tape measurements can be logged separately.
function appendMeasurements(body) {
  const sh = sheet('measurements', MEASUREMENT_HEADERS)
  const list = Array.isArray(body.entries) ? body.entries : [body]
  const rows = sh.getDataRange().getValues()
  const rowByDate = {}
  for (let i = 1; i < rows.length; i++) {
    const d = isoDate(rows[i][0])
    if (d && !(d in rowByDate)) rowByDate[d] = i + 1
  }
  // Validate the entire batch before mutating any rows.
  list.forEach(function (e) {
    if (!e || !e.date) throw new Error('Measurement date required')
    let hasValue = false
    ;['waistIn', 'neckIn', 'bodyFatPct'].forEach(function (key) {
      if (e[key] === undefined) return
      const value = Number(e[key])
      if (!isFinite(value) || value <= 0 || (key === 'bodyFatPct' && value >= 100)) {
        throw new Error('Invalid measurement: ' + key)
      }
      hasValue = true
    })
    if (e.absVisibility !== undefined) {
      if (['none', 'faint', 'clear'].indexOf(e.absVisibility) === -1) throw new Error('Invalid abs visibility')
      hasValue = true
    }
    if (!hasValue) throw new Error('No measurement values supplied')
  })
  list.forEach(function (e) {
    const existingRow = rowByDate[e.date]
    const previous = existingRow ? rows[existingRow - 1] : []
    const values = [
      e.date,
      e.waistIn !== undefined ? Number(e.waistIn) : previous[1] || '',
      e.neckIn !== undefined ? Number(e.neckIn) : previous[2] || '',
      e.note !== undefined ? e.note : previous[3] || '',
      e.bodyFatPct !== undefined ? Number(e.bodyFatPct) : previous[4] || '',
      e.absVisibility !== undefined ? e.absVisibility : previous[5] || '',
    ]
    if (existingRow) {
      writeRows(sh, existingRow, 1, [values])
      rows[existingRow - 1] = values
    } else {
      addRow(sh, values)
      rowByDate[e.date] = sh.getLastRow()
      rows[rowByDate[e.date] - 1] = values
    }
  })
  return { saved: list.length, bodyFatSupported: true }
}

function getDurations(since) {
  const sh = sheet('durations', DURATION_HEADERS)
  const rows = sh.getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[0])
    if (since && date < since) continue
    const entry = {
      date: date,
      kind: String(r[1] || 'workout'),
      totalSec: Number(r[3]) || 0,
      restSec: Number(r[4]) || 0,
    }
    if (r[2]) entry.dayType = String(r[2]) // omit for stretches
    if (r[5]) entry.routine = String(r[5]) // omit for workouts
    out.push(entry)
  }
  return out
}

// Append-only: each finished session is its own event (multiple per day allowed).
function appendDurations(body) {
  const sh = sheet('durations', DURATION_HEADERS)
  const list = Array.isArray(body.entries) ? body.entries : [body]
  const values = list
    .filter(function (e) {
      return e && e.date && isFinite(Number(e.totalSec)) && Number(e.totalSec) > 0
    })
    .map(function (e) {
      return [
        e.date,
        e.kind || 'workout',
        e.dayType || '',
        Number(e.totalSec),
        Number(e.restSec) || 0,
        e.routine || '',
      ]
    })
  if (values.length) {
    writeRows(sh, sh.getLastRow() + 1, 1, values)
  } else if (list.length) {
    // Every submitted row failed the filter. Returning {saved: 0} would read as
    // a successful save, so the client would drop the session and never retry —
    // the exact way the durations tab stayed empty. Say so instead.
    throw new Error('No valid duration rows among ' + list.length + ' submitted')
  }
  return { saved: values.length }
}

/* ---------------------------------------------- per-exercise time averages */

// Returns { active: { exerciseKey: {avgSec, n} }, restRatio: {ratio, n} }. The
// sentinel REST_RATIO_KEY row (if present) supplies the pooled rest ratio; the
// legacy REST_KEY row is skipped rather than reported, since its seconds would
// read as a ratio.
function getExerciseTimes() {
  const sh = sheet('exercise_times', EXERCISE_TIME_HEADERS)
  const rows = sh.getDataRange().getValues()
  const active = {}
  let restRatio = { ratio: 1, n: 0 }
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '')
    if (!key || key === REST_KEY) continue
    if (key === REST_RATIO_KEY) {
      restRatio = { ratio: Number(rows[i][1]) || 1, n: Number(rows[i][2]) || 0 }
    } else {
      active[key] = { avgSec: Number(rows[i][1]) || 0, n: Number(rows[i][2]) || 0 }
    }
  }
  return { active: active, restRatio: restRatio }
}

// Folds a finished session's samples into the rolling averages. For each
// exercise the running mean over all set-samples is exact:
//   newAvg = (avg*n + totalActiveSec) / (n + sets); n += sets
// The pooled rest rows are folded the same way over rest intervals. Upserts one
// row per exercise key (plus the REST_KEY / REST_RATIO_KEY rows).
function foldExerciseTimes(body) {
  const sh = sheet('exercise_times', EXERCISE_TIME_HEADERS)
  const list = Array.isArray(body.exercises) ? body.exercises : []

  const rows = sh.getDataRange().getValues()
  const rowByKey = {}
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '')
    if (key && !(key in rowByKey)) rowByKey[key] = i + 1 // 1-based sheet row
  }

  // Returns whether the row was actually folded, so the caller can tell a
  // rejected sample from a written one.
  function upsert(key, addSumSec, addCount) {
    if (!key || !(addCount > 0) || !isFinite(Number(addSumSec)) || Number(addSumSec) < 0) return false
    const existingRow = rowByKey[key]
    let avg = 0
    let n = 0
    if (existingRow) {
      const cur = sh.getRange(existingRow, 1, 1, EXERCISE_TIME_HEADERS.length).getValues()[0]
      avg = Number(cur[1]) || 0
      n = Number(cur[2]) || 0
    }
    const newN = n + Number(addCount)
    const newAvg = (avg * n + Number(addSumSec)) / newN
    if (existingRow) {
      writeRows(sh, existingRow, 1, [[key, newAvg, newN]])
    } else {
      addRow(sh, [key, newAvg, newN])
      rowByKey[key] = sh.getLastRow()
    }
    return true
  }

  let folded = 0
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (!e || !e.exercise || !(Number(e.sets) > 0)) continue
    if (upsert(String(e.exercise), Number(e.totalActiveSec), Number(e.sets))) folded++
  }
  const restCount = Number(body.restCount)
  const restPrescribed = Number(body.restPrescribedSec)
  if (restCount > 0) {
    // Legacy pooled-seconds row, kept current only for older clients reading it.
    if (upsert(REST_KEY, Number(body.restTotalSec), restCount)) folded++
    if (restPrescribed > 0) {
      // Clamped to 0.25×–4× so one freak session can't wreck the mean, then
      // folded as `restCount` samples of this session's ratio.
      const ratio = Math.min(4, Math.max(0.25, Number(body.restTotalSec) / restPrescribed))
      if (upsert(REST_RATIO_KEY, ratio * restCount, restCount)) folded++
    }
  }
  // Nothing folded at all, from a payload that carried something: same silent
  // drop as appendDurations. The client only ever posts samples it has (see the
  // guard in logExerciseTimes), so this means a real bug, not an empty session.
  if (folded === 0 && (list.length || restCount > 0)) {
    throw new Error('No exercise time samples folded')
  }
  // Counted by rows folded, rests included: a rest-only session folds no
  // exercise and would otherwise answer `saved: 0`, which a client reads as lost.
  return { saved: folded }
}

function getPlan() {
  const sh = sheet('config', CONFIG_HEADERS)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'plan') {
      try {
        return JSON.parse(rows[i][1])
      } catch (e) {
        return null
      }
    }
  }
  return null // no custom plan stored yet
}

function savePlan(plan) {
  if (!plan) throw new Error('No plan provided')
  const sh = sheet('config', CONFIG_HEADERS)
  const value = JSON.stringify(plan)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'plan') {
      writeCell(sh, i + 1, 2, value)
      return { saved: 1 }
    }
  }
  addRow(sh, ['plan', value])
  return { saved: 1 }
}

/* ------------------------------------------------------------------ settings */

/**
 * The account's settings: the app's preferences plus, crucially, the goals the
 * user has committed to (see the client's lib/goalLock). Everything else here is
 * re-derivable from the logged rows; a commitment is not, so it can't live only
 * in a phone's localStorage that a reinstall wipes.
 *
 * Stored as one JSON blob under a `config` key, like the plan. The client holds a
 * full copy and merges on fetch rather than replacing (see lib/settingsSync), so
 * this end stays a dumb store — with the one exception in saveSettings.
 *
 * Note what deliberately ISN'T here: the API URL and the OpenAI/chat
 * credentials. This route is unauthenticated and the /exec URL ships in the
 * public web bundle, so a key stored here would be a key published.
 */
function getSettings() {
  const sh = sheet('config', CONFIG_HEADERS)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'settings') {
      try {
        return JSON.parse(rows[i][1])
      } catch (e) {
        return null
      }
    }
  }
  return null // nothing synced yet
}

function saveSettings(settings) {
  if (!settings || typeof settings !== 'object') throw new Error('No settings provided')
  const sh = sheet('config', CONFIG_HEADERS)
  const value = JSON.stringify(settings)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'settings') {
      let stored = null
      try {
        stored = JSON.parse(rows[i][1])
      } catch (e) {
        stored = null
      }
      // The one place a write is declined rather than stored. Settings are sent
      // whole, so a device that hasn't synced since the other one committed a
      // goal would push its stale copy over the top and erase the commitment —
      // exactly the loss this route was added to prevent. `saved: 0` here means
      // "already superseded", not "failed" (contrast the rule at the top of this
      // file): the client should drop the write, not retry it, because its copy
      // is the obsolete one and its next fetch will merge the newer one in.
      if (stored && String(stored.updatedAt || '') > String(settings.updatedAt || '')) {
        return { saved: 0, stale: true }
      }
      writeCell(sh, i + 1, 2, value)
      return { saved: 1 }
    }
  }
  addRow(sh, ['settings', value])
  return { saved: 1 }
}

/* -------------------------------------------------------------------- share */

/**
 * The summary of the streak and goal pace that my-brain's body slice reads
 * (see the client's lib/brainShare). The app works it out and posts it whole;
 * this end keeps the latest under a `config` key and hands it back. my-brain
 * asks with the same account key the app uses, so it reads one person's and
 * nobody else's.
 */
function getShare() {
  const sh = sheet('config', CONFIG_HEADERS)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'share') {
      try {
        return JSON.parse(rows[i][1])
      } catch (e) {
        return null
      }
    }
  }
  return null // nothing posted yet
}

function saveShare(share) {
  if (!share || typeof share !== 'object') throw new Error('No share provided')
  const sh = sheet('config', CONFIG_HEADERS)
  const value = JSON.stringify(share)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'share') {
      writeCell(sh, i + 1, 2, value)
      return { saved: 1 }
    }
  }
  addRow(sh, ['share', value])
  return { saved: 1 }
}

/* ---------------------------------------------------------- failed saves */

// A sheet cell holds at most 50,000 characters. A cut payload still names the
// write and most of its rows, which is most of the use.
const SAVE_ERROR_PAYLOAD_MAX = 45000
// Old reports are only history. Trimmed in a batch so a phone retrying on every
// refresh can't grow the tab without bound.
const SAVE_ERROR_KEEP = 300

/**
 * Record a write a phone's outbox couldn't deliver.
 *
 * Every other route's failure only ever reaches the device that hit it, where
 * the banner says no more than "couldn't save". This writes it somewhere it can
 * be read back off the phone — the error, the build that hit it, and the queued
 * write itself — so the cause can be found and the data replayed without anyone
 * copying an error off a screen.
 */
function appendSaveError(report) {
  if (!report || typeof report !== 'object' || !report.message) {
    throw new Error('No save error provided')
  }
  const sh = ownerSheet('save_errors', SAVE_ERROR_HEADERS)
  let payload = report.payload === undefined ? '' : JSON.stringify(report.payload)
  if (payload.length > SAVE_ERROR_PAYLOAD_MAX) payload = payload.slice(0, SAVE_ERROR_PAYLOAD_MAX)
  addRow(sh, [
    new Date().toISOString(),
    String(report.build || ''),
    String(report.route || ''),
    String(report.writeId || ''),
    String(report.message).slice(0, 2000),
    Number(report.pending) || 0,
    payload,
    ACCOUNT ? ACCOUNT.name : '',
  ])
  const extra = sh.getLastRow() - 1 - SAVE_ERROR_KEEP
  if (extra >= 50) sh.deleteRows(2, extra)
  return { saved: 1 }
}

function getSaveErrors(limit) {
  if (ACCOUNT && !ACCOUNT.owner) throw new Error('Owner only')
  const sh = ownerSheet('save_errors', SAVE_ERROR_HEADERS)
  const rows = sh.getDataRange().getValues()
  const n = Math.max(1, Math.min(Number(limit) || 50, SAVE_ERROR_KEEP))
  const out = []
  for (let i = rows.length - 1; i >= 1 && out.length < n; i--) {
    const r = rows[i]
    let payload = null
    try {
      payload = r[6] === '' ? null : JSON.parse(r[6])
    } catch (e) {
      payload = String(r[6]) // cut at the cell limit; still worth reading
    }
    out.push({
      at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      build: String(r[1]),
      route: String(r[2]),
      writeId: String(r[3]),
      message: String(r[4]),
      pending: Number(r[5]) || 0,
      payload: payload,
      user: String(r[7] || ''),
    })
  }
  return out
}

/* ---------------------------------------------------------------- accounts */

// Script properties, read defensively: a property that can't be read is the same
// as one that isn't set.
function scriptProp(key) {
  if (typeof PropertiesService === 'undefined') return ''
  return PropertiesService.getScriptProperties().getProperty(key) || ''
}

/**
 * Work out whose request this is and point the tab prefix at their tabs.
 *
 * `user` is the account token the app was given at join. Blank is the owner -
 * every request the app made before hosting existed - unless REQUIRE_ACCOUNT is
 * set, which shuts that open door once the owner's own phone has a key. The
 * owner's CHAT_SHARED_SECRET also passes as the owner, so a script can reach the
 * owner's tabs without being a joined user. A token that is neither throws
 * rather than falling back to the owner: a mistyped key must not read, or write,
 * somebody else's data.
 */
function resolveAccount(token) {
  const t = String(token || '').trim()
  if (!t) {
    // The owner signing in by email is what closes this: from then on every
    // device has a key, and the backend address in the public bundle no longer
    // opens the owner's tabs to anyone who finds it.
    if (scriptProp('REQUIRE_ACCOUNT') || ownerRowAt(userRows()) > 0) throw new Error('Sign in required')
    return { owner: true, name: '', id: '', prefix: '' }
  }
  const secret = scriptProp('CHAT_SHARED_SECRET')
  if (secret && t === secret) return { owner: true, name: '', id: '', prefix: '' }
  const rows = userRows()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][U_TOKEN] && String(rows[i][U_TOKEN]) === t) {
      touchSeen(i, rows[i])
      const email = String(rows[i][U_EMAIL] || '')
      if (isOwnerRow(rows[i])) return { owner: true, name: String(rows[i][U_NAME]), id: '', prefix: '', email: email }
      const id = String(rows[i][U_ID])
      return { owner: false, name: String(rows[i][U_NAME]), id: id, prefix: 'u' + id + '_', email: email }
    }
  }
  throw new Error('Unknown account')
}

function useAccount(token) {
  ACCOUNT = resolveAccount(token)
  TAB_PREFIX = ACCOUNT.prefix
}

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

// Text a person typed, made safe to put in a cell. Sheets reads a value that
// opens with = + - or @ as a formula, and every account's tabs are in the one
// book, beside the users tab and its keys: a note that ran as a formula could
// read any of them and hand the answer back on the next fetch.
//
// A leading apostrophe is how Sheets is told "this is text". It is not part of
// the value: the cell holds, and getValues returns, the string without it. So
// what was typed comes back exactly, a note that opens with a minus included.
// A string that already opens with an apostrophe gets one too, or Sheets would
// eat the one that was typed. White space ahead of the sign doesn't excuse it.
function plainText(value) {
  const s = String(value == null ? '' : value)
  return /^'|^[\s\u0000-\u001f]*[=+\-@]/.test(s) ? "'" + s : s
}

// One cell's value as it may be written: numbers, booleans and dates as they
// are, and anything else as text that cannot run (see plainText).
function cellValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Object.prototype.toString.call(value) === '[object Date]') return value
  return plainText(value)
}

function cellRow(values) {
  return values.map(cellValue)
}

// The only three places this file writes to the book. Every write goes through
// one of them, so no route can put a string in a cell that Sheets would run;
// scripts/formulaBackend.test.mjs fails on a write made any other way.
function writeRows(sh, row, col, values) {
  sh.getRange(row, col, values.length, values[0].length).setValues(values.map(cellRow))
}

function writeCell(sh, row, col, value) {
  sh.getRange(row, col).setValue(cellValue(value))
}

function addRow(sh, values) {
  sh.appendRow(cellRow(values))
}

function randomFrom(alphabet, length) {
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  return out
}

/* ------------------------------------------------------- email sign-in */

// A password is never stored, only a salted digest of it, hashed over and over
// so a copy of the users tab can't be run through a word list quickly. Apps
// Script has no bcrypt or scrypt; iterated SHA-256 is what it has.
const PASSWORD_ROUNDS = 1000
const PASSWORD_MIN = 8
// Wrong passwords for one email, inside the window, before it stops being
// checked at all until the window passes.
const LOGIN_FAILS_MAX = 10
const LOGIN_LOCK_SECONDS = 15 * 60

function userRows() {
  return ownerSheet('users', USER_HEADERS).getDataRange().getValues()
}

function isOwnerRow(row) {
  return String(row[U_OWNER] || '') === 'yes'
}

/** The owner's row in `rows`, or -1. Row 0 is the header. */
function ownerRowAt(rows) {
  for (let i = 1; i < rows.length; i++) if (isOwnerRow(rows[i])) return i
  return -1
}

function normEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function checkEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("That email doesn't look right")
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw new Error('Password must be at least ' + PASSWORD_MIN + ' characters')
  }
  if (password.length > 200) throw new Error('Password is too long')
}

/** The users-tab row holding `email`, or -1. */
function emailRowAt(rows, email) {
  for (let i = 1; i < rows.length; i++) if (normEmail(rows[i][U_EMAIL]) === email) return i
  return -1
}

function hashPassword(password, salt) {
  const alg = Utilities.DigestAlgorithm.SHA_256
  let bytes = Utilities.computeDigest(alg, salt + ':' + password, Utilities.Charset.UTF_8)
  for (let i = 1; i < PASSWORD_ROUNDS; i++) bytes = Utilities.computeDigest(alg, bytes)
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2) }).join('')
}

function passwordMatches(row, password) {
  const salt = String(row[U_SALT] || '')
  return !!salt && typeof password === 'string' && hashPassword(password, salt) === String(row[U_HASH])
}

/** [email, salt, hash] for a users row. */
function loginCells(email, password) {
  const salt = Utilities.getUuid().replace(/-/g, '')
  return [email, salt, hashPassword(password, salt)]
}

function newUserId(rows) {
  const taken = {}
  rows.slice(1).forEach(function (r) { taken[String(r[U_ID])] = true })
  // "12e345" in a cell is a number, so an id never opens with a digit.
  let id = randomFrom(ID_ALPHABET, 6)
  while (taken[id] || /^\d/.test(id)) id = randomFrom(ID_ALPHABET, 6)
  return id
}

function newToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '')
}

function cleanName(value) {
  return String(value || '').trim().replace(/^[=+\-@\s]+/, '').slice(0, 40)
}

/**
 * Make an account from an email and a password; anyone may. Asking again with
 * the same email and password is answered with the account it already made, so
 * a reply lost on the way back doesn't strand the phone that asked.
 */
function registerAccount(body) {
  const email = normEmail(body && body.email)
  const password = body && body.password
  checkEmail(email)
  checkPassword(password)
  const name = cleanName(body && body.name)
  if (!name) throw new Error('A name is required')
  const users = ownerSheet('users', USER_HEADERS)
  const rows = users.getDataRange().getValues()
  const at = emailRowAt(rows, email)
  if (at > 0) {
    if (passwordMatches(rows[at], password)) {
      return { saved: 1, token: String(rows[at][U_TOKEN]), name: String(rows[at][U_NAME]), owner: isOwnerRow(rows[at]) }
    }
    throw new Error('An account with that email already exists')
  }
  const token = newToken()
  const cells = loginCells(email, password)
  const now = new Date().toISOString()
  addRow(users, [token, newUserId(rows), name, now, cells[0], cells[1], cells[2], '', now])
  return { saved: 1, token: token, name: name, owner: false }
}

function loginFailKey(email) {
  return 'login_fail_' + Utilities.base64EncodeWebSafe(email)
}

/** Trade an email and password for the account's token. */
function logIn(body) {
  const email = normEmail(body && body.email)
  const password = body && body.password
  const cache = CacheService.getScriptCache()
  const key = loginFailKey(email)
  const fails = Number(cache.get(key) || 0)
  if (fails >= LOGIN_FAILS_MAX) throw new Error('Too many tries. Wait 15 minutes and try again')
  const rows = userRows()
  const at = email ? emailRowAt(rows, email) : -1
  if (at < 0 || !passwordMatches(rows[at], password)) {
    cache.put(key, String(fails + 1), LOGIN_LOCK_SECONDS)
    throw new Error('Wrong email or password')
  }
  cache.remove(key)
  return { saved: 1, token: String(rows[at][U_TOKEN]), name: String(rows[at][U_NAME]), owner: isOwnerRow(rows[at]) }
}

/**
 * Give the owner an email and password, by the owner secret. The first call
 * makes the owner's row — the account the unprefixed tabs, i.e. everything the
 * owner ever logged, belong to — and with it shuts out tokenless requests. A
 * later one resets the owner's login: the secret is the owner's way back in.
 */
function claimOwner(body) {
  if (!body || body.secret !== chatSecret()) throw new Error('Bad chat secret')
  const email = normEmail(body.email)
  const password = body.password
  checkEmail(email)
  checkPassword(password)
  const users = ownerSheet('users', USER_HEADERS)
  const rows = users.getDataRange().getValues()
  const owner = ownerRowAt(rows)
  const taken = emailRowAt(rows, email)
  if (taken > 0 && taken !== owner) throw new Error('An account with that email already exists')
  const cells = loginCells(email, password)
  if (owner > 0) {
    writeRows(users, owner + 1, U_EMAIL + 1, [cells])
    return { saved: 1, token: String(rows[owner][U_TOKEN]), name: String(rows[owner][U_NAME]), owner: true }
  }
  const token = newToken()
  const name = cleanName(body.name)
  const now = new Date().toISOString()
  addRow(users, [token, '', name, now, cells[0], cells[1], cells[2], 'yes', now])
  return { saved: 1, token: token, name: name, owner: true }
}

// How often last_seen is rewritten for one account. Every request resolves the
// account, and a cell write on each would be most of a read's cost.
const SEEN_EVERY_SECONDS = 60 * 60

/** Stamp a users row as seen now, at most once per SEEN_EVERY_SECONDS. */
function touchSeen(at, row) {
  // Bookkeeping: a stamp that fails must never fail the request it rode on.
  try {
    const cache = CacheService.getScriptCache()
    const key = 'seen_' + String(row[U_TOKEN]).slice(0, 16)
    if (cache.get(key)) return
    cache.put(key, '1', SEEN_EVERY_SECONDS)
    writeCell(ownerSheet('users', USER_HEADERS), at + 1, U_SEEN + 1, new Date().toISOString())
  } catch (err) {
    /* last_seen stays as it was */
  }
}

function cellIso(value) {
  if (value instanceof Date) return value.toISOString()
  return String(value || '')
}

/** Everyone with an account, for the owner: who, since when, and last seen. Never a token or a hash. */
function listPeople() {
  if (!ACCOUNT || !ACCOUNT.owner) throw new Error('Owner only')
  return userRows().slice(1).filter(function (r) { return r[U_TOKEN] }).map(function (r) {
    return {
      name: String(r[U_NAME] || ''),
      email: String(r[U_EMAIL] || ''),
      createdAt: cellIso(r[3]),
      lastSeen: cellIso(r[U_SEEN]),
      owner: isOwnerRow(r),
    }
  })
}

/** Set or change the signed-in account's email and password. */
function setLogin(token, body) {
  const email = normEmail(body && body.email)
  const password = body && body.password
  checkEmail(email)
  checkPassword(password)
  const users = ownerSheet('users', USER_HEADERS)
  const rows = users.getDataRange().getValues()
  const t = String(token || '').trim()
  let at = -1
  for (let i = 1; i < rows.length; i++) if (t && String(rows[i][U_TOKEN]) === t) at = i
  if (at < 0) throw new Error('Sign in required')
  const taken = emailRowAt(rows, email)
  if (taken > 0 && taken !== at) throw new Error('An account with that email already exists')
  writeRows(users, at + 1, U_EMAIL + 1, [loginCells(email, password)])
  return { saved: 1 }
}

/** Mint a one-time invite code. Owner only, by the shared secret. */
function mintInvite(body) {
  if (!body || body.secret !== chatSecret()) throw new Error('Bad chat secret')
  const sh = ownerSheet('invites', INVITE_HEADERS)
  const taken = {}
  sh.getDataRange().getValues().slice(1).forEach(function (r) { taken[String(r[0])] = true })
  // A code that reads as a number (all digits, or digits around a lone E) would
  // be stored as one and never match what was typed back.
  let code = randomFrom(INVITE_ALPHABET, 8)
  while (taken[code] || /^\d+(E\d+)?$/.test(code)) code = randomFrom(INVITE_ALPHABET, 8)
  addRow(sh, [code, new Date().toISOString(), '', ''])
  return { saved: 1, code: code }
}

/**
 * Spend an invite and make an account. The token it returns is the only
 * credential the person will ever have, so it is two UUIDs long and the app
 * stores it as their account key.
 */
function joinAccount(body) {
  const invite = String((body && body.invite) || '').trim().toUpperCase()
  // A name can't open with a formula character: it is written to the owner's
  // book, and read back out of it as the account's name.
  const name = String((body && body.name) || '').trim().replace(/^[=+\-@\s]+/, '').slice(0, 40)
  // The phone's own id for this attempt. The answer to a join is the only copy
  // of the token there will ever be, so a reply lost on the way back can't be
  // allowed to spend the invite for nothing: the same phone asking again with
  // the same claim is handed the account it already made.
  const claim = String((body && body.claim) || '').trim()
  const invites = ownerSheet('invites', INVITE_HEADERS)
  const rows = invites.getDataRange().getValues()
  const users = ownerSheet('users', USER_HEADERS)
  const userRows = users.getDataRange().getValues()
  let at = -1
  for (let i = 1; i < rows.length; i++) {
    if (!invite || String(rows[i][0]).toUpperCase() !== invite) continue
    if (!rows[i][2]) {
      at = i
      break
    }
    if (claim && String(rows[i][4] || '') === claim) {
      for (let u = 1; u < userRows.length; u++) {
        if (String(userRows[u][1]) === String(rows[i][5])) {
          return { saved: 1, token: String(userRows[u][0]), name: String(userRows[u][2]) }
        }
      }
    }
  }
  if (at === -1) throw new Error("That invite code isn't valid")
  if (!name) throw new Error('A name is required')
  const taken = {}
  userRows.slice(1).forEach(function (r) { taken[String(r[1])] = true })
  // Same trap as the invite code: "12e345" in a cell is a number.
  let id = randomFrom(ID_ALPHABET, 6)
  while (taken[id] || /^\d/.test(id)) id = randomFrom(ID_ALPHABET, 6)
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '')
  const now = new Date().toISOString()
  addRow(users, [token, id, name, now])
  writeRows(invites, at + 1, 3, [[now, name, claim, id]])
  return { saved: 1, token: token, name: name }
}

/* ------------------------------------------------------------------ cardio */

function getCardio(since) {
  const rows = sheet('cardio', CARDIO_HEADERS).getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[1])
    if (since && date < since) continue
    const entry = { id: String(r[0]), date: date, kind: String(r[2] || '') }
    if (Number(r[3]) > 0) entry.minutes = Number(r[3])
    if (r[4] !== '' && r[4] !== null && r[4] !== undefined && isFinite(Number(r[4]))) {
      entry.distanceMi = Number(r[4])
    }
    out.push(entry)
  }
  return out
}

// Upsert by id, or remove by id. A delete of a row already gone still answers
// saved: 1 - the client retries a lost response, and the second try must land.
function saveCardio(body) {
  if (!body || !body.id) throw new Error('A cardio id is required')
  const id = String(body.id)
  const sh = sheet('cardio', CARDIO_HEADERS)
  const rows = sh.getDataRange().getValues()
  let at = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === id) {
      at = i + 1
      break
    }
  }
  if (body.deleted === true) {
    if (at !== -1) sh.deleteRow(at)
    return { saved: 1 }
  }
  // Only the kind and the date are required: a match has no distance, and a
  // pickup game rarely has a clock on it.
  if (!body.date) throw new Error('A cardio date is required')
  if (!String(body.kind || '').trim()) throw new Error('A cardio kind is required')
  const minutes = optionalPositive(body.minutes)
  const distance = optionalPositive(body.distanceMi)
  const row = [id, body.date, String(body.kind || ''), minutes, distance]
  if (at === -1) addRow(sh, row)
  else writeRows(sh, at, 1, [row])
  return { saved: 1 }
}

// A blank cell for a value not given, the number for one that was.
function optionalPositive(v) {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return isFinite(n) && n > 0 ? n : ''
}

/* ---------------------------------------------------------------- feedback */

function appendFeedback(body) {
  const message = String((body && body.message) || '').trim()
  if (!message) throw new Error('A message is required')
  if (message.length > 4000) throw new Error('That message is too long')
  addRow(ownerSheet('feedback', FEEDBACK_HEADERS), [
    new Date().toISOString(),
    ACCOUNT ? ACCOUNT.name : '',
    String((body && body.build) || ''),
    message,
  ])
  return { saved: 1 }
}

/* -------------------------------------------------------------- shared token */

/**
 * The token a device has to present to reach the issue routes below.
 *
 * The /exec URL is baked into the public web bundle, so without one anyone
 * holding that bundle could file issues on the repo — or read the ones already
 * filed. It's a Script Property, set once under Project Settings → Script
 * properties; unset, the routes refuse to serve rather than failing open.
 *
 * Still called CHAT_SHARED_SECRET, which is what it was while the same token also
 * brokered the coach's public address for the phone. That brokering is gone — the
 * phone reaches the coach by loading the dev server itself over Epic wifi, so
 * there is no address to publish — but renaming the property would cost a
 * redeploy and a re-entry on every phone to buy nothing.
 */
function chatSecret() {
  const expected = PropertiesService.getScriptProperties().getProperty('CHAT_SHARED_SECRET')
  if (!expected) {
    throw new Error('CHAT_SHARED_SECRET script property is not set on the backend')
  }
  return expected
}

/* --------------------------------------------------------- issue reporting */

const ISSUE_REPO = 'chase-grey/workout-tracker'

/**
 * The GitHub token that files issues, held as a Script Property so it never
 * ships in the public web bundle. Use a fine-grained PAT scoped to Issues:
 * Read/Write on this one repo. Unset, this refuses rather than failing open.
 */
function githubToken() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_ISSUE_TOKEN')
  if (!token) {
    throw new Error('GITHUB_ISSUE_TOKEN script property is not set on the backend')
  }
  return token
}

/**
 * The label scripts/autofix.mjs polls for, and the one it parks an issue under
 * while it waits on an answer. Answering swaps the second back for the first,
 * which is what puts the issue back in front of the fixer.
 */
const FIX_LABEL = 'auto-fix'
const ASK_LABEL = 'needs-input'

/**
 * One GitHub REST call against ISSUE_REPO, with the token and headers attached.
 *
 * Throws on any non-2xx: GitHub reports a bad token or a missing issue in the
 * body of a response the caller would otherwise parse as data.
 */
function githubApi(method, path, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + githubToken(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }
  if (payload) {
    options.contentType = 'application/json'
    options.payload = JSON.stringify(payload)
  }
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + ISSUE_REPO + path, options)
  const code = res.getResponseCode()
  if (code < 200 || code >= 300) {
    throw new Error(
      'GitHub ' + method + ' ' + path + ' failed (' + code + '): ' + res.getContentText(),
    )
  }
  const text = res.getContentText()
  return text ? JSON.parse(text) : null
}

/**
 * Read one issue, refusing anything the app didn't file.
 *
 * The secret already gates these routes, but the token can write to every issue
 * in the repo — scoping the per-issue routes to `from-app` keeps a mistyped or
 * guessed number from reaching an unrelated one.
 */
function requireAppIssue(number) {
  const n = parseInt(number, 10)
  if (!n) throw new Error('An issue number is required')
  const issue = githubApi('get', '/issues/' + n)
  const labels = issue.labels || []
  for (let i = 0; i < labels.length; i++) {
    if (String(labels[i].name || '') === 'from-app') return issue
  }
  throw new Error('Issue #' + n + ' was not filed from the app')
}

/**
 * File a bug/feature report from the app as a GitHub issue.
 *
 * Gated by the same shared secret as the chat routes: the /exec URL is public in
 * the bundle, so without it anyone could spam the repo with issues on the token
 * held here. `context` is whatever the client attached (userAgent, url, a chat
 * tail) and is appended verbatim under a fenced block.
 *
 * The issue is locked as soon as it exists. Its thread is read by the auto-fixer
 * and fed to a model, and on a public repo anyone at all can comment on an open
 * issue — a locked one takes comments only from collaborators, which here means
 * the account this token belongs to, the same one answerIssue posts as. The
 * fixer filters the thread by author as well; this closes the door at the source.
 * A lock that fails is logged and not fatal: the issue is already filed, and
 * throwing here would have the app retry and file it twice.
 */
function createIssue(body) {
  if (!body || body.secret !== chatSecret()) throw new Error('Bad chat secret')
  const title = String(body.title || '').trim()
  if (!title) throw new Error('Issue title is required')

  const area = String(body.area || '').trim()
  const parts = [String(body.body || '').trim() || '_(no description provided)_']
  if (body.context) {
    parts.push('', '---', '```', String(body.context), '```')
  }
  // `auto-fix` is the label the local watcher (scripts/autofix.mjs) polls for, so
  // tagging it here hands every coach-filed report straight to the auto-fixer.
  const labels = ['from-app', FIX_LABEL]
  if (area) labels.push('area:' + area)

  const data = githubApi('post', '/issues', {
    title: title,
    body: parts.join('\n'),
    labels: labels,
  })
  try {
    githubApi('put', '/issues/' + data.number + '/lock', { lock_reason: 'off-topic' })
  } catch (err) {
    console.error('Filed #' + data.number + ' but could not lock it: ' + err)
  }
  return { number: data.number, url: data.html_url }
}

/**
 * One issue's comment thread, so the app can show what the auto-fixer asked.
 *
 * Comments come back oldest-first, which is what makes "the last one" the
 * question while the issue is sitting under `needs-input`.
 */
function getIssueThread(secret, number) {
  if (secret !== chatSecret()) throw new Error('Bad chat secret')
  const issue = requireAppIssue(number)
  const raw = githubApi('get', '/issues/' + issue.number + '/comments?per_page=100')
  const comments = []
  for (let i = 0; i < raw.length; i++) {
    comments.push({
      id: raw[i].id,
      author: raw[i].user ? String(raw[i].user.login || '') : '',
      body: String(raw[i].body || ''),
      createdAt: raw[i].created_at,
    })
  }
  const labels = []
  const issueLabels = issue.labels || []
  for (let j = 0; j < issueLabels.length; j++) labels.push(String(issueLabels[j].name || ''))
  return {
    number: issue.number,
    title: String(issue.title || ''),
    state: issue.state,
    labels: labels,
    comments: comments,
  }
}

/**
 * Answer the auto-fixer's question from the app.
 *
 * Posts the answer as a comment, then swaps `needs-input` back for `auto-fix` so
 * the next poll on the laptop picks the issue up again and re-reads the thread.
 * The label swap is the handoff — without it the answer just sits there.
 */
function answerIssue(body) {
  if (!body || body.secret !== chatSecret()) throw new Error('Bad chat secret')
  const answer = String(body.answer || '').trim()
  if (!answer) throw new Error('An answer is required')
  const issue = requireAppIssue(body.number)

  githubApi('post', '/issues/' + issue.number + '/comments', {
    body: '**Answered from the app:**\n\n' + answer,
  })
  // A hand-removed label (or a second answer) makes this a 404 — the issue is
  // already off `needs-input`, which is all this call was for.
  try {
    githubApi('delete', '/issues/' + issue.number + '/labels/' + encodeURIComponent(ASK_LABEL))
  } catch (err) {
    // already gone
  }
  githubApi('post', '/issues/' + issue.number + '/labels', { labels: [FIX_LABEL] })
  return { answered: issue.number }
}

/**
 * List the issues this app has filed, newest first, with their current state.
 *
 * Every issue reported from the app carries the `from-app` label (see
 * createIssue), and this is a single-user tracker, so that label is exactly "the
 * issues I submitted through the coach." Gated by the same shared secret as the
 * other issue routes — a private repo's issues need the token to read, and the
 * /exec URL is public in the bundle.
 *
 * `state=all` so a closed (fixed) issue still shows its progress. GitHub folds
 * pull requests into the issues list, so anything carrying a `pull_request` key
 * is dropped. `area` is lifted back out of the `area:<x>` label createIssue set.
 */
function listIssues(secret) {
  if (secret !== chatSecret()) throw new Error('Bad chat secret')
  const data = githubApi(
    'get',
    '/issues?labels=from-app&state=all&per_page=100&sort=created&direction=desc',
  )
  const out = []
  for (let i = 0; i < data.length; i++) {
    const it = data[i]
    if (it.pull_request) continue // the list endpoint mixes PRs in with issues
    let area = ''
    const names = []
    const labels = it.labels || []
    for (let j = 0; j < labels.length; j++) {
      const name = String(labels[j].name || '')
      names.push(name)
      if (name.indexOf('area:') === 0) area = name.slice('area:'.length)
    }
    out.push({
      number: it.number,
      title: String(it.title || ''),
      url: it.html_url,
      state: it.state, // 'open' | 'closed'
      area: area,
      createdAt: it.created_at,
      closedAt: it.closed_at || '',
      // The whole label set, not just area: the auto-fixer marks an issue it has
      // claimed with `autofix-running`, which is how the app shows "working".
      labels: names,
    })
  }
  return out
}

/* ---------------------------------------------------------------- helpers */

// A tab by name, made on first touch. Per-account data tabs go through the
// request's prefix; `owner` is for the few tabs that belong to the book rather
// than to anyone in it (see ownerSheet).
function sheet(name, headers, owner) {
  const tab = owner ? name : TAB_PREFIX + name
  let sh = ss.getSheetByName(tab)
  if (!sh) {
    // A read isn't lock-held, so it can race a write to create the same tab.
    // insertSheet throws on a name that now exists — whoever won made it, so
    // take theirs rather than failing the request.
    try {
      sh = ss.insertSheet(tab)
    } catch (err) {
      sh = ss.getSheetByName(tab)
      if (!sh) throw err
      return sh
    }
    writeRows(sh, 1, 1, [headers])
    return sh
  }
  // A tab created before a column was added is missing that header cell, and the
  // header row is what makes the sheet legible by hand. Fill in only the cells to
  // the right of what's already there, so an existing header is never rewritten
  // and no data column is touched.
  const width = sh.getLastColumn()
  if (width < headers.length) {
    const missing = headers.slice(width)
    writeRows(sh, 1, width + 1, [missing])
  }
  return sh
}

function ownerSheet(name, headers) {
  return sheet(name, headers, true)
}

function isoDate(value) {
  const tz = ss.getSpreadsheetTimeZone()
  if (value instanceof Date) {
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd')
  }
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s // already ISO
  const d = new Date(s) // reparse long/locale date strings from the sheet
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd')
  return s
}

/* ------------------------------------------------- google calendar sync */

// Two-way sync of someone's schedule with a calendar in their own Google
// account. The app decides what changes (src/lib/calendarSync.ts does the
// merge); this end holds the one thing a browser can't keep - the account's
// refresh token - and makes the Google calls it is told to. So it is a proxy
// with a narrow menu: read our calendar's events in a window, make, retitle and
// delete events in it, and remember the set both sides last agreed on.
//
// The link lives in script properties (`gcal_<account id>`), not in a sheet tab:
// it holds a credential, and the sheet is a book a person opens.
//
// The scope is the narrowest Google offers: calendars this app made, and the
// events on them. It can't read anyone's own calendar. Sync is off for everyone
// until GCAL_CLIENT_ID and GCAL_CLIENT_SECRET are set (see BACKEND.md).
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'
const GCAL_API = 'https://www.googleapis.com/calendar/v3'
const GCAL_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GCAL_CALENDAR_NAME = 'Workout Tracker'
const GCAL_PILLARS = { strength: true, flexibility: true, cardio: true }
const GCAL_DATE = /^\d{4}-\d{2}-\d{2}$/
// The most one request may ask for: eight weeks of three pillars is 168.
const GCAL_MAX_OPS = 200

function gcalConfig() {
  const id = scriptProp('GCAL_CLIENT_ID')
  const secret = scriptProp('GCAL_CLIENT_SECRET')
  if (!id || !secret) return null
  // The address Google sends the person back to must be the one registered
  // with the OAuth client, character for character, so it can be pinned.
  const redirect = scriptProp('GCAL_REDIRECT_URI') || ScriptApp.getService().getUrl()
  return { id: id, secret: secret, redirect: redirect }
}

function gcalKey() {
  return 'gcal_' + (ACCOUNT.id || 'owner')
}

function gcalLoad(key) {
  const raw = PropertiesService.getScriptProperties().getProperty(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    return null
  }
}

function gcalSave(key, link) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(link))
}

function gcalDrop(key) {
  PropertiesService.getScriptProperties().deleteProperty(key)
  CacheService.getScriptCache().remove('gcal_at_' + key)
}

function gcalQuery(params) {
  return Object.keys(params)
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]) })
    .join('&')
}

/** Whether sync is set up on this backend, and whether this account is linked. */
function gcalStatus() {
  const cfg = gcalConfig()
  return { saved: 1, available: !!cfg, connected: !!(cfg && gcalLoad(gcalKey())) }
}

/**
 * The Google consent page to send this account to. The `state` it carries back
 * is a one-time ticket naming the account, good for ten minutes: the callback
 * arrives as a bare GET with no account key on it.
 */
function gcalConnect(body) {
  const cfg = gcalConfig()
  if (!cfg) throw new Error('Calendar sync is not set up')
  const back = String((body && body.returnUrl) || '')
  const state = Utilities.getUuid().replace(/-/g, '')
  CacheService.getScriptCache().put(
    'gcal_state_' + state,
    JSON.stringify({ key: gcalKey(), back: /^https:\/\/[^\s"'<>]+$|^http:\/\/localhost[:\/][^\s"'<>]*$/.test(back) ? back : '' }),
    600,
  )
  return {
    saved: 1,
    url: 'https://accounts.google.com/o/oauth2/v2/auth?' + gcalQuery({
      client_id: cfg.id,
      redirect_uri: cfg.redirect,
      response_type: 'code',
      scope: GCAL_SCOPE,
      // offline + consent: the only combination that always hands back a refresh token.
      access_type: 'offline',
      prompt: 'consent',
      state: state,
    }),
  }
}

function gcalPage(message, back) {
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') }
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<body style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f5f5f5;padding:2rem;line-height:1.5">' +
    '<h1 style="font-size:1.25rem">' + esc(message) + '</h1>' +
    (back ? '<p><a target="_top" style="color:#4ade80" href="' + esc(back) + '">back to the app</a></p>' : '') +
    '</body>',
  ).setTitle('Workout Tracker')
}

/** Google sending someone back from the consent page: trade the code for a refresh token and keep it. */
function gcalCallback(params) {
  const cache = CacheService.getScriptCache()
  const raw = cache.get('gcal_state_' + String(params.state || ''))
  if (!raw) return gcalPage('That link has expired. Start again from the app.', '')
  cache.remove('gcal_state_' + params.state)
  const ticket = JSON.parse(raw)
  const cfg = gcalConfig()
  if (!cfg || !params.code) return gcalPage('Google Calendar was not connected.', ticket.back)
  const res = UrlFetchApp.fetch(GCAL_TOKEN_URL, {
    method: 'post',
    payload: {
      code: params.code,
      client_id: cfg.id,
      client_secret: cfg.secret,
      redirect_uri: cfg.redirect,
      grant_type: 'authorization_code',
    },
    muteHttpExceptions: true,
  })
  let tokens = {}
  try {
    tokens = JSON.parse(res.getContentText())
  } catch (err) { /* not JSON: treated as a refusal below */ }
  if (!tokens.refresh_token) return gcalPage('Google Calendar was not connected.', ticket.back)
  // A fresh link starts with no calendar and nothing agreed: the first sync makes both.
  gcalSave(ticket.key, { refresh: tokens.refresh_token, calendarId: '', base: [] })
  return gcalPage('Google Calendar is connected. You can close this page.', ticket.back)
}

/** An access token for the link, refreshed when the cached one has run out. Null when Google has withdrawn it. */
function gcalAccess(key, link) {
  const cache = CacheService.getScriptCache()
  const held = cache.get('gcal_at_' + key)
  if (held) return held
  const cfg = gcalConfig()
  if (!cfg) return null
  const res = UrlFetchApp.fetch(GCAL_TOKEN_URL, {
    method: 'post',
    payload: {
      refresh_token: link.refresh,
      client_id: cfg.id,
      client_secret: cfg.secret,
      grant_type: 'refresh_token',
    },
    muteHttpExceptions: true,
  })
  let out = {}
  try {
    out = JSON.parse(res.getContentText())
  } catch (err) { /* handled as a failure below */ }
  if (out.access_token) {
    cache.put('gcal_at_' + key, out.access_token, Math.max(60, Math.min(3000, Number(out.expires_in || 3600) - 300)))
    return out.access_token
  }
  // Access taken away in the person's Google account: the link is dead, and
  // saying so lets the app switch its setting off rather than fail forever.
  if (out.error === 'invalid_grant') {
    gcalDrop(key)
    return null
  }
  throw new Error('Google did not answer the calendar sign-in')
}

function gcalRequest(token, method, path, body) {
  const req = {
    url: GCAL_API + path,
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  }
  if (body) {
    req.contentType = 'application/json'
    req.payload = JSON.stringify(body)
  }
  return req
}

function gcalCall(token, method, path, body) {
  const req = gcalRequest(token, method, path, body)
  const res = UrlFetchApp.fetch(req.url, req)
  let data = null
  try {
    data = JSON.parse(res.getContentText() || 'null')
  } catch (err) { /* an empty or non-JSON body: the code says enough */ }
  return { code: res.getResponseCode(), data: data }
}

function gcalShiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function gcalMakeCalendar(key, link, token) {
  const made = gcalCall(token, 'post', '/calendars', { summary: GCAL_CALENDAR_NAME })
  if (made.code !== 200 || !made.data || !made.data.id) throw new Error('Could not make the Google calendar')
  link.calendarId = made.data.id
  link.base = []
  gcalSave(key, link)
}

/**
 * The link and a token for this account, or null when it isn't linked (or
 * Google has cut it off).
 */
function gcalSession() {
  const key = gcalKey()
  const link = gcalLoad(key)
  if (!link) return null
  const token = gcalAccess(key, link)
  if (!token) return null
  return { key: key, link: link, token: token }
}

/**
 * Our events in the calendar between two dates, and the set last agreed on.
 * The calendar is made on the first call, and made again if it was deleted in
 * Google - with nothing agreed, so the app's sessions are simply written back.
 */
function gcalState(body) {
  const from = String((body && body.from) || '')
  const to = String((body && body.to) || '')
  if (!GCAL_DATE.test(from) || !GCAL_DATE.test(to)) throw new Error('gcal_state needs from and to dates')
  const s = gcalSession()
  if (!s) return { saved: 1, connected: false, events: [], base: [] }
  if (!s.link.calendarId) gcalMakeCalendar(s.key, s.link, s.token)

  const list = function () {
    // A day of slack either side: an all-day event's edges are in the
    // calendar's time zone, and the app filters to the exact dates anyway.
    return gcalCall(s.token, 'get', '/calendars/' + encodeURIComponent(s.link.calendarId) + '/events?' + gcalQuery({
      timeMin: gcalShiftDate(from, -1) + 'T00:00:00Z',
      timeMax: gcalShiftDate(to, 2) + 'T00:00:00Z',
      singleEvents: 'true',
      showDeleted: 'false',
      maxResults: '2500',
    }))
  }
  let res = list()
  if (res.code === 404 || res.code === 410) {
    gcalMakeCalendar(s.key, s.link, s.token)
    res = list()
  }
  if (res.code !== 200 || !res.data) throw new Error('Google Calendar did not answer (' + res.code + ')')

  const events = []
  const items = res.data.items || []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const pillar = it.extendedProperties && it.extendedProperties.private && it.extendedProperties.private.wt
    // Anything without our mark was put there by hand and is none of ours.
    if (!pillar || !GCAL_PILLARS[pillar] || !it.start) continue
    const date = it.start.date || String(it.start.dateTime || '').slice(0, 10)
    if (!GCAL_DATE.test(date)) continue
    events.push({ id: it.id, pillar: pillar, date: date, title: String(it.summary || '') })
  }
  return { saved: 1, connected: true, events: events, base: s.link.base || [] }
}

/**
 * Make, retitle and delete events as the app's merge decided, then remember
 * the set it says both sides now hold. The set is only remembered when every
 * call landed: a base that claims an event Google never took would read, next
 * time, as that event deleted by hand.
 */
function gcalApply(body) {
  const create = (body && body.create) || []
  const update = (body && body.update) || []
  const remove = (body && body.remove) || []
  const base = (body && body.base) || []
  if (create.length + update.length + remove.length > GCAL_MAX_OPS || base.length > GCAL_MAX_OPS * 2) {
    throw new Error('Too many calendar changes in one request')
  }
  const s = gcalSession()
  if (!s) return { saved: 1, connected: false, failed: 0 }
  if (!s.link.calendarId) throw new Error('gcal_apply before gcal_state')
  const events = '/calendars/' + encodeURIComponent(s.link.calendarId) + '/events'

  const requests = []
  for (let i = 0; i < create.length; i++) {
    const e = create[i]
    if (!e || !GCAL_PILLARS[e.pillar] || !GCAL_DATE.test(String(e.date))) throw new Error('Bad calendar event')
    requests.push(gcalRequest(s.token, 'post', events, {
      summary: String(e.title || e.pillar).slice(0, 200),
      start: { date: e.date },
      end: { date: gcalShiftDate(e.date, 1) },
      // A workout doesn't make someone busy to the people booking them.
      transparency: 'transparent',
      extendedProperties: { private: { wt: e.pillar } },
    }))
  }
  for (let i = 0; i < update.length; i++) {
    requests.push(gcalRequest(s.token, 'patch', events + '/' + encodeURIComponent(String(update[i].id)), {
      summary: String(update[i].title || '').slice(0, 200),
    }))
  }
  for (let i = 0; i < remove.length; i++) {
    requests.push(gcalRequest(s.token, 'delete', events + '/' + encodeURIComponent(String(remove[i]))))
  }

  let failed = 0
  if (requests.length) {
    const out = UrlFetchApp.fetchAll(requests)
    for (let i = 0; i < out.length; i++) {
      const code = out[i].getResponseCode()
      // Deleting what is already gone is the result that was asked for.
      const gone = requests[i].method === 'delete' && (code === 404 || code === 410)
      if (!(code >= 200 && code < 300) && !gone) failed++
    }
  }
  if (!failed) {
    s.link.base = base.filter(function (k) { return typeof k === 'string' && k.length <= 16 })
    gcalSave(s.key, s.link)
  }
  return { saved: 1, connected: true, failed: failed }
}

/**
 * Stop syncing: take the calendar this app made out of the person's Google
 * account, hand the access back, and forget the link. The calendar goes
 * because a later reconnect makes a new one, and two would be left standing.
 */
function gcalDisconnect() {
  const key = gcalKey()
  const link = gcalLoad(key)
  if (!link) return { saved: 1 }
  try {
    const token = gcalAccess(key, link)
    if (token && link.calendarId) gcalCall(token, 'delete', '/calendars/' + encodeURIComponent(link.calendarId))
    UrlFetchApp.fetch('https://oauth2.googleapis.com/revoke?' + gcalQuery({ token: link.refresh }), {
      method: 'post',
      muteHttpExceptions: true,
    })
  } catch (err) { /* Google unreachable: the link is still forgotten here */ }
  gcalDrop(key)
  return { saved: 1 }
}

function json(data, code) {
  // Apps Script web apps serve exec responses with CORS enabled for simple
  // requests, so no custom headers are needed here.
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
