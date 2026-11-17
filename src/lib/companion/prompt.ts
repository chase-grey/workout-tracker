/**
 * The prompt the copy-paste companion hands to a chat AI, and the fix-up
 * message for a reply the app couldn't read.
 *
 * It has to fit in one paste and be read by a free-tier model, so it is short
 * (under {@link PROMPT_MAX_CHARS}) and says only what a plan change needs: who
 * this is, the plan by day with the exact keys a reply must use, the last four
 * weeks in a line or two, and the WT v1 format with one small example (see
 * lib/companion/parse). The model is told to ask its questions first and wait,
 * because a plan written before it knows the schedule or the injuries is a plan
 * the user has to send back.
 *
 * With cardio among the person's pillars it carries cardio too: where the log
 * says they are, the last four weeks' minutes and latest sessions (the coach's
 * own renderers, lib/contextPack), the plan being followed (describeCardioPlan,
 * as the coach reads it) and the cardio ops. Opened on cardio — from the goal
 * sheet, or the plan on Progress — the prompt is about the cardio plan alone:
 * a running coach's opening, today's date for `by=`, the lifting days to keep
 * clear, and the cardio ops without the lift ones, which a free model would
 * otherwise reach for.
 *
 * Nothing in it names the person: the consent the sheet asks for covers
 * training and body data going to a third-party AI, and a name adds nothing a
 * plan needs.
 *
 * Pure and deterministic — the same input always writes the same prompt.
 */

import type { WorkoutRow } from '../../types'
import { DAY_TYPES, repRangeLabel, type Plan, type PlannedExercise } from '../../config/plan'
import type { CardioEntry } from '../cardio'
import {
  cardioLevelFrom,
  describeCardioPlan,
  fmtClock,
  fmtDistance,
  goalLabel,
  planActive,
  WEEKDAY_NAMES,
  type CardioPlan,
} from '../cardioPlan'
import { bodyFacts, cardioWeeks, recentCardio, recentTopSets, sessionsByWeek, strengthFacts } from '../contextPack'
import { parseDiscomfort } from '../discomfort'
import { toISODate } from '../dates'
import { hasPillar, type Profile } from '../profile'
import { COMPANION_VERSION, LIMITS } from './ops'
import type { CompanionParse } from './parse'

/** The most a prompt may run to: long enough for the plan, short enough for any chat box. */
export const PROMPT_MAX_CHARS = 4000

export type CompanionPromptInput = {
  today: Date
  plan: Plan
  profile?: Profile | null
  heightIn?: number
  workouts: WorkoutRow[]
  /** The weekly workouts goal, or null where a reply can't change it. */
  weeklyWorkouts: number | null
  /** Cardio, where it's one of the person's pillars: the log, the plan in settings, the weekdays they lift on. */
  cardio?: { entries: CardioEntry[]; plan?: CardioPlan; liftDays: number[] }
  /** What the prompt is about: the lift plan (cardio alongside it), or the cardio plan alone. */
  focus?: 'lifts' | 'cardio'
}

const unslug = (key: string) => key.replace(/_/g, ' ')

/** `flat_bench "flat bench press" 3x6-10 120s`, the name only where the key doesn't already say it. */
function exerciseLine(e: PlannedExercise, withNames: boolean): string {
  const name = withNames && e.name && e.name.toLowerCase() !== unslug(e.key) ? ` "${e.name}"` : ''
  const unit = e.timed ? 's hold' : ''
  return `${e.key}${name} ${e.sets}x${repRangeLabel(e).replace('–', '-')}${unit} ${e.restSec}s`
}

function planLines(plan: Plan, withNames: boolean): string[] {
  return DAY_TYPES.filter((d) => (plan[d]?.exercises.length ?? 0) > 0).map(
    (d) => `day=${d} "${plan[d].label}": ${plan[d].exercises.map((e) => exerciseLine(e, withNames)).join('; ')}`,
  )
}

function meLine(input: CompanionPromptInput): string {
  const { profile, today } = input
  const facts: string[] = []
  if (profile) {
    const body = bodyFacts(profile, today, input.heightIn)
    if (body.length) facts.push(body.join(', '))
    if (hasPillar(profile, 'strength') && profile.strength) facts.push(`lifts ${strengthFacts(profile.strength)}`)
  }
  if (input.weeklyWorkouts != null) facts.push(`weekly goal ${input.weeklyWorkouts} workouts`)
  return `ME: ${facts.join('; ') || 'no profile details'}.`
}

function historyLines(input: CompanionPromptInput, maxTopSets: number): string[] {
  const weeks = sessionsByWeek(input.workouts, input.today)
  const total = weeks.reduce((n, w) => n + w.sessions, 0)
  if (total === 0) return ['LAST 4 WEEKS: no workouts logged.']
  const lines = [`LAST 4 WEEKS: workouts per week ${weeks.map((w) => w.sessions).join(', ')} (oldest first).`]
  const tops = recentTopSets(input.workouts, input.today).slice(0, maxTopSets)
  if (tops.length) {
    lines.push(
      `Latest top sets: ${tops.map((t) => `${t.exercise} ${t.weightLbs == null ? 'BW' : t.weightLbs}x${t.reps}`).join(', ')}.`,
    )
  }
  const cutoff = new Date(input.today)
  cutoff.setDate(cutoff.getDate() - 28)
  const from = toISODate(cutoff)
  const sore = new Map<string, Set<string>>()
  for (const w of input.workouts) {
    if (w.date < from) continue
    for (const spot of parseDiscomfort(w.notes)) {
      const set = sore.get(w.exercise) ?? new Set<string>()
      set.add(spot)
      sore.set(w.exercise, set)
    }
  }
  if (sore.size) {
    lines.push(`Discomfort flagged: ${[...sore].map(([ex, spots]) => `${[...spots].join('/')} on ${ex}`).join(', ')}.`)
  }
  return lines
}

/** The kind cardio is read for: the plan's, else the most logged lately, else run. */
function cardioKind(cardio: NonNullable<CompanionPromptInput['cardio']>, today: string): string {
  if (cardio.plan && planActive(cardio.plan, today)) return cardio.plan.kind
  const counts = new Map<string, number>()
  for (const e of cardio.entries) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'run'
}

/**
 * Where the log says cardio is, the weeks' minutes, the latest sessions (as
 * many as `latest` allows) and the plan being followed.
 */
function cardioLines(input: CompanionPromptInput, latest: number): string[] {
  const cardio = input.cardio!
  const today = toISODate(input.today)
  const kind = cardioKind(cardio, today)
  const active = planActive(cardio.plan, today) ? cardio.plan : undefined
  const level = cardioLevelFrom(cardio.entries, kind, active?.goal, today)
  const lines: string[] = []
  if (!level) lines.push(`CARDIO NOW: no ${kind} logged in the last 6 weeks.`)
  else {
    const now = [
      `longest ${level.longestMin} min${level.longestMi ? ` / ${fmtDistance(level.longestMi)}` : ''}`,
      `${level.weeklyMin} min a week`,
      ...(level.paceMinPerMi ? [`easy pace ${fmtClock(level.paceMinPerMi)}/mi`] : []),
      ...(active && active.goal.type === 'time' && level.timeMin ? [`${fmtDistance(active.goal.distanceMi)} now ~${fmtClock(level.timeMin)}`] : []),
    ]
    lines.push(`CARDIO NOW (${kind}, from my log, last 6 weeks): ${now.join(', ')}.`)
  }
  const weeks = cardioWeeks(cardio.entries, input.today)
  if (weeks.some((w) => w.minutes > 0)) {
    lines.push(`Cardio minutes per week ${weeks.map((w) => w.minutes).join(', ')} (oldest first).`)
  }
  const recent = recentCardio(cardio.entries, input.today, latest)
  if (recent.length) lines.push(`Latest: ${recent.join('; ')}.`)
  if (active) lines.push(`CARDIO PLAN (${goalLabel(active.kind, active.goal)}):`, ...describeCardioPlan(active, cardio.entries, today))
  else lines.push('CARDIO PLAN: none yet.')
  return lines
}

/** The cardio ops, for a prompt about lifts (`full` false: the main ones) or about cardio. */
function cardioFormatLines(full: boolean): string[] {
  const [lo, hi] = LIMITS.cardioDays
  return [
    'cardio goal kind=run|walk|hike|bike|swim|row dist=5k|10k|half|marathon|<N>mi [time=MM:SS] [days=tue,thu,sat] [by=YYYY-MM-DD]   (or min=<minutes a week> instead of dist)',
    'cardio level [longest=MIN] [longestmi=MI] [weekly=MIN] [pace=MM:SS per mi] [now=MM:SS at the goal distance]   (only where my answers differ from my log)',
    'cardio days tue,thu,sat',
    'cardio date YYYY-MM-DD',
    ...(full ? ['cardio checkpoint dist=2mi | min=25 | dist=5k time=30:00 | week=90'] : []),
    'cardio replan   (rebuild the weeks ahead from my log)',
    'cardio end',
    `The app builds every session itself: ${lo}-${hi} days, at most 10% more a week, every 4th week lighter, a taper. A date sooner than that allows is moved later.`,
  ]
}

function formatLines(plan: Plan, weekly: boolean, cardio: boolean): string[] {
  const days = DAY_TYPES.filter((d) => (plan[d]?.exercises.length ?? 0) > 0)
  const first = plan[days[0]]?.exercises[0]
  const exampleKey = first?.key ?? 'flat_bench'
  return [
    `FORMAT (WT v${COMPANION_VERSION}). One op per line, key=value fields, quote names with spaces:`,
    'summary: <one sentence on what changes and why>   (required)',
    'ask: <question>   (only if you still need an answer)',
    'lift set day=<day> ex=<key> [sets=N] [reps=N-M] [rest=SECONDS]',
    'lift add day=<day> name="<exercise>" sets=N reps=N-M rest=SECONDS [group=<muscle>]',
    'lift remove day=<day> ex=<key>',
    'lift move day=<day> ex=<key> before=<key> | after=<key> | to=<position, 1 is first>',
    ...(weekly ? ['weekly workouts=N'] : []),
    `Days: ${days.join(', ')}. Use the exact keys above. Limits: sets ${LIMITS.sets.join('-')}, reps ${LIMITS.reps.join('-')}, rest ${LIMITS.restSec.join('-')}s. To swap an exercise, remove it and add the new one.`,
    ...(cardio ? cardioFormatLines(false) : []),
    'Example:',
    '```wt',
    `WT v${COMPANION_VERSION}`,
    'summary: one more set on the first lift, and face pulls',
    `lift set day=${days[0] ?? 'push'} ex=${exampleKey} sets=${Math.min((first?.sets ?? 3) + 1, LIMITS.sets[1])}`,
    `lift add day=${days[days.length - 1] ?? 'pull'} name="face pull" sets=3 reps=12-15 rest=60`,
    'END',
    '```',
  ]
}

/** The prompt about the cardio plan alone. Fitted by giving up the latest sessions, oldest first. */
function buildCardioPrompt(input: CompanionPromptInput): string {
  const cardio = input.cardio!
  const liftDays = cardio.liftDays.length ? cardio.liftDays.map((d) => WEEKDAY_NAMES[d]).join('/') : null
  const write = (latest: number) =>
    [
      'You are my running and cardio coach, helping me set a cardio goal in my workout tracker app. The app builds the week-by-week plan from the goal, days, date and where I am now; you choose those.',
      'First ask me up to 4 short questions, all in one message, then wait for my answers.',
      'After I answer, reply with a short explanation and ONE code block in exactly the format below. Nothing after END.',
      '',
      `Today is ${toISODate(input.today)}.`,
      meLine(input),
      ...cardioLines(input, latest),
      ...(liftDays ? [`I usually lift on ${liftDays}; keep the long session off those days if you can.`] : []),
      '',
      `FORMAT (WT v${COMPANION_VERSION}). One op per line, key=value fields:`,
      'summary: <one sentence on the goal and why>   (required)',
      'ask: <question>   (only if you still need an answer)',
      ...cardioFormatLines(true),
      'Example:',
      '```wt',
      `WT v${COMPANION_VERSION}`,
      'summary: a first 5k, three runs a week around lifting',
      'cardio goal kind=run dist=5k days=tue,thu,sat',
      'cardio level longest=20 weekly=60',
      'END',
      '```',
    ].join('\n')
  for (let latest = 6; latest >= 0; latest -= 2) {
    const text = write(latest)
    if (text.length <= PROMPT_MAX_CHARS) return text
  }
  return write(0)
}

/**
 * The prompt to paste into a chat AI. Fitted under {@link PROMPT_MAX_CHARS} by
 * giving up, in order, the tail of the top-set list, then the exercise names
 * (the keys stay — a reply can't be read without them), then the latest
 * cardio sessions.
 */
export function buildCompanionPrompt(input: CompanionPromptInput): string {
  if (input.focus === 'cardio' && input.cardio) return buildCardioPrompt(input)
  const head = [
    'You are my strength coach, helping me change my lifting plan in my workout tracker app.',
    'First ask me up to 4 short questions, all in one message, then wait for my answers.',
    'After I answer, reply with a short explanation and ONE code block in exactly the format below. Nothing after END.',
    '',
    meLine(input),
  ]
  const cardio = !!input.cardio
  const write = (withNames: boolean, maxTopSets: number, latestCardio: number) =>
    [
      ...head,
      ...(cardio ? [`Today is ${toISODate(input.today)}.`] : []),
      'PLAN (exercise key, name, sets x reps, rest):',
      ...planLines(input.plan, withNames),
      ...historyLines(input, maxTopSets),
      ...(cardio ? cardioLines(input, latestCardio) : []),
      '',
      ...formatLines(input.plan, input.weeklyWorkouts != null, cardio),
    ].join('\n')

  for (const withNames of [true, false]) {
    for (let tops = 12; tops >= 0; tops -= 4) {
      const text = write(withNames, tops, 3)
      if (text.length <= PROMPT_MAX_CHARS) return text
    }
  }
  return write(false, 0, 0)
}

/** The one line sent in an "open ChatGPT" link, where the full prompt won't fit in a URL. */
export const BOOTSTRAP_LINE =
  "I'm about to paste a prompt from my workout tracker app. Reply only with \"ready\" and wait for it."

/**
 * The message to send back when a reply couldn't be used, quoting every bad
 * line with what was wrong, and asking for the whole block again — a partial
 * resend would leave the app guessing which lines it replaces.
 */
export function buildRepairPrompt(parse: CompanionParse, applyErrors: string[] = []): string {
  const again = `Resend the WHOLE WT v${COMPANION_VERSION} block, corrected, in ONE code block. Nothing after END.`
  if (!parse.found) {
    return `I couldn't find a WT v${COMPANION_VERSION} block in your reply. Reply with ONE code block that starts with WT v${COMPANION_VERSION} and ends with END, in the format I gave you.`
  }
  if (!parse.complete) {
    return `Your reply was cut off before END, so my app applied nothing. ${again} Keep the summary short.`
  }
  const lines = [
    ...parse.errors.map((e) => (e.line > 0 ? `- line ${e.line} \`${e.text}\`: ${e.message}` : `- ${e.message}`)),
    ...applyErrors.map((e) => `- ${e}`),
  ]
  return [`My app couldn't use your block, so it applied nothing:`, ...lines, again].join('\n')
}
