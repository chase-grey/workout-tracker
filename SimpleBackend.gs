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
const FLEX_HEADERS = ['date', 'split_deg', 'tailors_left_deg', 'tailors_right_deg', 'note']
const CONFIG_HEADERS = ['key', 'value']
const CALORIE_HEADERS = ['date', 'calories', 'label']

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
      case 'plan':
        return json(getPlan())
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
      case 'flexibility':
        return json(appendFlex(body))
      case 'calories':
        return json(appendCalories(body))
      case 'plan':
        return json(savePlan(body.plan))
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

/* ------------------------------------------------------- flexibility + plan */

// Ensure the flexibility sheet uses the multi-angle schema, migrating the old
// [date, angle_deg, note] layout in place (old angle_deg -> split_deg).
function flexSheet() {
  let sh = ss.getSheetByName('flexibility')
  if (!sh) {
    sh = ss.insertSheet('flexibility')
    sh.getRange(1, 1, 1, FLEX_HEADERS.length).setValues([FLEX_HEADERS])
    return sh
  }
  const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
  if (header[1] === 'angle_deg') {
    const data = sh.getDataRange().getValues()
    const migrated = [FLEX_HEADERS]
    for (let i = 1; i < data.length; i++) {
      const r = data[i]
      if (!r[0]) continue
      migrated.push([r[0], r[1], '', '', r[2] || '']) // date, split_deg, tl, tr, note
    }
    sh.clearContents()
    sh.getRange(1, 1, migrated.length, FLEX_HEADERS.length).setValues(migrated)
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
      tailorsLeftDeg: numOrNull(r[2]),
      tailorsRightDeg: numOrNull(r[3]),
      note: String(r[4] || ''),
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
        const split = e.splitDeg == null ? cur[1] : Number(e.splitDeg)
        const tl = e.tailorsLeftDeg == null ? cur[2] : Number(e.tailorsLeftDeg)
        const tr = e.tailorsRightDeg == null ? cur[3] : Number(e.tailorsRightDeg)
        const note = e.note ? e.note : cur[4] || ''
        sh.getRange(existingRow, 1, 1, FLEX_HEADERS.length).setValues([[e.date, split, tl, tr, note]])
      } else {
        sh.appendRow([
          e.date,
          numOrBlank(e.splitDeg),
          numOrBlank(e.tailorsLeftDeg),
          numOrBlank(e.tailorsRightDeg),
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
    out.push({ date: date, calories: Number(r[1]) || 0, label: String(r[2] || '') })
  }
  return out
}

function appendCalories(body) {
  const sh = sheet('calories', CALORIE_HEADERS)
  const list = Array.isArray(body.entries) ? body.entries : [body]
  const values = list
    .filter(function (e) {
      return e && e.date && isFinite(Number(e.calories))
    })
    .map(function (e) {
      return [e.date, Number(e.calories), e.label || '']
    })
  if (values.length) {
    sh.getRange(sh.getLastRow() + 1, 1, values.length, CALORIE_HEADERS.length).setValues(values)
  }
  return { saved: values.length }
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
