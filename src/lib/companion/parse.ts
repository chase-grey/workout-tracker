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
 * Pure module — no React/DOM, no storage.
 */

import type { DayType } from '../../types'
import { ALL_EXERCISES, DAY_TYPES, exerciseName, type Plan } from '../../config/plan'
import { matchExercise, nameScore, NAME_MATCH_MIN } from '../parseImport'
import {
  COMPANION_VERSION,
  LIMITS,
  isChangeOp,
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

/** Ops a later version will read. Named so the error says "not yet", not "never heard of it". */
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
  if (LATER_OPS.has(head)) return { error: `"${head}" isn't supported by this version of the app`, adjusted: [] }
  return { error: `"${words[0]}" isn't an op`, adjusted: [] }
}

export type ParseContext = {
  /** The plan the reply was written against. */
  plan: Plan
  /** False where there's no weekly goal to change (the owner's shipped goals). */
  canSetWeekly?: boolean
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
