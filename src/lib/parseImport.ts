import type { BodyWeightEntry, WorkoutRow } from '../types'
import { ALL_EXERCISES } from '../config/plan'
import { toISODate } from './dates'
import { v4 as uuid } from 'uuid'

/**
 * Parser for pasted historical training data. See parseImport.test.ts for the
 * full grammar exercised against real data. The design keeps every sub-parser
 * pure and independently testable — the confirmation UI sits on top of this.
 */

export type ParsedSet = { weightLbs: number | null; reps: number; note?: string }
export type ParsedEntry = { date: string; sets: ParsedSet[]; warnings: string[] }
export type ExerciseMatch = { key: string | null; name: string; isNew: boolean; score: number }
export type ParsedExercise = { rawName: string; match: ExerciseMatch; entries: ParsedEntry[] }
export type ParsedBodyWeight = { date: string; weightLbs: number; note?: string }
export type ImportResult = {
  exercises: ParsedExercise[]
  bodyWeights: ParsedBodyWeight[]
  warnings: string[]
}

/* ------------------------------------------------------------------ dates */

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Parse `M/D`, `M/D/YY`, or `M/D/YYYY`. When the year is missing, infer it so
 * the date is in the recent past: months later than the current month roll back
 * to last year.
 */
export function parseImportDate(cell: string, today: Date = new Date()): string | null {
  const m = cell.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (!m) return null
  const mo = +m[1]
  const da = +m[2]
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null
  let yr: number
  if (m[3]) {
    yr = +m[3]
    if (yr < 100) yr += 2000
  } else {
    const cy = today.getFullYear()
    const cm = today.getMonth() + 1
    yr = mo > cm ? cy - 1 : cy
  }
  return `${yr}-${pad(mo)}-${pad(da)}`
}

/* -------------------------------------------------------------------- reps */

export type RepToken = { reps: number; note?: string }

/** Parse a reps cell into one entry per set. Supports NxM, bare numbers, `!` (PR), `~` (approx). */
export function parseReps(cell: string): { tokens: RepToken[]; warnings: string[] } {
  const tokens: RepToken[] = []
  const warnings: string[] = []
  for (const raw of cell.trim().split(/\s+/)) {
    if (!raw) continue
    const rep = raw.match(/^(\d+)x(\d+)$/i) // N reps × M sets
    if (rep) {
      for (let i = 0; i < +rep[2]; i++) tokens.push({ reps: +rep[1] })
      continue
    }
    const single = raw.match(/^(\d+)([!~])?$/)
    if (single) {
      tokens.push({
        reps: +single[1],
        note: single[2] === '!' ? 'pr' : single[2] === '~' ? 'approx' : undefined,
      })
      continue
    }
    warnings.push(`couldn't parse reps token "${raw}"`)
  }
  return { tokens, warnings }
}

/* ------------------------------------------------------------------ weight */

const EQUIP = /\b(dumbbells?|dumb|barbell|machine|bar)\b/i

function normalizeEquip(word: string): string {
  const w = word.toLowerCase()
  if (w.startsWith('dumb')) return 'dumbbell'
  if (w === 'bar' || w === 'barbell') return 'barbell'
  return w
}

/** Parse a weight cell into its numeric weights (may be several) plus equipment. */
export function parseWeights(cell: string | undefined): { weights: number[]; equipment?: string } {
  if (cell == null) return { weights: [] }
  let s = cell.trim()
  const e = s.match(EQUIP)
  const equipment = e ? normalizeEquip(e[1]) : undefined
  s = s.replace(EQUIP, ' ')
  const weights = s
    .split(/[+\s]+/)
    .map((t) => t.replace(/[^\d.]/g, '').replace(/\.$/, '')) // strip stray trailing dot ("121.")
    .filter((t) => t !== '' && t !== '.')
    .map(Number)
    .filter((n) => Number.isFinite(n))
  return { weights, equipment }
}

/** Spread `weights` across `count` sets, earlier groups getting any remainder. */
export function distributeWeights(weights: number[], count: number): number[] {
  if (weights.length === 0) return Array(count).fill(null)
  if (weights.length === 1) return Array(count).fill(weights[0])
  const g = weights.length
  const base = Math.floor(count / g)
  let rem = count % g
  const out: number[] = []
  for (let i = 0; i < g; i++) {
    const n = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
    for (let j = 0; j < n; j++) out.push(weights[i])
  }
  return out.slice(0, count)
}

/* ------------------------------------------------------------------- combine */

export function combineSets(weightCell: string | undefined, repCell: string): ParsedEntry['sets'] & { warnings: string[] } {
  const { tokens, warnings } = parseReps(repCell)
  const { weights, equipment } = parseWeights(weightCell)

  let perSet: (number | null)[]
  if (weights.length === 0) perSet = tokens.map(() => null)
  else if (weights.length === 1) perSet = tokens.map(() => weights[0])
  else if (weights.length === tokens.length) perSet = weights
  else {
    warnings.push(
      `ambiguous: ${weights.length} weights across ${tokens.length} sets — split evenly, please verify`,
    )
    perSet = distributeWeights(weights, tokens.length)
  }

  const sets = tokens.map((t, i) => {
    const note = [t.note, equipment].filter(Boolean).join('; ') || undefined
    return { weightLbs: perSet[i] ?? null, reps: t.reps, note }
  })
  return Object.assign(sets, { warnings })
}

/* ---------------------------------------------------------- fuzzy matching */

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
const singular = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)

function bigrams(s: string): Set<string> {
  const g = new Set<string>()
  const c = s.replace(/ /g, '')
  for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2))
  return g
}
function dice(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return (2 * inter) / (A.size + B.size)
}

export function matchExercise(raw: string): ExerciseMatch {
  const n = norm(raw)
  const rawTokens = n.split(' ').map(singular).filter(Boolean)
  let best = { key: null as string | null, name: raw, score: 0 }
  for (const e of ALL_EXERCISES) {
    const cn = norm(e.name)
    const candTokens = new Set(cn.split(' ').map(singular))
    const contained = rawTokens.length > 0 && rawTokens.every((t) => candTokens.has(t))
    const score = Math.max(dice(n, cn), contained ? 0.9 : 0)
    if (score > best.score) best = { key: e.key, name: e.name, score }
  }
  // Confident matches come from token containment (0.9); bare bigram overlap
  // below this is treated as "new" so e.g. "prayer curls" isn't forced onto
  // "hammer curl" just for sharing "curl".
  const isNew = best.score < 0.55
  return {
    key: isNew ? null : best.key,
    name: isNew ? titleCase(raw) : best.name,
    isNew,
    score: Math.round(best.score * 100) / 100,
  }
}

/** New (unmatched) exercise names adopt the app's lowercase display style. */
function titleCase(s: string): string {
  return s.trim().toLowerCase()
}

/* -------------------------------------------------------------- block parse */

function splitCells(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}
const isPipeRow = (t: string) => t.includes('|')
const isSeparator = (cells: string[]) => cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')

type ColMap = { date: number; weight: number; reps: number; kind: 'exercise' | 'bodyweight' } | null

function classifyHeader(cells: string[]): ColMap {
  const lower = cells.map((c) => c.toLowerCase())
  const date = lower.findIndex((c) => c.includes('date'))
  if (date < 0) return null // not a data table (config/superset tables have no date column)
  const reps = lower.findIndex((c) => c.includes('rep'))
  const weight = lower.findIndex((c) => c.includes('weight'))
  return { date, weight, reps, kind: reps >= 0 ? 'exercise' : 'bodyweight' }
}

export function parseImport(text: string, today: Date = new Date()): ImportResult {
  const exMap = new Map<string, ParsedExercise>()
  const bodyWeights: ParsedBodyWeight[] = []
  const warnings: string[] = []

  let title = ''
  let cols: ColMap = null

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (t === '') continue

    if (isPipeRow(t)) {
      const cells = splitCells(t)
      if (isSeparator(cells)) continue
      const header = classifyHeader(cells)
      if (header && cells.some((c) => /[a-z]/i.test(c) && !/^\d/.test(c))) {
        cols = header
        continue
      }
      if (!cols) continue
      const date = parseImportDate(cells[cols.date] ?? '', today)
      if (!date) continue // non-date first cell → config row, skip

      if (cols.kind === 'bodyweight') {
        const wCell = cells[cols.weight] ?? ''
        const num = Number(wCell.replace(/[^\d.]/g, ''))
        if (Number.isFinite(num) && num > 0) {
          const noteMatch = wCell.match(/\(([^)]+)\)/)
          bodyWeights.push({ date, weightLbs: num, note: noteMatch?.[1] })
        }
        continue
      }

      const combined = combineSets(cols.weight >= 0 ? cells[cols.weight] : undefined, cells[cols.reps] ?? '')
      const sets = combined.filter((s) => Number.isFinite(s.reps))
      if (sets.length === 0) continue
      let ex = exMap.get(title)
      if (!ex) {
        ex = { rawName: title, match: matchExercise(title), entries: [] }
        exMap.set(title, ex)
      }
      ex.entries.push({ date, sets, warnings: combined.warnings })
    } else {
      // A non-table line starts a new block; reset column context.
      title = t.replace(/:$/, '')
      cols = null
    }
  }

  return { exercises: [...exMap.values()], bodyWeights, warnings }
}

/* ---------------------------------------------------- convert to sheet rows */

/**
 * Turn parsed exercises into flat workout rows, grouping all exercises logged
 * on the same date into a single session (so streaks count one workout/day).
 * `keyByRawName` maps each raw exercise name to the confirmed exercise key.
 */
export function buildWorkoutRows(
  exercises: ParsedExercise[],
  keyByRawName: Record<string, string>,
): WorkoutRow[] {
  const sessionByDate = new Map<string, string>()
  const sessionId = (date: string) => {
    let id = sessionByDate.get(date)
    if (!id) {
      id = uuid()
      sessionByDate.set(date, id)
    }
    return id
  }

  const rows: WorkoutRow[] = []
  for (const ex of exercises) {
    const key = keyByRawName[ex.rawName]
    if (!key) continue // skipped by the user
    for (const entry of ex.entries) {
      entry.sets.forEach((s, i) => {
        rows.push({
          session_id: sessionId(entry.date),
          date: entry.date,
          day_type: 'push', // historical rows have no known split
          exercise: key,
          set_number: i + 1,
          weight_lbs: s.weightLbs,
          reps: s.reps,
          notes: s.note ?? '',
          is_historical: true,
        })
      })
    }
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function buildBodyWeightEntries(parsed: ParsedBodyWeight[]): BodyWeightEntry[] {
  return parsed.map((p) => ({ date: p.date, weightLbs: p.weightLbs }))
}

export { toISODate }
