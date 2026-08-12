/**
 * Workout Tracker — Google Apps Script backend.
 *
 * A thin REST proxy over the bound Google Sheet. Deploy as a Web App
 * ("Execute as: Me", "Who has access: Anyone") and put the /exec URL into the
 * app's Settings (or VITE_API_URL at build time).
 *
 * Two rules hold across every write here, both learned from losing data:
 *   - Mutating routes run under `withLock` (see it for the race they lose).
 *   - A write that stores nothing THROWS rather than returning {saved: 0}. Apps
 *     Script can't set a status code, so a cheerful zero is indistinguishable
 *     from a real save: the client marks the row synced and drops it forever.
 *
 * Tabs (created automatically on first write):
 *   workouts:     session_id, date, day_type, exercise, set_number,
 *                 weight_lbs, reps, notes, is_historical, variant
 *                 (variant = which A/B slot of a Push + Core day the set was
 *                 trained in; blank for every other day and for imports)
 *   body_weight:  date, weight_lbs
 *   measurements: date, waist_in, neck_in, note
 *   durations:    date, kind, day_type, total_sec, rest_sec  (per-session; feeds Time-spent report)
 *   exercise_times: exercise, avg_active_sec, n  (per-exercise rolling averages
 *                 for time-left estimates; a sentinel exercise "__rest_ratio__"
 *                 row holds the pooled observed÷prescribed rest ratio, and the
 *                 legacy "__rest__" row holds pooled rest seconds — still written
 *                 for older clients, no longer served)
 *   config:       key, value  (one JSON blob per key: "plan", "settings",
 *                 "chat_endpoint")
 *
 * Routes:
 *   GET  ?route=workouts[&since=YYYY-MM-DD]
 *   GET  ?route=bodyweight[&since=YYYY-MM-DD]
 *   GET  ?route=measurements[&since=YYYY-MM-DD]
 *   GET  ?route=durations[&since=YYYY-MM-DD]
 *   GET  ?route=exercise_times   -> { active: { key: {avgSec,n} }, restRatio: {ratio,n} }
 *   GET  ?route=settings         -> the account's settings blob, or null (see getSettings)
 *   POST ?route=settings      body: { settings: {…} }  (whole; declines a stale copy)
 *   GET  ?route=chat_endpoint&secret=…  -> { url, updatedAt } (see getChatEndpoint)
 *   POST ?route=chat_endpoint    body: { url, secret }
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
 *   POST ?route=calories      body: { date, calories, label, loggedAt } (upsert by date; calories = running daily total,
 *                 loggedAt = ISO time of the last tap made ON that date; omitted on a backfill, which keeps the stored one)
 *   POST ?route=measurements  body: { date, waistIn, neckIn, note } (upsert by date)
 *   POST ?route=durations     body: { date, kind, dayType, totalSec, restSec } (append)
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
]
const CONFIG_HEADERS = ['key', 'value']
const CALORIE_HEADERS = ['date', 'calories', 'label', 'logged_at']
const MEASUREMENT_HEADERS = ['date', 'waist_in', 'neck_in', 'note']
const DURATION_HEADERS = ['date', 'kind', 'day_type', 'total_sec', 'rest_sec']
const EXERCISE_TIME_HEADERS = ['exercise', 'avg_active_sec', 'n']
// Sentinel "exercise" key whose row stores the pooled average rest per interval,
// in seconds. Retired: pooling full rests, circuit station changes and capped
// transitions into one duration underestimates every long rest. Still written so
// an older client keeps working, but no longer read back.
const REST_KEY = '__rest__'
// Sentinel key whose row stores the pooled rest RATIO (observed ÷ prescribed) in
// the avg_active_sec column and the interval count in n. Unitless, so each step
// can be priced against its own prescribed rest.
const REST_RATIO_KEY = '__rest_ratio__'

function doGet(e) {
  try {
    switch (e.parameter.route) {
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
      case 'chat_endpoint':
        return json(getChatEndpoint(e.parameter.secret))
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
    switch (e.parameter.route) {
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
      case 'chat_endpoint':
        return json(withLock(function () { return saveChatEndpoint(body) }))
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
  const sh = sheet('workouts', WORKOUT_HEADERS)
  const values = rows.map((r) => [
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
  sh.getRange(sh.getLastRow() + 1, 1, values.length, WORKOUT_HEADERS.length).setValues(values)
  return { saved: values.length }
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
    sh.getRange(i + 1, notesCol).setValue(notes)
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
    if (values.length) {
      sh.getRange(sh.getLastRow() + 1, 1, values.length, BW_HEADERS.length).setValues(values)
    }
    return { saved: values.length }
  }

  // Single form: { date, weightLbs }
  const weight = Number(body.weightLbs)
  if (!isFinite(weight) || weight <= 0) throw new Error('Invalid weight')
  sh.appendRow([body.date || isoDate(new Date()), weight])
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
  let sh = ss.getSheetByName('flexibility')
  if (!sh) {
    sh = ss.insertSheet('flexibility')
    sh.getRange(1, 1, 1, FLEX_HEADERS.length).setValues([FLEX_HEADERS])
    return sh
  }
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]

  // Rewrite every data row through `map` into the current column layout.
  function migrate(map) {
    const data = sh.getDataRange().getValues()
    const migrated = [FLEX_HEADERS]
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue
      migrated.push(map(data[i]))
    }
    sh.clearContents()
    sh.getRange(1, 1, migrated.length, FLEX_HEADERS.length).setValues(migrated)
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

  return sh
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
        sh.getRange(existingRow, 1, 1, FLEX_HEADERS.length).setValues([
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
          ],
        ])
      } else {
        sh.appendRow([
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
    upsertCalorieDate(sh, e.date, Math.max(0, Number(e.calories)), e.label || '', e.loggedAt || '')
    saved++
  }
  if (saved === 0 && list.length) {
    throw new Error('No valid calorie rows among ' + list.length + ' submitted')
  }
  return { saved: saved }
}

function upsertCalorieDate(sh, date, calories, label, loggedAt) {
  const rows = sh.getDataRange().getValues()
  let firstRow = -1
  let storedLoggedAt = ''
  const extraRows = []
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] && isoDate(rows[r][0]) === date) {
      if (firstRow === -1) {
        firstRow = r + 1 // 1-based sheet row
        storedLoggedAt = String(rows[r][3] || '')
      } else extraRows.push(r + 1)
    }
  }
  if (firstRow === -1) {
    sh.appendRow([date, calories, label, loggedAt])
    return
  }
  // A backfill sends no log time; keep the one already stored rather than
  // blanking a real same-day timestamp with the correction's silence.
  const at = loggedAt || storedLoggedAt
  sh.getRange(firstRow, 1, 1, CALORIE_HEADERS.length).setValues([[date, calories, label, at]])
  // Delete leftover legacy rows bottom-up so earlier indices stay valid.
  for (let k = extraRows.length - 1; k >= 0; k--) {
    sh.deleteRow(extraRows[k])
  }
}

function getMeasurements(since) {
  const sh = sheet('measurements', MEASUREMENT_HEADERS)
  const rows = sh.getDataRange().getValues()
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r[0]) continue
    const date = isoDate(r[0])
    if (since && date < since) continue
    out.push({
      date: date,
      waistIn: Number(r[1]),
      neckIn: Number(r[2]),
      note: String(r[3] || ''),
    })
  }
  return out
}

// Upsert by date: a new measurement for an existing date overwrites that row.
function appendMeasurements(body) {
  const sh = sheet('measurements', MEASUREMENT_HEADERS)
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
      return e && e.date && isFinite(Number(e.waistIn)) && isFinite(Number(e.neckIn))
    })
    .forEach(function (e) {
      const values = [e.date, Number(e.waistIn), Number(e.neckIn), e.note || '']
      const existingRow = rowByDate[e.date]
      if (existingRow) {
        sh.getRange(existingRow, 1, 1, MEASUREMENT_HEADERS.length).setValues([values])
      } else {
        sh.appendRow(values)
        rowByDate[e.date] = sh.getLastRow()
      }
      saved++
    })
  // A measurement that fails the waist/neck check would otherwise be reported
  // as saved and dropped by the client.
  if (saved === 0 && list.length) {
    throw new Error('No valid measurement rows among ' + list.length + ' submitted')
  }
  return { saved: saved }
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
      return [e.date, e.kind || 'workout', e.dayType || '', Number(e.totalSec), Number(e.restSec) || 0]
    })
  if (values.length) {
    sh.getRange(sh.getLastRow() + 1, 1, values.length, DURATION_HEADERS.length).setValues(values)
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
      sh.getRange(existingRow, 1, 1, EXERCISE_TIME_HEADERS.length).setValues([[key, newAvg, newN]])
    } else {
      sh.appendRow([key, newAvg, newN])
      rowByKey[key] = sh.getLastRow()
    }
    return true
  }

  let saved = 0
  let folded = 0
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (!e || !e.exercise || !(Number(e.sets) > 0)) continue
    if (upsert(String(e.exercise), Number(e.totalActiveSec), Number(e.sets))) folded++
    saved++
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
  return { saved: saved }
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
      sh.getRange(i + 1, 2).setValue(value)
      return { saved: 1 }
    }
  }
  sh.appendRow(['plan', value])
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
      sh.getRange(i + 1, 2).setValue(value)
      return { saved: 1 }
    }
  }
  sh.appendRow(['settings', value])
  return { saved: 1 }
}

/* ------------------------------------------------------------ chat endpoint */

/**
 * Where the phone should send chat, published by whichever laptop is running
 * `npm run dev:tunnel`.
 *
 * The chat coach needs a proxy holding an Epic key that can reach the internal
 * Epic LLM host, so it only exists while that laptop is up — behind a Cloudflare
 * quick tunnel whose hostname is new every run. The installed app can't chase a
 * moving hostname, so the laptop leaves its current address here and the phone
 * reads it. That keeps the app installed from a URL that never changes.
 *
 * Both directions require CHAT_SHARED_SECRET, a Script Property you set once
 * under Project Settings → Script properties. The /exec URL is baked into the
 * public web bundle, so without it anyone could read the live tunnel address and
 * spend the Epic key behind it — or publish an address of their own and receive
 * the chat instead. Unset, this refuses to serve rather than failing open.
 */
function chatSecret() {
  const expected = PropertiesService.getScriptProperties().getProperty('CHAT_SHARED_SECRET')
  if (!expected) {
    throw new Error('CHAT_SHARED_SECRET script property is not set on the backend')
  }
  return expected
}

function getChatEndpoint(secret) {
  if (secret !== chatSecret()) throw new Error('Bad chat secret')
  const sh = sheet('config', CONFIG_HEADERS)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'chat_endpoint') {
      try {
        return JSON.parse(rows[i][1])
      } catch (e) {
        return { url: null }
      }
    }
  }
  return { url: null } // no laptop has published yet
}

function saveChatEndpoint(body) {
  if (!body || body.secret !== chatSecret()) throw new Error('Bad chat secret')
  const url = String(body.url || '').replace(/\/$/, '')
  // Only an https origin, no path/query — this value becomes the prefix of a
  // URL the phone POSTs its workout context to.
  if (!/^https:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9](:\d+)?$/i.test(url)) {
    throw new Error('Invalid chat endpoint: ' + url)
  }
  const value = JSON.stringify({ url: url, updatedAt: new Date().toISOString() })
  const sh = sheet('config', CONFIG_HEADERS)
  const rows = sh.getDataRange().getValues()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === 'chat_endpoint') {
      sh.getRange(i + 1, 2).setValue(value)
      return { saved: 1 }
    }
  }
  sh.appendRow(['chat_endpoint', value])
  return { saved: 1 }
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

function sheet(name, headers) {
  let sh = ss.getSheetByName(name)
  if (!sh) {
    // A read isn't lock-held, so it can race a write to create the same tab.
    // insertSheet throws on a name that now exists — whoever won made it, so
    // take theirs rather than failing the request.
    try {
      sh = ss.insertSheet(name)
    } catch (err) {
      sh = ss.getSheetByName(name)
      if (!sh) throw err
      return sh
    }
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
    return sh
  }
  // A tab created before a column was added is missing that header cell, and the
  // header row is what makes the sheet legible by hand. Fill in only the cells to
  // the right of what's already there, so an existing header is never rewritten
  // and no data column is touched.
  const width = sh.getLastColumn()
  if (width < headers.length) {
    const missing = headers.slice(width)
    sh.getRange(1, width + 1, 1, missing.length).setValues([missing])
  }
  return sh
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

function json(data, code) {
  // Apps Script web apps serve exec responses with CORS enabled for simple
  // requests, so no custom headers are needed here.
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
