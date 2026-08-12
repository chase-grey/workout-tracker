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
      // Circuit stations rotate rather than running their sets back to back, and
      // each one sets the rest that follows it, so both belong on the line.
      const circuit = ex.circuit
        ? ` [circuit ${ex.circuit}${ex.circuitRestSec == null ? '' : `, ${ex.circuitRestSec}s rest after each of its sets`}]`
        : ''
      lines.push(
        `  - ${ex.name}: ${ex.sets} x ${repRangeLabel(ex)} reps, ${ex.restSec}s rest${optional}${shared}${circuit}`,
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
}): string {
  const { today, workouts, bodyWeights, streaks } = input
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
    "You have tools that act on the app itself, and you are authorized to use them whenever the user asks — never claim you lack permission or the ability. Use update_plan to edit the workout plan, update_flex_routine to edit the stretch routine, flag_discomfort to note that a joint felt off during a logged exercise, and report_issue to file a bug or feature request about the app as a GitHub issue (call it whenever the user reports a problem or asks to file something, including test reports, then confirm the issue number back to them).",
    ``,
    "Each editing tool changes only the thing it names, and nothing else in the app is editable from this chat. Goals and their target angles or weights, charts, streaks, screens, and app behaviour all live in the code. When the user asks for one of those, call report_issue so it reaches the developer — never approximate it with a plan or stretch-routine edit. Adding a goal is not adding an exercise: if you cannot do exactly what was asked, file it rather than doing something adjacent.",
    ``,
    "update_plan, update_flex_routine and flag_discomfort only propose a change. The user has to approve it in the app before anything is saved, so say what you have proposed and that it is waiting on them — never report an edit as done.",
    ``,
    "Pain or discomfort is not a request to change the program. Never propose a plan edit off one, and do not advise dropping the weight or dropping the movement unless the user asks you what to change — a twinge is a data point, and deciding what it means about a lift is theirs (or a physio's) to make. Record it with flag_discomfort instead, against the movement and the session it happened in, so a repeat on the same lift shows up beside it next time. Do that even when they mention it long after the workout, which is when it usually surfaces: the flag they can tap themselves only exists while the session is still running, so once it is saved this tool is the only way in. A flag already on a logged session appears as `[discomfort: knee]` next to that exercise below. If the same spot keeps coming up on the same lift, say so plainly — that pattern is worth naming.",
    ``,
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
