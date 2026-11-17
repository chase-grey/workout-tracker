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
 * Nothing in it names the person: the consent the sheet asks for covers
 * training and body data going to a third-party AI, and a name adds nothing a
 * plan needs.
 *
 * Pure and deterministic — the same input always writes the same prompt.
 */

import type { WorkoutRow } from '../../types'
import { DAY_TYPES, repRangeLabel, type Plan, type PlannedExercise } from '../../config/plan'
import { bodyFacts, recentTopSets, sessionsByWeek, strengthFacts } from '../contextPack'
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

function formatLines(plan: Plan, weekly: boolean): string[] {
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

/**
 * The prompt to paste into a chat AI. Fitted under {@link PROMPT_MAX_CHARS} by
 * giving up, in order, the tail of the top-set list, then the exercise names
 * (the keys stay — a reply can't be read without them).
 */
export function buildCompanionPrompt(input: CompanionPromptInput): string {
  const head = [
    'You are my strength coach, helping me change my lifting plan in my workout tracker app.',
    'First ask me up to 4 short questions, all in one message, then wait for my answers.',
    'After I answer, reply with a short explanation and ONE code block in exactly the format below. Nothing after END.',
    '',
    meLine(input),
  ]
  const write = (withNames: boolean, maxTopSets: number) =>
    [
      ...head,
      'PLAN (exercise key, name, sets x reps, rest):',
      ...planLines(input.plan, withNames),
      ...historyLines(input, maxTopSets),
      '',
      ...formatLines(input.plan, input.weeklyWorkouts != null),
    ].join('\n')

  for (const withNames of [true, false]) {
    for (let tops = 12; tops >= 0; tops -= 4) {
      const text = write(withNames, tops)
      if (text.length <= PROMPT_MAX_CHARS) return text
    }
  }
  return write(false, 0)
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
