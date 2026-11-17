/**
 * Reading an AI companion's reply: a `WT v1` … `END` block of one op per line,
 * pasted back from whatever chat app wrote it.
 *
 * Why a line format and not JSON: a chat app's code-block copy button hands
 * over raw text, a free-tier model gets a line right far more often than a
 * nested object, every line stands or falls alone, there are no braces or
 * quotes to unbalance, and `END` tells a finished reply from one cut off
 * mid-stream.
 *
 *     WT v1
 *     summary: a fourth set on bench, face pulls on pull day
 *     lift set day=push ex=bench_press sets=4 reps=6-8 rest=120
 *     lift add day=pull name="face pull" sets=3 reps=12-15 rest=60
 *     lift remove day=push ex=cable_fly
 *     lift move day=push ex=dips after=bench_press
 *     weekly workouts=3
 *     cardio goal kind=run dist=5k days=tue,thu,sat by=2027-02-01
 *     cardio level longest=20 weekly=60 pace=11:30
 *     END
 *
 * The block is found anywhere in the paste — prose before and after, inside a
 * fence, quoted, bulleted, bolded — and what chat apps and phone keyboards do
 * to text (smart quotes, en dashes, NBSP, zero-width joiners, `×`, the
 * full-width colon) is undone before a line is read. Every line is parsed on
 * its own and every problem is reported against the line it came from, so the
 * fix-up message can quote exactly what to resend.
 *
 * Exercises are named by key or by name; either is matched against the day's
 * own exercises with the import matcher's scoring (lib/parseImport), so
 * "Bench Press" finds `bench_press`. An `add` whose name the app knows takes
 * that exercise's key and history; one it doesn't becomes a custom row. A
 * `set`, `remove` or `move` naming an exercise the day hasn't got is an error.
 *
 * Numbers are held to {@link LIMITS}; one outside them is clamped and listed
 * in `adjusted`, which the preview shows, rather than refused.
 *
 * `cardio` lines are read here only for their shape: a distance as `5k`,
 * `half`, `3.1mi` or `8km`, a clock as `28:00`, days as `tue,thu,sat`, a date
 * as `2027-02-01`. Whether they make a plan (a plan to change at all, a date
 * the ramp can reach) is lib/companion/cardio's to say, against the log.
 *
 * Pure module — no React/DOM, no storage.
 */

import type { DayType } from '../../types'
import { ALL_EXERCISES, DAY_TYPES, exerciseName, type Plan } from '../../config/plan'
import { matchExercise, nameScore, NAME_MATCH_MIN } from '../parseImport'
import { CARDIO_KINDS } from '../cardio'
import {
  MI_10K,
  MI_5K,
  MI_HALF,
  MI_MARATHON,
  WEEKDAY_NAMES,
  goalTypesFor,
  parseClock,
  snapDistance,
  type CardioGoal,
  type CardioGoalType,
} from '../cardioPlan'
import {
  COMPANION_VERSION,
  LIMITS,
  isChangeOp,
  type CardioCheckpointOp,
  type CardioLevelOp,
  type CompanionOp,
  type LiftOp,
} from './ops'

export type LineError = {
  /** 1-based line within the block, `WT v1` being line 1; 0 for the block as a whole. */
  line: number
  /** The line as it arrived, cleaned of markdown, for quoting back. */
  text: string
  message: string
}

export type CompanionParse = {
  /** A `WT` header was found at all. */
  found: boolean
  /** The block reached its `END`. A reply without one was cut off. */
  complete: boolean
  version: number | null
  ops: CompanionOp[]
  errors: LineError[]
  /** Values the parser changed or dropped, said plainly for the preview. */
  adjusted: string[]
  summary: string
  questions: string[]
}

/**
 * What the reply amounts to, in the order the sheet deals with it: nothing to
 * read, a reply cut off, questions to answer, lines to fix, or changes ready.
 */
export type CompanionStatus = 'none' | 'truncated' | 'ask' | 'errors' | 'ready'

export function companionStatus(p: CompanionParse): CompanionStatus {
  if (!p.found) return 'none'
  if (!p.complete) return 'truncated'
  if (p.questions.length > 0) return 'ask'
  if (p.errors.length > 0) return 'errors'
  return 'ready'
}

/** The ops that change the plan or goals, as opposed to summary and ask. */
export function changeOps(p: CompanionParse) {
  return p.ops.filter(isChangeOp)
}

/* ------------------------------------------------------------ cleaning */

/**
 * Undo what chat apps and keyboards do to plain text: curly quotes, the dash
 * family, non-breaking and zero-width spaces, the multiplication sign, and the
 * full-width colon and equals a CJK keyboard types.
 */
export function normaliseText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[   　]/g, ' ')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/×/g, 'x')
    .replace(/：/g, ':')
    .replace(/＝/g, '=')
}

/** One line with its quote marks, bullets, bold and inline code taken off. */
function cleanLine(raw: string): string {
  let s = raw.trim()
  // Quoted (email-style or a chat app's reply quote), possibly nested.
  while (/^>\s?/.test(s)) s = s.replace(/^>\s?/, '').trim()
  s = s.replace(/^(?:[-*+•]\s+|\d+[.)]\s+)/, '')
  s = s.replace(/\*\*|__|`/g, '')
  return s.trim()
}

const FENCE = /^(?:```|~~~)/
const HEADER = /^WT\s*v\s*(\d+)\b/i
const END = /^END\b\.?$/i

/* --------------------------------------------------------------- values */

/** `key=value` pairs, where a value runs to the next `key=` so names needn't be quoted. */
function fields(rest: string): { map: Map<string, string>; stray: string } {
  const map = new Map<string, string>()
  const re = /([A-Za-z_]+)\s*=\s*/g
  const hits: { key: string; start: number; end: number }[] = []
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    hits.push({ key: m[1].toLowerCase(), start: m.index, end: m.index + m[0].length })
  }
  const stray = (hits.length ? rest.slice(0, hits[0].start) : rest).trim()
  hits.forEach((h, i) => {
    let value = rest.slice(h.end, i + 1 < hits.length ? hits[i + 1].start : undefined).trim()
    value = value.replace(/[,;]$/, '').trim()
    const q = value.match(/^(["'])(.*)\1$/)
    if (q) value = q[2].trim()
    if (!map.has(h.key)) map.set(h.key, value)
  })
  return { map, stray }
}

function int(value: string): number | null {
  const m = value.match(/^(\d+(?:\.\d+)?)/)
  return m ? Math.round(Number(m[1])) : null
}

/** `8-12`, `8 to 12`, `10`, `8-12 reps`. */
function repRange(value: string): [number, number] | null {
  const m = value.match(/^(\d+)\s*(?:(?:-|to)\s*(\d+))?/i)
  if (!m) return null
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : a
  return a <= b ? [a, b] : [b, a]
}

/** Seconds from `90`, `90s`, `90 sec`, `2m`, `2 min`, `1.5min`, `1:30`. */
function seconds(value: string): number | null {
  const clock = value.match(/^(\d+):(\d{2})\b/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const m = value.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|s|sec|secs|seconds?)?\b/i)
  if (!m) return null
  const n = Number(m[1])
  return Math.round(m[2] && /^m/i.test(m[2]) ? n * 60 : n)
}

/* --------------------------------------------------------- name lookup */

const DAY_ALIASES: Record<string, DayType> = {
  full: 'fullbody',
  'full body': 'fullbody',
  'full-body': 'fullbody',
  full_body: 'fullbody',
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const slug = (s: string) => norm(s).replace(/ /g, '_')

/** The days that have something on them: the ones a reply can address. */
function liveDays(plan: Plan): DayType[] {
  return DAY_TYPES.filter((d) => (plan[d]?.exercises.length ?? 0) > 0)
}

function resolveDay(plan: Plan, value: string | undefined): DayType | string {
  if (!value) return 'needs day='
  const v = value.toLowerCase().trim()
  const days = liveDays(plan)
  const hit =
    days.find((d) => d === v) ??
    days.find((d) => d === DAY_ALIASES[v]) ??
    days.find((d) => norm(plan[d].label) === norm(v))
  if (hit) return hit
  return `no day "${value}" in the plan (days: ${days.join(', ')})`
}

/** Whether `resolveDay` found a day rather than an error message. */
function isDay(plan: Plan, d: string): d is DayType {
  return (DAY_TYPES as string[]).includes(d) && d in plan
}

/** The key on `day` that `ref` names, by key or by name, or null. */
export function findOnDay(plan: Plan, day: DayType, ref: string): string | null {
  const exercises = plan[day]?.exercises ?? []
  const r = ref.trim()
  if (!r) return null
  const exact = exercises.find((e) => e.key === r || e.key === slug(r))
  if (exact) return exact.key
  const named = exercises.find((e) => norm(e.name) === norm(r))
  if (named) return named.key
  let best: { key: string; score: number } | null = null
  for (const e of exercises) {
    const score = Math.max(nameScore(r, e.name), nameScore(r, e.key.replace(/_/g, ' ')))
    if (score >= NAME_MATCH_MIN && (!best || score > best.score)) best = { key: e.key, score }
  }
  return best?.key ?? null
}

function dayKeys(plan: Plan, day: DayType): string {
  return plan[day].exercises.map((e) => e.key).join(', ')
}

/* ------------------------------------------------------------ the parse */

const LIFT_ACTIONS: Record<string, LiftOp['op']> = {
  set: 'lift.set',
  edit: 'lift.set',
  update: 'lift.set',
  change: 'lift.set',
  add: 'lift.add',
  remove: 'lift.remove',
  delete: 'lift.remove',
  drop: 'lift.remove',
  move: 'lift.move',
}

/**
 * Ops an earlier sketch of this format named for a running plan. Named so the
 * error says "not here" and points at the cardio ops, not "never heard of it".
 */
const LATER_OPS = new Set(['runplan', 'session', 'week', 'goal'])

/** Field names an op reads, so anything else can be reported as ignored. */
const LIFT_FIELDS: Record<LiftOp['op'], string[]> = {
  'lift.set': ['day', 'ex', 'key', 'exercise', 'name', 'sets', 'reps', 'rest'],
  'lift.add': ['day', 'ex', 'key', 'exercise', 'name', 'sets', 'reps', 'rest', 'group'],
  'lift.remove': ['day', 'ex', 'key', 'exercise', 'name'],
  'lift.move': ['day', 'ex', 'key', 'exercise', 'name', 'before', 'after', 'to'],
}

/** How sure a name has to be of a shipped exercise for an add to become it. */
const ADD_MATCH_MIN = 0.85

type LineResult = { op?: CompanionOp; error?: string; adjusted: string[] }

function clamp(
  value: number,
  [lo, hi]: readonly [number, number],
  what: string,
  adjusted: string[],
): number {
  const out = Math.min(hi, Math.max(lo, value))
  if (out !== value) adjusted.push(`${what} ${value} → ${out}`)
  return out
}

function parseLift(plan: Plan, words: string[], rest: string): LineResult {
  const adjusted: string[] = []
  const action = LIFT_ACTIONS[(words[1] ?? '').toLowerCase()]
  if (!action) return { error: `"lift ${words[1] ?? ''}" isn't an op — use lift set, add, remove or move`, adjusted }
  const { map, stray } = fields(rest)
  if (stray) return { error: `"${stray}" isn't a key=value field`, adjusted }
  for (const k of map.keys()) {
    if (!LIFT_FIELDS[action].includes(k)) adjusted.push(`ignored ${k}=${map.get(k)}`)
  }

  const day = resolveDay(plan, map.get('day'))
  if (!isDay(plan, day)) return { error: day, adjusted }

  // The numbers, shared by set and add.
  const nums: { sets?: number; repMin?: number; repMax?: number; restSec?: number } = {}
  const setsText = map.get('sets')
  if (setsText != null) {
    const n = int(setsText)
    if (n == null) return { error: `sets="${setsText}" isn't a number`, adjusted }
    nums.sets = clamp(n, LIMITS.sets, 'sets', adjusted)
  }
  const repsText = map.get('reps')
  if (repsText != null) {
    const r = repRange(repsText)
    if (!r) return { error: `reps="${repsText}" isn't a number or a range like 8-12`, adjusted }
    nums.repMin = clamp(r[0], LIMITS.reps, 'reps', adjusted)
    nums.repMax = clamp(r[1], LIMITS.reps, 'reps', adjusted)
  }
  const restText = map.get('rest')
  if (restText != null) {
    const s = seconds(restText)
    if (s == null) return { error: `rest="${restText}" isn't a number of seconds`, adjusted }
    nums.restSec = clamp(s, LIMITS.restSec, 'rest', adjusted)
  }

  const ref = map.get('ex') ?? map.get('key') ?? map.get('exercise') ?? map.get('name')

  if (action === 'lift.add') {
    const name = map.get('name') ?? map.get('ex') ?? map.get('exercise') ?? map.get('key')
    if (!name) return { error: 'lift add needs name=', adjusted }
    const already = plan[day].exercises.find(
      (e) => e.key === slug(name) || norm(e.name) === norm(name),
    )
    if (already) return { error: `${already.name} is already on ${day}`, adjusted }
    // Stricter than the import's bar: an add that lands on the wrong shipped
    // exercise inherits its history, so only a name that is all that
    // exercise's words (or near enough) counts as it.
    const known = matchExercise(name)
    const key = known.score >= ADD_MATCH_MIN ? (known.key ?? undefined) : undefined
    if (key && plan[day].exercises.some((e) => e.key === key)) {
      return { error: `${exerciseName(key)} is already on ${day}`, adjusted }
    }
    const shipped = key ? ALL_EXERCISES.find((e) => e.key === key) : undefined
    const group = map.get('group')
    return {
      op: {
        op: 'lift.add',
        day,
        name: shipped?.name ?? name.trim().toLowerCase(),
        ...(key ? { key } : {}),
        ...nums,
        ...(group ? { group: group.toLowerCase() } : {}),
      },
      adjusted,
    }
  }

  if (!ref) return { error: `${words[0]} ${words[1]} needs ex=`, adjusted }
  const key = findOnDay(plan, day, ref)
  if (!key) return { error: `no "${ref}" on ${day} (it has: ${dayKeys(plan, day)})`, adjusted }

  if (action === 'lift.remove') return { op: { op: 'lift.remove', day, key }, adjusted }

  if (action === 'lift.set') {
    if (Object.keys(nums).length === 0) return { error: 'lift set needs sets=, reps= or rest=', adjusted }
    return { op: { op: 'lift.set', day, key, ...nums }, adjusted }
  }

  // lift.move
  const before = map.get('before')
  const after = map.get('after')
  const to = map.get('to')
  const anchorRef = before ?? after
  if (anchorRef != null) {
    const anchor = findOnDay(plan, day, anchorRef)
    if (!anchor) return { error: `no "${anchorRef}" on ${day} to move next to`, adjusted }
    if (anchor === key) return { error: `can't move ${key} next to itself`, adjusted }
    return { op: { op: 'lift.move', day, key, ...(before != null ? { before: anchor } : { after: anchor }) }, adjusted }
  }
  if (to != null) {
    const n = int(to)
    if (n == null || n < 1) return { error: `to="${to}" isn't a position (1 is first)`, adjusted }
    return { op: { op: 'lift.move', day, key, toIndex: n - 1 }, adjusted }
  }
  return { error: 'lift move needs before=, after= or to=', adjusted }
}

function parseWeekly(rest: string, canSetWeekly: boolean): LineResult {
  const adjusted: string[] = []
  const { map, stray } = fields(rest)
  if (stray) return { error: `"${stray}" isn't a key=value field`, adjusted }
  for (const k of map.keys()) if (k !== 'workouts') adjusted.push(`ignored weekly ${k}=${map.get(k)}`)
  const text = map.get('workouts')
  if (text == null) return { error: 'weekly needs workouts=', adjusted }
  const n = int(text)
  if (n == null) return { error: `workouts="${text}" isn't a number`, adjusted }
  if (!canSetWeekly) return { error: "the weekly goal can't be changed here", adjusted }
  return { op: { op: 'weekly', workouts: clamp(n, LIMITS.workouts, 'weekly workouts', adjusted) }, adjusted }
}

/* -------------------------------------------------------------- cardio */

const CARDIO_ACTIONS = ['goal', 'level', 'days', 'date', 'checkpoint', 'replan', 'end'] as const
type CardioAction = (typeof CARDIO_ACTIONS)[number]

const CARDIO_ALIASES: Record<string, CardioAction> = { 're-plan': 'replan', stop: 'end', target: 'goal' }

const CARDIO_FIELDS: Record<CardioAction, string[]> = {
  goal: ['kind', 'type', 'dist', 'distance', 'mi', 'km', 'time', 'min', 'minutes', 'weekly', 'days', 'by', 'date'],
  level: ['longest', 'longestmi', 'weekly', 'pace', 'now'],
  days: ['days', 'on'],
  date: ['by', 'date'],
  checkpoint: ['dist', 'distance', 'mi', 'km', 'time', 'min', 'minutes', 'week'],
  replan: [],
  end: [],
}

const KIND_ALIASES: Record<string, string> = {
  running: 'run',
  jog: 'run',
  jogging: 'run',
  walking: 'walk',
  hiking: 'hike',
  biking: 'bike',
  cycling: 'bike',
  cycle: 'bike',
  ride: 'bike',
  swimming: 'swim',
  rowing: 'row',
}

const PLAN_KINDS: string[] = CARDIO_KINDS.filter((k) => k !== 'other')

const NAMED_DISTANCES: Record<string, number> = {
  '5k': MI_5K,
  '10k': MI_10K,
  half: MI_HALF,
  'half marathon': MI_HALF,
  marathon: MI_MARATHON,
  mile: 1,
}

/** Miles from `5k`, `half`, `3.1`, `3.1mi`, `2 miles`, `8km`, `1500m`. A race's distance comes back as the race's own. */
export function readDistance(value: string): number | null {
  const v = value.toLowerCase().trim().replace(/\s+/g, ' ')
  if (NAMED_DISTANCES[v] != null) return NAMED_DISTANCES[v]
  const m = v.match(/^(\d+(?:\.\d+)?) ?(mi|miles?|km|k|m|meters|metres)?$/)
  if (!m) return null
  const n = Number(m[1])
  if (!(n > 0)) return null
  const unit = m[2] ?? 'mi'
  const mi = unit === 'km' || unit === 'k' ? n / 1.609344 : unit === 'm' || unit.startsWith('met') ? n / 1609.344 : n
  return snapDistance(mi)
}

/** Weekday numbers from `tue,thu,sat`, `Tuesday Thursday`, `mon/wed/fri`, ascending; a message for anything else. */
export function readDays(value: string): number[] | string {
  const words = value
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w && w !== 'and')
  if (words.length === 0) return 'needs days like tue,thu,sat'
  const out = new Set<number>()
  for (const w of words) {
    const d = WEEKDAY_NAMES.findIndex((name) => w.startsWith(name))
    if (d < 0) return `"${w}" isn't a day (use mon, tue, wed, thu, fri, sat, sun)`
    out.add(d)
  }
  return [...out].sort((a, b) => a - b)
}

/** A YYYY-MM-DD that is a real date, zero-padded. */
function readDate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Minutes from `20`, `20min`, `28:00`, `1:05:00`. */
function readMinutes(value: string): number | null {
  const v = value.trim().replace(/ ?(min|mins|minutes?)$/i, '')
  if (v.includes(':')) return parseClock(v)
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) : null
}

/** A pace from `11:30`, `11:30/mi`, `11.5`. */
function readPace(value: string): number | null {
  return readMinutes(value.replace(/ ?(\/ ?mi(le)?|per mile|min\/mi)$/i, ''))
}

/** The number `key` holds, read and clamped; a message when it isn't one; undefined when absent. */
function numberField(
  map: Map<string, string>,
  key: string,
  read: (v: string) => number | null,
  limits: readonly [number, number],
  what: string,
  adjusted: string[],
): number | string | undefined {
  const text = map.get(key)
  if (text == null) return undefined
  const n = read(text)
  if (n == null) return `${key}="${text}" isn't ${what}`
  return clamp(Math.round(n * 100) / 100, limits, key, adjusted)
}

/** A level's minutes a week may be nothing at all, unlike a goal's. */
const LEVEL_WEEKLY: readonly [number, number] = [0, LIMITS.weeklyMin[1]]

function parseCardio(words: string[], rest: string, ctx: ParseContext): LineResult {
  const adjusted: string[] = []
  const said = (words[1] ?? '').toLowerCase()
  const action = (CARDIO_ACTIONS as readonly string[]).includes(said) ? (said as CardioAction) : CARDIO_ALIASES[said]
  if (!action) {
    return {
      error: `"cardio ${words[1] ?? ''}" isn't an op — use cardio goal, level, days, date, checkpoint, replan or end`,
      adjusted,
    }
  }
  if (ctx.cardio === false) return { error: "cardio isn't tracked in this app, so there's no cardio plan to change", adjusted }
  const { map, stray } = fields(rest)
  // days and date take their value bare too: `cardio days tue,thu,sat`, `cardio date 2027-02-01`.
  if (stray && action !== 'days' && action !== 'date') return { error: `"${stray}" isn't a key=value field`, adjusted }
  for (const k of map.keys()) if (!CARDIO_FIELDS[action].includes(k)) adjusted.push(`ignored ${k}=${map.get(k)}`)

  if (action === 'replan') return { op: { op: 'cardio.replan' }, adjusted }
  if (action === 'end') return { op: { op: 'cardio.end' }, adjusted }

  const daysOf = (text: string | undefined): number[] | string | undefined => {
    if (text == null) return undefined
    const d = readDays(text)
    if (typeof d === 'string') return d
    const [lo, hi] = LIMITS.cardioDays
    if (d.length > hi) return `${d.length} days is too many — at most ${hi}, one kept to rest`
    if (d.length < lo) return 'needs at least one day'
    return d
  }
  const dateOf = (text: string | undefined): string | { error: string } | undefined => {
    if (text == null) return undefined
    return readDate(text) ?? { error: `"${text}" isn't a date like 2027-02-01` }
  }

  if (action === 'days') {
    const d = daysOf(map.get('days') ?? map.get('on') ?? (stray || undefined))
    if (d == null) return { error: 'cardio days needs days like tue,thu,sat', adjusted }
    if (typeof d === 'string') return { error: d, adjusted }
    return { op: { op: 'cardio.days', days: d }, adjusted }
  }

  if (action === 'date') {
    const by = dateOf(map.get('by') ?? map.get('date') ?? (stray || undefined))
    if (by == null) return { error: 'cardio date needs a date like 2027-02-01', adjusted }
    if (typeof by !== 'string') return { error: by.error, adjusted }
    return { op: { op: 'cardio.date', by }, adjusted }
  }

  if (action === 'level') {
    const level: Omit<CardioLevelOp, 'op'> = {}
    const longestText = map.get('longest')
    if (longestText != null) {
      // `longest=2mi` is a distance; anything else is minutes.
      if (/[0-9. ](mi|miles?|km|k)$/i.test(longestText)) {
        const mi = readDistance(longestText)
        if (mi == null) return { error: `longest="${longestText}" isn't minutes or a distance`, adjusted }
        level.longestMi = clamp(Math.round(mi * 10) / 10, LIMITS.longestMi, 'longest', adjusted)
      } else {
        const m = readMinutes(longestText)
        if (m == null) return { error: `longest="${longestText}" isn't minutes`, adjusted }
        level.longestMin = clamp(Math.round(m), LIMITS.longestMin, 'longest', adjusted)
      }
    }
    const reads: [keyof typeof level, string, (v: string) => number | null, readonly [number, number], string][] = [
      ['longestMi', 'longestmi', readDistance, LIMITS.longestMi, 'a distance'],
      ['weeklyMin', 'weekly', readMinutes, LEVEL_WEEKLY, 'minutes a week'],
      ['paceMinPerMi', 'pace', readPace, LIMITS.paceMinPerMi, 'a pace like 11:30'],
      ['timeMin', 'now', readMinutes, LIMITS.goalMin, 'a time like 31:00'],
    ]
    for (const [field, key, read, limits, what] of reads) {
      const n = numberField(map, key, read, limits, what, adjusted)
      if (typeof n === 'string') return { error: n, adjusted }
      if (n != null) level[field] = field === 'weeklyMin' ? Math.round(n) : n
    }
    if (Object.keys(level).length === 0) return { error: 'cardio level needs longest=, weekly=, pace= or now=', adjusted }
    return { op: { op: 'cardio.level', ...level }, adjusted }
  }

  // goal and checkpoint both read a distance and a time.
  const distKey = ['dist', 'distance', 'mi', 'km'].find((k) => map.has(k))
  let mi: number | undefined
  if (distKey) {
    const text = map.get(distKey)!
    const read = readDistance(distKey === 'km' && /^[\d.]+$/.test(text) ? `${text}km` : text)
    if (read == null) return { error: `${distKey}="${text}" isn't a distance like 5k, 10k, half or 3.1mi`, adjusted }
    mi = clamp(read, LIMITS.goalMi, 'distance', adjusted)
  }
  const time = numberField(map, 'time', readMinutes, LIMITS.goalMin, 'a time like 28:00', adjusted)
  if (typeof time === 'string') return { error: time, adjusted }
  const minKey = ['min', 'minutes', 'weekly'].find((k) => map.has(k))

  if (action === 'checkpoint') {
    const week = numberField(map, 'week', readMinutes, LIMITS.weeklyMin, 'minutes a week', adjusted)
    if (typeof week === 'string') return { error: week, adjusted }
    const minutes = minKey ? numberField(map, minKey, readMinutes, LIMITS.longestMin, 'minutes', adjusted) : undefined
    if (typeof minutes === 'string') return { error: minutes, adjusted }
    const c: Omit<CardioCheckpointOp, 'op'> | null =
      week != null
        ? { weekMin: Math.round(week) }
        : mi != null
          ? time != null
            ? { distanceMi: mi, withinMin: time }
            : { distanceMi: mi }
          : minutes != null
            ? { minutes: Math.round(minutes) }
            : null
    if (!c) return { error: 'cardio checkpoint needs dist=, min= or week=', adjusted }
    return { op: { op: 'cardio.checkpoint', ...c }, adjusted }
  }

  // cardio goal
  const kindText = map.get('kind')?.toLowerCase().trim()
  const kind = kindText ? (KIND_ALIASES[kindText] ?? kindText) : undefined
  if (kind && !PLAN_KINDS.includes(kind)) return { error: `kind="${kindText}" isn't one of ${PLAN_KINDS.join(', ')}`, adjusted }
  const typeText = map.get('type')?.toLowerCase().trim()
  const TYPES: Record<string, CardioGoalType> = { distance: 'distance', time: 'time', weekly: 'weekly', minutes: 'weekly' }
  if (typeText && !TYPES[typeText]) return { error: `type="${typeText}" isn't distance, time or weekly`, adjusted }
  const type: CardioGoalType = typeText ? TYPES[typeText] : time != null ? 'time' : mi != null ? 'distance' : 'weekly'
  let goal: CardioGoal
  if (type === 'weekly') {
    const m = minKey ? numberField(map, minKey, readMinutes, LIMITS.weeklyMin, 'minutes a week', adjusted) : undefined
    if (m == null) return { error: 'a minutes-a-week goal needs min=', adjusted }
    if (typeof m === 'string') return { error: m, adjusted }
    goal = { type, minutes: Math.round(m) }
  } else if (mi == null) {
    return { error: `a ${type} goal needs dist= (5k, 10k, half, marathon or 3.1mi)`, adjusted }
  } else if (type === 'time') {
    if (time == null) return { error: 'a time goal needs time= like 28:00', adjusted }
    goal = { type, distanceMi: mi, minutes: time }
  } else {
    if (time != null) adjusted.push(`ignored time=${map.get('time')} on a distance goal`)
    goal = { type, distanceMi: mi }
  }
  if (kind && !goalTypesFor(kind).includes(goal.type)) {
    return { error: `${kind} has no distance to aim at — use min= for minutes a week`, adjusted }
  }
  const days = daysOf(map.get('days'))
  if (typeof days === 'string') return { error: days, adjusted }
  const by = dateOf(map.get('by') ?? map.get('date'))
  if (by != null && typeof by !== 'string') return { error: by.error, adjusted }
  return {
    op: { op: 'cardio.goal', ...(kind ? { kind } : {}), goal, ...(days ? { days } : {}), ...(by ? { by } : {}) },
    adjusted,
  }
}

function parseLine(line: string, ctx: ParseContext): LineResult {
  const said = line.match(/^(summary|ask)\s*[:-]\s*(.*)$/i)
  if (said) {
    const text = said[2].trim()
    if (!text) return { error: `${said[1].toLowerCase()}: is empty`, adjusted: [] }
    return { op: { op: said[1].toLowerCase() as 'summary' | 'ask', text }, adjusted: [] }
  }
  // An inline comment the model added to explain itself.
  const body = line.replace(/\s+(?:#|\/\/).*$/, '').trim()
  const words = body.split(/\s+/)
  const head = words[0].toLowerCase()
  if (head === 'lift') return parseLift(ctx.plan, words, body.replace(/^\S+\s*\S*/, ''))
  if (head === 'weekly') return parseWeekly(body.slice(words[0].length), ctx.canSetWeekly !== false)
  if (head === 'cardio') return parseCardio(words, body.replace(/^\S+\s*\S*/, ''), ctx)
  if (LATER_OPS.has(head)) {
    const hint = ctx.cardio === false ? '' : ' — for a cardio plan use cardio goal'
    return { error: `"${head}" isn't supported by this version of the app${hint}`, adjusted: [] }
  }
  return { error: `"${words[0]}" isn't an op`, adjusted: [] }
}

export type ParseContext = {
  /** The plan the reply was written against. */
  plan: Plan
  /** False where there's no weekly goal to change (the owner's shipped goals). */
  canSetWeekly?: boolean
  /** False where cardio isn't one of the person's pillars, so there's no cardio plan to change. */
  cardio?: boolean
}

/**
 * Read the last `WT` block in `text`. The last, because a paste of the whole
 * conversation carries the prompt's own example block before the real one.
 */
export function parseCompanionReply(text: string, ctx: ParseContext): CompanionParse {
  const out: CompanionParse = {
    found: false,
    complete: false,
    version: null,
    ops: [],
    errors: [],
    adjusted: [],
    summary: '',
    questions: [],
  }
  const lines = normaliseText(text).split('\n').map(cleanLine)
  let start = -1
  lines.forEach((l, i) => {
    if (HEADER.test(l)) start = i
  })
  if (start < 0) return out
  out.found = true
  out.version = Number(lines[start].match(HEADER)![1])
  if (out.version !== COMPANION_VERSION) {
    out.complete = lines.slice(start + 1).some((l) => END.test(l))
    out.errors.push({ line: 1, text: lines[start], message: `this app reads WT v${COMPANION_VERSION}` })
    return out
  }

  const summaries: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    const n = i - start + 1
    if (END.test(line)) {
      out.complete = true
      break
    }
    if (!line || FENCE.test(line)) continue
    const res = parseLine(line, ctx)
    for (const a of res.adjusted) out.adjusted.push(`line ${n}: ${a}`)
    if (res.error) {
      out.errors.push({ line: n, text: line, message: res.error })
      continue
    }
    const op = res.op!
    out.ops.push(op)
    if (op.op === 'summary') summaries.push(op.text)
    if (op.op === 'ask') out.questions.push(op.text)
  }
  out.summary = summaries.join(' ')
  if (out.complete && !summaries.length && !out.questions.length) {
    out.errors.push({ line: 0, text: '', message: 'the block has no summary: line' })
  }
  return out
}
