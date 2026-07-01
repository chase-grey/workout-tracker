/**
 * Workout Tracker — Google Apps Script backend.
 *
 * A thin REST proxy over the bound Google Sheet. Deploy as a Web App
 * ("Execute as: Me", "Who has access: Anyone") and put the /exec URL into the
 * app's Settings (or VITE_API_URL at build time).
 *
 * Tabs (created automatically on first write):
 *   workouts:    session_id, date, day_type, exercise, set_number,
 *                weight_lbs, reps, notes, is_historical
 *   body_weight: date, weight_lbs
 *
 * Routes:
 *   GET  ?route=workouts[&since=YYYY-MM-DD]
 *   GET  ?route=bodyweight[&since=YYYY-MM-DD]
 *   POST ?route=session      body: { rows: WorkoutRow[] }
 *   POST ?route=import       body: { rows: WorkoutRow[] }   (historical)
 *   POST ?route=bodyweight   body: { date, weightLbs }
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
]
const BW_HEADERS = ['date', 'weight_lbs']

function doGet(e) {
  try {
    switch (e.parameter.route) {
      case 'workouts':
        return json(getWorkouts(e.parameter.since))
      case 'bodyweight':
        return json(getBodyWeight(e.parameter.since))
      default:
        return json({ error: 'Unknown route' }, 404)
    }
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500)
  }
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {}
    switch (e.parameter.route) {
      case 'session':
      case 'import':
        return json(appendWorkoutRows(body.rows))
      case 'bodyweight':
        return json(appendBodyWeight(body))
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
    out.push({
      session_id: String(r[0]),
      date: date,
      day_type: String(r[2]),
      exercise: String(r[3]),
      set_number: Number(r[4]),
      weight_lbs: r[5] === '' || r[5] === null ? null : Number(r[5]),
      reps: Number(r[6]),
      notes: String(r[7] || ''),
      is_historical: r[8] === true || String(r[8]).toUpperCase() === 'TRUE',
    })
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
  ])
  sh.getRange(sh.getLastRow() + 1, 1, values.length, WORKOUT_HEADERS.length).setValues(values)
  return { saved: values.length }
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

/* ---------------------------------------------------------------- helpers */

function sheet(name, headers) {
  let sh = ss.getSheetByName(name)
  if (!sh) {
    sh = ss.insertSheet(name)
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
  }
  return sh
}

function isoDate(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
  }
  return String(value)
}

function json(data, code) {
  // Apps Script web apps serve exec responses with CORS enabled for simple
  // requests, so no custom headers are needed here.
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
