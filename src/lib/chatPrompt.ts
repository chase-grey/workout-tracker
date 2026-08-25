import type { BodyWeightEntry, DayType, StreakState, WorkoutRow } from '../types'
import { PLAN, DAY_TYPES, exerciseName, repRangeLabel } from '../config/plan'
import { toISODate, parseISODate } from './dates'
import { parseDiscomfort } from './discomfort'

/** Format one set as "weightxreps" (e.g. "135x8"), or "BWxreps" when weight is blank. */
function formatSet(row: WorkoutRow): string {
  const weight = row.weight_lbs == null ? 'BW' : String(row.weight_lbs)
  return `${weight}x${row.reps}`
}

/** Render the full hardcoded plan as a compact text block. */
function renderPlan(): string {
  const lines: string[] = []
  for (const dayType of DAY_TYPES) {
    const day = PLAN[dayType]
    lines.push(`${day.label} (${day.type}):`)
    for (const ex of day.exercises) {
      const optional = ex.optional ? ' [optional]' : ''
      // Exercises sharing a load are prescribed one weight between them, so the
      // coach shouldn't propose a number for either of them alone.
      const shared = ex.sharedLoad ? ` [shares one weight with the other ${ex.sharedLoad} move]` : ''
      // A dumbbell in each hand: the logged number is the pair's total, so the
      // smallest change is 10 lbs. The coach talks in these numbers and can add
      // exercises, so the rule belongs where it can read it.
      const paired = ex.dumbbellPair
        ? ' [a dumbbell in each hand, so the weight logged is the pair total and only moves in 10s]'
        : ''
      // Circuit stations rotate rather than running their sets back to back, and
      // each one sets the rest that follows it, so both belong on the line.
      const circuit = ex.circuit
        ? ` [circuit ${ex.circuit}${ex.circuitRestSec == null ? '' : `, ${ex.circuitRestSec}s rest after each of its sets`}${ex.circuitRoundRestSec == null ? '' : `, ${ex.circuitRoundRestSec}s rest after each full round of it`}]`
        : ''
      // A timed hold logs seconds in the same field a lift logs reps, so the range
      // is a range of seconds. Said outright, or the coach reads a 30-second plank
      // as thirty repetitions of something.
      const unit = ex.timed ? 'second hold' : 'reps'
      // A movement that can't be loaded reads as an open-ended `15+`, which the
      // coach would otherwise answer with a weight to add. There is no weight to
      // add: more of them is the only progression it has.
      const ladder = ex.repLadder ? ' [takes no weight — it progresses by reps alone, with no top]' : ''
      lines.push(
        `  - ${ex.name}: ${ex.sets} x ${repRangeLabel(ex)} ${unit}, ${ex.restSec}s rest${optional}${shared}${paired}${circuit}${ladder}`,
      )
    }
  }
  return lines.join('\n')
}

/**
 * Render workouts within the window, grouped by date then exercise, e.g.:
 * "2026-05-01 [push]: Incline Barbell Press 135x8, 140x6; Cable Crunch 80x10, 80x10"
 */
function renderWorkouts(rows: WorkoutRow[]): string {
  if (rows.length === 0) return '(no workouts logged in this window)'

  // Group by date, preserving a stable day_type per date and exercise ordering.
  const byDate = new Map<string, { dayType: DayType; exercises: Map<string, WorkoutRow[]> }>()
  for (const row of rows) {
    let entry = byDate.get(row.date)
    if (!entry) {
      entry = { dayType: row.day_type, exercises: new Map() }
      byDate.set(row.date, entry)
    }
    const list = entry.exercises.get(row.exercise) ?? []
    list.push(row)
    entry.exercises.set(row.exercise, list)
  }

  const dates = [...byDate.keys()].sort()
  const lines: string[] = []
  for (const date of dates) {
    const entry = byDate.get(date)!
    const parts: string[] = []
    for (const [exercise, sets] of entry.exercises) {
      const ordered = [...sets].sort((a, b) => a.set_number - b.set_number)
      // A discomfort flag sits on the exercise log, so every set row of that
      // exercise carries it — read as one note for the movement, not per set.
      const spots: string[] = []
      for (const row of ordered) {
        for (const spot of parseDiscomfort(row.notes)) if (!spots.includes(spot)) spots.push(spot)
      }
      const flagged = spots.length > 0 ? ` [discomfort: ${spots.join(', ')}]` : ''
      parts.push(`${exerciseName(exercise)} ${ordered.map(formatSet).join(', ')}${flagged}`)
    }
    lines.push(`${date} [${entry.dayType}]: ${parts.join('; ')}`)
  }
  return lines.join('\n')
}

/**
 * The optional tool sets the coach is given, switched from the chat UI.
 *
 * A tool set costs its schemas and its share of these instructions on every
 * send, used or not, so the ones that only matter now and then are left out
 * until they're switched on.
 */
export type CoachSkills = {
  /** update_plan and update_flex_routine. Off by default — the plan rarely changes. */
  planEdits: boolean
  /** report_issue. On by default: anything the app can't do has to reach the developer. */
  issues: boolean
}

/** Join a list as "a, b and c". */
function andList(items: string[]): string {
  if (items.length < 2) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * The paragraphs about whichever tools this conversation was actually given.
 *
 * A switched-off tool set is named as switched off rather than passed over in
 * silence: with no update_plan to hand the coach reaches for the nearest thing
 * still on its belt, so a request it can no longer serve has to come back as
 * "that button is off", never as a near-miss from another tool.
 */
function renderTools(skills: CoachSkills): string[] {
  const uses: string[] = []
  if (skills.planEdits) {
    uses.push(
      'update_plan to edit the workout plan',
      'update_flex_routine to edit either of the two stretch routines',
    )
  }
  uses.push('flag_discomfort to note that a joint felt off during a logged exercise')
  if (skills.issues) {
    uses.push(
      'report_issue to file a bug or feature request about the app as a GitHub issue (call it whenever the user reports a problem or asks to file something, including test reports, then confirm the issue number back to them)',
    )
  }

  const lines = [
    `You have tools that act on the app itself, and you are authorized to use them whenever the user asks — never claim you lack permission or the ability. Use ${andList(uses)}.`,
    ``,
  ]

  if (skills.planEdits) {
    const elsewhere = skills.issues
      ? 'When the user asks for one of those, call report_issue so it reaches the developer — never approximate it with a plan or stretch-routine edit. Adding a goal is not adding an exercise: if you cannot do exactly what was asked, file it rather than doing something adjacent.'
      : 'When the user asks for one of those, say plainly that it needs the developer — never approximate it with a plan or stretch-routine edit. Adding a goal is not adding an exercise: if you cannot do exactly what was asked, say so rather than doing something adjacent.'
    lines.push(
      `Each editing tool changes only the thing it names, and nothing else in the app is editable from this chat. Goals and their target angles or weights, charts, streaks, screens, and app behaviour all live in the code. ${elsewhere}`,
      ``,
      `A movement done with a dumbbell in each hand logs the pair's total, so its weight step is 10 lbs and never 5: the rack moves in 5s and both hands change at once. Give any such exercise you add \`increment: 10\`, and never talk about a 5-lb jump on one of the paired movements marked in the plan below.`,
      ``,
    )
  } else {
    lines.push(
      'Plan editing is switched off in this conversation. You cannot change the workout plan or the stretch routines, and must not describe a change to either as made or proposed. If the user asks for one, tell them to turn on the "edit plan" button above the message box and ask again.',
      ``,
    )
  }

  if (!skills.issues) {
    lines.push(
      'Issue filing is switched off in this conversation, so nothing about the app itself can be written up from here. If the user reports a problem with the app or asks for a change the code would have to make, tell them to turn on the "report issues" button above the message box.',
      ``,
    )
  }

  const proposing = [
    ...(skills.planEdits ? ['update_plan', 'update_flex_routine'] : []),
    'flag_discomfort',
  ]
  lines.push(
    `Calling ${andList(proposing)} only proposes a change. The user has to approve it in the app before anything is saved, so say what you have proposed and that it is waiting on them — never report an edit as done.`,
    ``,
  )

  const noEdit = skills.planEdits
    ? 'Never propose a plan edit off one, and do not'
    : 'Do not'
  lines.push(
    `Pain or discomfort is not a request to change the program. ${noEdit} advise dropping the weight or dropping the movement unless the user asks you what to change — a twinge is a data point, and deciding what it means about a lift is theirs (or a physio's) to make. Record it with flag_discomfort instead, against the movement and the session it happened in, so a repeat on the same lift shows up beside it next time. Do that even when they mention it long after the workout, which is when it usually surfaces: there is no control in the app for it, so this tool is the only way one gets recorded at all. A flag already on a logged session appears as \`[discomfort: knee]\` next to that exercise below. If the same spot keeps coming up on the same lift, say so plainly — that pattern is worth naming.`,
    ``,
  )

  return lines
}

/** Render body-weight entries within the window as a "date: weight" list. */
function renderBodyWeights(entries: BodyWeightEntry[]): string {
  if (entries.length === 0) return '(no body weight entries in this window)'
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `${e.date}: ${e.weightLbs} lbs`)
    .join('\n')
}

/**
 * Build the system prompt that gives the assistant the user's training context.
 * Pure — no I/O. Includes the plan, last 90 days of workouts and body weight,
 * and current streaks.
 */
export function buildSystemPrompt(input: {
  today: Date
  workouts: WorkoutRow[]
  bodyWeights: BodyWeightEntry[]
  streaks: StreakState
  skills: CoachSkills
}): string {
  const { today, workouts, bodyWeights, streaks, skills } = input
  const todayISO = toISODate(today)

  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 90)

  const inWindow = (dateStr: string) => parseISODate(dateStr) >= cutoff
  const recentWorkouts = workouts.filter((w) => inWindow(w.date))
  const recentWeights = bodyWeights.filter((b) => inWindow(b.date))

  return [
    "You are a fitness assistant for a single user. Answer using the user's actual training data below. Be concise, practical, and specific — reference their real numbers, exercises, and trends. If the data does not cover a question, say so briefly.",
    ``,
    'Your replies are rendered as Markdown on a phone, so short bullet lists, bold, and inline code all display properly. Keep the formatting light — no tables, and no heading above a two-line answer.',
    ``,
    ...renderTools(skills),
    `Current date: ${todayISO}`,
    ``,
    `## Workout plan`,
    renderPlan(),
    ``,
    `## Logged workouts (last 90 days)`,
    renderWorkouts(recentWorkouts),
    ``,
    `## Body weight (last 90 days)`,
    renderBodyWeights(recentWeights),
    ``,
    `## Streaks`,
    `Weekly-goal streak (weeks hitting 2 workouts + 2 flex + calories 6/7): ${streaks.streak}`,
    `Streak freezes available: ${streaks.freezes}`,
  ].join('\n')
}
