/**
 * Everything one person has logged, written out two ways.
 *
 * {@link buildExport} is the file: one JSON object holding every kind of record
 * the app keeps for an account, in the shapes the app itself reads, so it is
 * complete and could be read back. {@link buildAiText} is the same history as
 * plain text for a chat AI: a few lines saying what each table is and in what
 * units, then one short line per session or day.
 *
 * The text has to go through a chat box, so it has a budget
 * ({@link AI_EXPORT_MAX_CHARS}). A history that fits is written whole. One that
 * doesn't keeps its most recent stretch line by line — the longest of
 * {@link FULL_WINDOWS_DAYS} that fits — and folds everything before it into a
 * line per month (and, for a history years long, the oldest months into a
 * line per year); the text says where each line was drawn. The file is never
 * folded.
 *
 * What neither holds: progress photos (they are never stored by the app), and
 * anything that says how a device reaches the backend — its address, the
 * account key, the issue token, the coach's API key. The settings that go in
 * are the synced part only (lib/settingsSync), and {@link SECRET_KEYS} is
 * struck from them by name besides, so a key moved out of the device-local
 * list can't follow them into a file someone mails to themselves.
 *
 * The text names nobody: like the companion's prompt, it is on its way to a
 * third-party AI, and a name adds nothing an analysis needs.
 *
 * Pure and deterministic — no React/DOM, no storage, no clock.
 */

import type { BodyWeightEntry, WorkoutRow } from '../types'
import { ALL_EXERCISES, DAY_TYPES, repRangeLabel, type Plan, type PlannedExercise } from '../config/plan'
import type { FlexBlock } from '../config/flexPlan'
import type { FlexRoutineKey } from '../config/flexRoutines'
import type { Settings } from '../services/storage'
import type { MeasurementEntry } from './bodyComp'
import type { CalorieEntry } from './calories'
import type { CardioEntry } from './cardio'
import { describeCardioPlan, planActive } from './cardioPlan'
import { bodyFacts, strengthFacts } from './contextPack'
import { parseISODate, toISODate } from './dates'
import type { ExerciseAverages, SessionDuration } from './estimate'
import type { FlexEntry } from './flex'
import { hasPillar, type DietDirection } from './profile'
import { syncablePart, type SyncedSettings } from './settingsSync'
import type { WeeklyGoalConfig } from './weeklyStreak'

export const EXPORT_FORMAT = 'workout-tracker-export'
export const EXPORT_VERSION = 1

/**
 * The most the AI text may run to, analysis prompt included. Digits cost more
 * tokens than words do, so this is some 11–13k tokens: inside the 16k context
 * the smallest free chat tier works in, with room left for the answer.
 */
export const AI_EXPORT_MAX_CHARS = 32_000

/** How much recent history the text may keep line by line, longest first; null is all of it. */
export const FULL_WINDOWS_DAYS: readonly (number | null)[] = [null, 730, 365, 270, 180, 120, 90, 56, 28]

/** Settings that are credentials or addresses, never written whatever list they sit in. */
export const SECRET_KEYS = ['apiUrl', 'openAiKey', 'chatToken', 'accountToken', 'aiBaseUrl'] as const

export type ExportInput = {
  /** ISO timestamp of the export. */
  exportedAt: string
  /** The day it was made, YYYY-MM-DD: what "recent" is counted back from. */
  today: string
  /** The app build that wrote it. */
  build?: string
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  flexEntries: FlexEntry[]
  calorieEntries: CalorieEntry[]
  measurements: MeasurementEntry[]
  durations: SessionDuration[]
  cardioEntries: CardioEntry[]
  exerciseAverages: ExerciseAverages
  plan: Plan
  flexPlans: Record<FlexRoutineKey, FlexBlock[]>
  settings: Settings
  /** The weekly goals in force now, as the app scores them. */
  weeklyGoals: WeeklyGoalConfig
  /** The daily calorie target in force now, or null with none. */
  calorieGoal: number | null
  dietDirection?: DietDirection
}

/** What an exercise key means: its name, and whether its "reps" are seconds held. */
export type ExportedExercise = { name: string; timed?: true; bodyweight?: true }

export type DataExport = {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  build?: string
  units: Record<string, string>
  notes: string[]
  /** Every exercise key in the history or the plan. */
  exercises: Record<string, ExportedExercise>
  /** One row per set, as the sheet stores them. */
  workouts: WorkoutRow[]
  /** The wall clock of each finished session: total and resting seconds. */
  sessionDurations: SessionDuration[]
  exerciseAverages: ExerciseAverages
  bodyWeights: BodyWeightEntry[]
  measurements: MeasurementEntry[]
  flexibility: FlexEntry[]
  calories: CalorieEntry[]
  cardio: CardioEntry[]
  plan: Plan
  flexPlans: Record<FlexRoutineKey, FlexBlock[]>
  goals: { weekly: WeeklyGoalConfig; calorieGoal: number | null; dietDirection?: DietDirection }
  /** The account's settings: profile, goal histories, cardio plan, committed goals, schedule. */
  settings: Partial<SyncedSettings>
}

const byDate = <T extends { date: string }>(rows: T[]): T[] =>
  rows.map((r, i) => [r, i] as const).sort((a, b) => a[0].date.localeCompare(b[0].date) || a[1] - b[1]).map(([r]) => r)

function plannedByKey(plan: Plan): Map<string, PlannedExercise> {
  const known = new Map<string, PlannedExercise>()
  for (const e of ALL_EXERCISES) known.set(e.key, e)
  // The person's own plan last: an exercise they made or retuned is theirs to define.
  for (const d of DAY_TYPES) for (const e of plan[d]?.exercises ?? []) known.set(e.key, e)
  return known
}

/** The account's settings with nothing in them a stranger could use. */
export function exportableSettings(settings: Settings): Partial<SyncedSettings> {
  const out = { ...syncablePart(settings) } as Record<string, unknown>
  for (const k of SECRET_KEYS) delete out[k]
  return out as Partial<SyncedSettings>
}

/** The whole account as one object, ready for JSON.stringify. */
export function buildExport(input: ExportInput): DataExport {
  const known = plannedByKey(input.plan)
  const keys = new Set<string>(input.workouts.map((w) => w.exercise))
  for (const d of DAY_TYPES) for (const e of input.plan[d]?.exercises ?? []) keys.add(e.key)
  const exercises: Record<string, ExportedExercise> = {}
  for (const key of [...keys].sort()) {
    const e = known.get(key)
    exercises[key] = {
      name: e?.name ?? key.replace(/_/g, ' '),
      ...(e?.timed ? { timed: true as const } : {}),
      ...(e?.bodyweight ? { bodyweight: true as const } : {}),
    }
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: input.exportedAt,
    ...(input.build ? { build: input.build } : {}),
    units: {
      weight: 'lb',
      distance: 'mi',
      length: 'in',
      angle: 'deg',
      duration: 'sec',
      cardioMinutes: 'min',
      energy: 'kcal',
      macros: 'g',
      dates: 'YYYY-MM-DD',
    },
    notes: [
      'workouts: one row per completed set. weight_lbs null is bodyweight. For an exercise marked timed in `exercises`, reps is seconds held.',
      'An exercise skipped in a session has no rows for it. Rest is recorded per session in sessionDurations (restSec), not per set.',
      'A stretch session is a flexibility entry with `routines`; its angle fields are readings in degrees, cold (start) and warm (end).',
      'Progress photos are not stored by the app and are not here.',
    ],
    exercises,
    workouts: input.workouts,
    sessionDurations: byDate(input.durations),
    exerciseAverages: input.exerciseAverages,
    bodyWeights: byDate(input.bodyWeights),
    measurements: byDate(input.measurements),
    flexibility: byDate(input.flexEntries),
    calories: byDate(input.calorieEntries),
    cardio: byDate(input.cardioEntries),
    plan: input.plan,
    flexPlans: input.flexPlans,
    goals: {
      weekly: input.weeklyGoals,
      calorieGoal: input.calorieGoal,
      ...(input.dietDirection ? { dietDirection: input.dietDirection } : {}),
    },
    settings: exportableSettings(input.settings),
  }
}

/** The file's text. */
export function exportJson(input: ExportInput): string {
  return JSON.stringify(buildExport(input), null, 1)
}

/** `workout-data-2026-11-19.json` */
export function exportFileName(today: string, ext = 'json'): string {
  return `workout-data-${today}.${ext}`
}

// ---------------------------------------------------------------------------
// The text for a chat AI
// ---------------------------------------------------------------------------

const num = (n: number): string => String(Math.round(n * 10) / 10)
const mins = (sec: number): string => `${Math.round(sec / 60)}m`
const month = (date: string): string => date.slice(0, 7)

type Session = { id: string; date: string; dayType: string; variant?: string; rows: WorkoutRow[] }

function sessionsOf(rows: WorkoutRow[]): Session[] {
  const byId = new Map<string, Session>()
  for (const r of rows) {
    const id = r.session_id || `${r.date}/${r.day_type}`
    let s = byId.get(id)
    if (!s) {
      s = { id, date: r.date, dayType: r.day_type, variant: r.variant, rows: [] }
      byId.set(id, s)
    }
    s.rows.push(r)
  }
  return byDate([...byId.values()])
}

/** `135x8,8,7 145x5`: sets in order, a weight said once for the run of sets at it. */
function setsLabel(rows: WorkoutRow[], timed: boolean): string {
  const runs: { weight: number | null; reps: number[] }[] = []
  for (const r of rows) {
    const last = runs[runs.length - 1]
    if (last && last.weight === r.weight_lbs) last.reps.push(r.reps)
    else runs.push({ weight: r.weight_lbs, reps: [r.reps] })
  }
  const unit = timed ? 's' : ''
  return runs.map((run) => `${run.weight == null ? 'BW' : num(run.weight)}x${run.reps.map((n) => `${n}${unit}`).join(',')}`).join(' ')
}

/** Hand each session the clock recorded for it: same day, same kind, in order. */
function clockFinder(durations: SessionDuration[]) {
  const left = byDate(durations)
  return (date: string, match: (d: SessionDuration) => boolean): SessionDuration | null => {
    const i = left.findIndex((d) => d.date === date && match(d))
    return i < 0 ? null : left.splice(i, 1)[0]
  }
}

const clockLabel = (d: SessionDuration | null): string =>
  d ? ` ${mins(d.totalSec)} (rest ${mins(d.restSec)})` : ''

function sessionLine(s: Session, known: Map<string, PlannedExercise>, clock: SessionDuration | null): string {
  const order: string[] = []
  const groups = new Map<string, WorkoutRow[]>()
  for (const r of s.rows) {
    if (!groups.has(r.exercise)) {
      groups.set(r.exercise, [])
      order.push(r.exercise)
    }
    groups.get(r.exercise)!.push(r)
  }
  const parts = order.map((key) => {
    const rows = groups.get(key)!
    const notes = [...new Set(rows.map((r) => r.notes?.trim()).filter(Boolean))]
    return `${key} ${setsLabel(rows, !!known.get(key)?.timed)}${notes.length ? ` [${notes.join('; ')}]` : ''}`
  })
  return `${s.date} ${s.dayType}${s.variant ? ` ${s.variant}` : ''}${clockLabel(clock)} | ${parts.join(' | ')}`
}

const FLEX_ANGLES = [
  'splitDeg',
  'coldSplitDeg',
  'warmSplitDeg',
  'tailorsLeftDeg',
  'tailorsRightDeg',
  'tailorsColdLeftDeg',
  'tailorsColdRightDeg',
  'tailorsWarmLeftDeg',
  'tailorsWarmRightDeg',
  'coldToeTouchDeg',
  'warmToeTouchDeg',
  'coldLegLiftLeftDeg',
  'coldLegLiftRightDeg',
  'warmLegLiftLeftDeg',
  'warmLegLiftRightDeg',
  'pelvicTiltDeg',
] as const satisfies readonly (keyof FlexEntry)[]

const angleName = (k: string): string => k.replace(/Deg$/, '')

function flexAngles(e: FlexEntry): string[] {
  return FLEX_ANGLES.flatMap((k) => (typeof e[k] === 'number' ? [`${angleName(k)} ${num(e[k] as number)}`] : []))
}

function flexLine(e: FlexEntry, find: ReturnType<typeof clockFinder>): string {
  const routines = e.routines ?? []
  const clocks = routines.map((r) => find(e.date, (d) => d.kind === 'stretch' && (d.routine ?? 'side_split') === r))
  const done = routines.map((r, i) => `${r}${clockLabel(clocks[i])}`)
  const angles = flexAngles(e)
  return [
    e.date,
    done.length ? `session ${done.join(', ')}` : 'measurement',
    ...(angles.length ? [angles.join(', ')] : []),
    ...(e.note ? [`[${e.note}]`] : []),
  ].join(' | ')
}

function calorieLine(e: CalorieEntry): string {
  const macros = [
    e.protein != null ? `p${num(e.protein)}` : '',
    e.carbs != null ? `c${num(e.carbs)}` : '',
    e.fat != null ? `f${num(e.fat)}` : '',
  ].filter(Boolean)
  return [e.date, num(e.calories), ...macros].join(' ')
}

function measurementLine(m: MeasurementEntry): string {
  return [
    m.date,
    m.waistIn != null ? `waist ${num(m.waistIn)}` : '',
    m.neckIn != null ? `neck ${num(m.neckIn)}` : '',
    m.bodyFatPct != null ? `bodyfat ${num(m.bodyFatPct)}%` : '',
    m.absVisibility ? `abs ${m.absVisibility}` : '',
    m.note ? `[${m.note}]` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function cardioLine(e: CardioEntry): string {
  return [e.date, e.kind, e.minutes != null ? `${num(e.minutes)}min` : '', e.distanceMi != null ? `${num(e.distanceMi)}mi` : '']
    .filter(Boolean)
    .join(' ')
}

/** Rows grouped by calendar month — by year before `yearlyBefore` — oldest first. */
function byMonth<T extends { date: string }>(rows: T[], yearlyBefore: string | null): [string, T[]][] {
  const months = new Map<string, T[]>()
  for (const r of byDate(rows)) {
    const m = yearlyBefore && month(r.date) < month(yearlyBefore) ? r.date.slice(0, 4) : month(r.date)
    months.set(m, [...(months.get(m) ?? []), r])
  }
  return [...months]
}

const avg = (ns: number[]): number => ns.reduce((a, b) => a + b, 0) / ns.length

function liftMonthLine(m: string, sessions: Session[], known: Map<string, PlannedExercise>): string {
  const per = new Map<string, { sessions: Set<string>; best: WorkoutRow }>()
  for (const s of sessions) {
    for (const r of s.rows) {
      const cur = per.get(r.exercise)
      if (!cur) {
        per.set(r.exercise, { sessions: new Set([s.id]), best: r })
        continue
      }
      cur.sessions.add(s.id)
      const w = r.weight_lbs ?? 0
      const bw = cur.best.weight_lbs ?? 0
      if (w > bw || (w === bw && r.reps > cur.best.reps)) cur.best = r
    }
  }
  const parts = [...per].map(
    ([key, v]) => `${key} ${v.sessions.size}x best ${setsLabel([v.best], !!known.get(key)?.timed)}`,
  )
  return `${m} ${sessions.length} sessions | ${parts.join(' | ')}`
}

function flexMonthLine(m: string, entries: FlexEntry[]): string {
  const last = new Map<string, number>()
  for (const e of entries) for (const k of FLEX_ANGLES) if (typeof e[k] === 'number') last.set(angleName(k), e[k] as number)
  const sessions = entries.reduce((n, e) => n + (e.routines?.length ?? 0), 0)
  const readings = [...last].map(([k, v]) => `${k} ${num(v)}`)
  return `${m} ${sessions} sessions${readings.length ? ` | last ${readings.join(', ')}` : ''}`
}

function calorieMonthLine(m: string, entries: CalorieEntry[]): string {
  const protein = entries.flatMap((e) => (e.protein != null ? [e.protein] : []))
  return `${m} avg ${Math.round(avg(entries.map((e) => e.calories)))}${protein.length ? ` p${Math.round(avg(protein))}` : ''} (${entries.length} days)`
}

function cardioMonthLine(m: string, entries: CardioEntry[]): string {
  const minutes = entries.reduce((n, e) => n + (e.minutes ?? 0), 0)
  const miles = entries.reduce((n, e) => n + (e.distanceMi ?? 0), 0)
  return `${m} ${entries.length} sessions, ${num(minutes)}min${miles ? `, ${num(miles)}mi` : ''}`
}

function exerciseLine(e: PlannedExercise): string {
  return `${e.key} ${e.sets}x${repRangeLabel(e).replace('–', '-')}${e.timed ? 's hold' : ''} rest ${e.restSec}s`
}

function aboutLines(input: ExportInput): string[] {
  const { settings, today } = input
  const profile = settings.profile
  const lines: string[] = []
  const now = parseISODate(today)
  if (profile) {
    const body = bodyFacts(profile, now, settings.heightIn)
    if (body.length) lines.push(`Me: ${body.join(', ')}.`)
    lines.push(`Tracking: ${profile.pillars.join(', ') || 'nothing yet'}.`)
    if (hasPillar(profile, 'strength') && profile.strength) lines.push(`Lifting: ${strengthFacts(profile.strength)}.`)
    if (profile.targetWeightLbs) lines.push(`Target body weight: ${num(profile.targetWeightLbs)} lb.`)
    if (profile.proteinGoal) lines.push(`Protein target: ${num(profile.proteinGoal)} g a day.`)
  } else if (settings.heightIn) {
    lines.push(`Me: ${Math.floor(settings.heightIn / 12)}'${Math.round(settings.heightIn % 12)}" tall.`)
  }
  const g = input.weeklyGoals
  const weekly = [
    g.workouts > 0 ? `${g.workouts} workouts` : '',
    g.flex > 0 ? `${g.flex} stretch sessions` : '',
    (g.cardio ?? 0) > 0 ? `${g.cardio} cardio days` : '',
    g.calDays > 0 ? `${g.calDays} days on the calorie target` : '',
  ].filter(Boolean)
  if (weekly.length) lines.push(`Weekly goals: ${weekly.join(', ')}.`)
  if (input.calorieGoal && g.calDays > 0) {
    const way = input.dietDirection === 'lose' ? 'at most' : input.dietDirection === 'gain' ? 'at least' : 'about'
    lines.push(`Calorie target: ${way} ${input.calorieGoal} kcal a day.`)
  }
  if (planActive(settings.cardioPlan, today)) {
    lines.push('Cardio plan:', ...describeCardioPlan(settings.cardioPlan, input.cardioEntries, today).map((l) => `  ${l}`))
  }
  return lines
}

function planLines(plan: Plan): string[] {
  return DAY_TYPES.filter((d) => (plan[d]?.exercises.length ?? 0) > 0).map(
    (d) => `${d} "${plan[d].label}": ${plan[d].exercises.map(exerciseLine).join('; ')}`,
  )
}

/** A titled table, or nothing when it has no rows. */
function table(title: string, rows: string[]): string[] {
  return rows.length ? ['', `## ${title}`, ...rows] : []
}

function render(input: ExportInput, cutoff: string | null, yearlyBefore: string | null = null): string {
  const known = plannedByKey(input.plan)
  const recent = <T extends { date: string }>(rows: T[]) => byDate(cutoff ? rows.filter((r) => r.date >= cutoff) : rows)
  const older = <T extends { date: string }>(rows: T[]) => (cutoff ? rows.filter((r) => r.date < cutoff) : [])
  const find = clockFinder(input.durations)
  const sessions = sessionsOf(input.workouts)

  const out: string[] = [
    `TRAINING LOG, exported ${input.today}`,
    'Units: weight lb, distance mi, tape measurements in, angles degrees, calories kcal, macros g. Dates are YYYY-MM-DD.',
    ...(cutoff
      ? [
          `Entries from ${cutoff} on are listed in full. Everything before is one line per calendar month: lifts as sessions and the heaviest set per exercise, body weight and calories as the month's average, flexibility as sessions and the last reading of each angle, cardio as totals.${yearlyBefore ? ` Months before ${month(yearlyBefore)} are folded the same way into a line per year.` : ''}`,
        ]
      : []),
  ]
  out.push(...table('ABOUT AND GOALS', aboutLines(input)))
  out.push(...table('CURRENT LIFTING PLAN (exercise sets x reps, rest between sets)', planLines(input.plan)))

  out.push(
    ...table(
      'LIFTS BY MONTH (sessions | exercise, sessions it was trained, heaviest set)',
      byMonth(older(sessions), yearlyBefore).map(([m, ss]) => liftMonthLine(m, ss, known)),
    ),
    ...table(
      'LIFT SESSIONS (date, day, session length and time resting | exercise weight x reps per set; BW bodyweight, "s" seconds held, [notes]; an exercise missing from a day was skipped)',
      recent(sessions).map((s) =>
        sessionLine(s, known, find(s.date, (d) => d.kind === 'workout' && (!d.dayType || d.dayType === s.dayType))),
      ),
    ),
    ...table('FLEXIBILITY BY MONTH (stretch sessions | last reading of each angle)', byMonth(older(input.flexEntries), yearlyBefore).map(([m, es]) => flexMonthLine(m, es))),
    ...table(
      'FLEXIBILITY (date | stretch session routine and length, or a measurement | angles; cold = start of session, warm = end)',
      recent(input.flexEntries).map((e) => flexLine(e, find)),
    ),
    ...table(
      'BODY WEIGHT BY MONTH (average lb, weigh-ins)',
      byMonth(older(input.bodyWeights), yearlyBefore).map(([m, es]) => `${m} avg ${num(avg(es.map((e) => e.weightLbs)))} (${es.length})`),
    ),
    ...table('BODY WEIGHT (date lb)', recent(input.bodyWeights).map((e) => `${e.date} ${num(e.weightLbs)}`)),
    ...table('BODY MEASUREMENTS (date, waist and neck in inches, body fat %)', byDate(input.measurements).map(measurementLine)),
    ...table(
      'CALORIES BY MONTH (average kcal, average protein g, days logged)',
      byMonth(older(input.calorieEntries), yearlyBefore).map(([m, es]) => calorieMonthLine(m, es)),
    ),
    ...table('CALORIES (date kcal, p/c/f grams of protein, carbs, fat)', recent(input.calorieEntries).map(calorieLine)),
    ...table('CARDIO BY MONTH (sessions, minutes, miles)', byMonth(older(input.cardioEntries), yearlyBefore).map(([m, es]) => cardioMonthLine(m, es))),
    ...table('CARDIO (date kind minutes miles)', recent(input.cardioEntries).map(cardioLine)),
  )
  return out.join('\n')
}

function daysBefore(today: string, days: number): string {
  const d = parseISODate(today)
  d.setDate(d.getDate() - days)
  return toISODate(d)
}

export type AiText = {
  text: string
  /** The date the line-by-line part starts at, or null when the whole history is in full. */
  fullFrom: string | null
}

/**
 * The history as text, inside `maxChars`: whole when it fits, else in full for
 * the longest recent window that does and by month before it. Where even four
 * weeks in full and the rest by month is too long, the months more than a year
 * before the window fold again into a line per year, and then all of them do.
 * A history that overruns the budget even so is given that way anyway —
 * nothing is cut mid-table.
 */
export function buildAiText(input: ExportInput, maxChars: number = AI_EXPORT_MAX_CHARS): AiText {
  const dates = [
    ...input.workouts,
    ...input.bodyWeights,
    ...input.flexEntries,
    ...input.calorieEntries,
    ...input.cardioEntries,
  ].map((r) => r.date)
  const first = dates.reduce((a, b) => (a < b ? a : b), input.today)
  let last: AiText = { text: '', fullFrom: null }
  for (const days of FULL_WINDOWS_DAYS) {
    const cutoff = days == null ? null : daysBefore(input.today, days)
    // A window reaching back past the first entry is the whole history again.
    if (cutoff != null && cutoff <= first) continue
    last = { text: render(input, cutoff), fullFrom: cutoff }
    if (last.text.length <= maxChars) return last
  }
  // Years of months overrun it on their own: keep a year of them, then none.
  const cutoff = last.fullFrom
  if (cutoff == null) return last
  for (const yearlyBefore of [daysBefore(cutoff, 365), cutoff]) {
    last = { text: render(input, cutoff, yearlyBefore), fullFrom: cutoff }
    if (last.text.length <= maxChars) return last
  }
  return last
}

/** What the AI is asked to do with the log. */
export const ANALYSIS_PROMPT = [
  'You are an experienced strength and conditioning coach. Below is my training log, exported from my workout tracker. Read all of it, then tell me:',
  '1. Which lifts are progressing, which have stalled or gone backwards, and why you think so.',
  '2. How consistent I have been week to week against my goals, and where the gaps are.',
  '3. What my body weight, measurements and eating say about whether I am heading toward my goals.',
  '4. How my flexibility and cardio are moving.',
  '5. The three changes you would make over the next four weeks.',
  'Quote the dates and numbers you base each point on. If something you need is missing, ask me before guessing.',
].join('\n')

/** The analysis prompt with the log under it, the two together inside `maxChars`. */
export function buildAnalysisPaste(input: ExportInput, maxChars: number = AI_EXPORT_MAX_CHARS): string {
  const head = `${ANALYSIS_PROMPT}\n\n`
  return head + buildAiText(input, maxChars - head.length).text
}
