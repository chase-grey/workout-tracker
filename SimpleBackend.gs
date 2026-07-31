/**
 * Workout Tracker — Google Apps Script backend.
 *
 * A thin REST proxy over the bound Google Sheet. Deploy as a Web App
 * ("Execute as: Me", "Who has access: Anyone") and put the /exec URL into the
 * app's Settings (or VITE_API_URL at build time).
 *
 * Tabs (created automatically on first write):
 *   workouts:     session_id, date, day_type, exercise, set_number,
 *                 weight_lbs, reps, notes, is_historical
 *   body_weight:  date, weight_lbs
 *   measurements: date, waist_in, neck_in, note
 *   durations:    date, kind, day_type, total_sec, rest_sec  (per-session; feeds Time-spent report)
 *   exercise_times: exercise, avg_active_sec, n  (per-exercise rolling averages
 *                 for time-left estimates; a sentinel exercise "__rest__" row
 *                 holds the pooled average rest per interval)
 *
 * Routes:
 *   GET  ?route=workouts[&since=YYYY-MM-DD]
 *   GET  ?route=bodyweight[&since=YYYY-MM-DD]
 *   GET  ?route=measurements[&since=YYYY-MM-DD]
 *   GET  ?route=durations[&since=YYYY-MM-DD]
 *   GET  ?route=exercise_times   -> { active: { key: {avgSec,n} }, rest: {avgSec,n} }
 *   POST ?route=session       body: { rows: WorkoutRow[] }
 *   POST ?route=import        body: { rows: WorkoutRow[] }   (historical)
 *   POST ?route=bodyweight    body: { date, weightLbs }
 *   POST ?route=calories      body: { date, calories, label } (upsert by date; calories = running daily total)
 *   POST ?route=measurements  body: { date, waistIn, neckIn, note } (upsert by date)
 *   POST ?route=durations     body: { date, kind, dayType, totalSec, restSec } (append)
 *   POST ?route=exercise_times body: { exercises: [{exercise,totalActiveSec,sets}], restTotalSec, restCount }
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
const CALORIE_HEADERS = ['date', 'calories', 'label']
const MEASUREMENT_HEADERS = ['date', 'waist_in', 'neck_in', 'note']
const DURATION_HEADERS = ['date', 'kind', 'day_type', 'total_sec', 'rest_sec']
const EXERCISE_TIME_HEADERS = ['exercise', 'avg_active_sec', 'n']
// Sentinel "exercise" key whose row stores the pooled average rest per interval.
const REST_KEY = '__rest__'

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
      case 'measurements':
        return json(appendMeasurements(body))
      case 'durations':
        return json(appendDurations(body))
      case 'exercise_times':
        return json(foldExerciseTimes(body))
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
    out.push({ date: date, calories: Number(r[1]) || 0, label: String(r[2] || '') })
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
    upsertCalorieDate(sh, e.date, Math.max(0, Number(e.calories)), e.label || '')
    saved++
  }
  return { saved: saved }
}

function upsertCalorieDate(sh, date, calories, label) {
  const rows = sh.getDataRange().getValues()
  let firstRow = -1
  const extraRows = []
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0] && isoDate(rows[r][0]) === date) {
      if (firstRow === -1) firstRow = r + 1 // 1-based sheet row
      else extraRows.push(r + 1)
    }
  }
  if (firstRow === -1) {
    sh.appendRow([date, calories, label])
    return
  }
  sh.getRange(firstRow, 1, 1, CALORIE_HEADERS.length).setValues([[date, calories, label]])
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
  }
  return { saved: values.length }
}

/* ---------------------------------------------- per-exercise time averages */

// Returns { active: { exerciseKey: {avgSec, n} }, rest: {avgSec, n} }. The
// sentinel REST_KEY row (if present) supplies the pooled rest average.
function getExerciseTimes() {
  const sh = sheet('exercise_times', EXERCISE_TIME_HEADERS)
  const rows = sh.getDataRange().getValues()
  const active = {}
  let rest = { avgSec: 0, n: 0 }
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '')
    if (!key) continue
    const entry = { avgSec: Number(rows[i][1]) || 0, n: Number(rows[i][2]) || 0 }
    if (key === REST_KEY) rest = entry
    else active[key] = entry
  }
  return { active: active, rest: rest }
}

// Folds a finished session's samples into the rolling averages. For each
// exercise the running mean over all set-samples is exact:
//   newAvg = (avg*n + totalActiveSec) / (n + sets); n += sets
// The pooled rest row is folded the same way over rest intervals. Upserts one
// row per exercise key (plus the REST_KEY row).
function foldExerciseTimes(body) {
  const sh = sheet('exercise_times', EXERCISE_TIME_HEADERS)
  const list = Array.isArray(body.exercises) ? body.exercises : []

  const rows = sh.getDataRange().getValues()
  const rowByKey = {}
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '')
    if (key && !(key in rowByKey)) rowByKey[key] = i + 1 // 1-based sheet row
  }

  function upsert(key, addSumSec, addCount) {
    if (!key || !(addCount > 0) || !isFinite(Number(addSumSec)) || Number(addSumSec) < 0) return
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
  }

  let saved = 0
  for (let i = 0; i < list.length; i++) {
    const e = list[i]
    if (!e || !e.exercise || !(Number(e.sets) > 0)) continue
    upsert(String(e.exercise), Number(e.totalActiveSec), Number(e.sets))
    saved++
  }
  if (Number(body.restCount) > 0) upsert(REST_KEY, Number(body.restTotalSec), Number(body.restCount))
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
