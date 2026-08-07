import type { BodyWeightEntry, DayType, StreakState, WorkoutRow } from '../types'
import { PLAN, DAY_TYPES, exerciseName, repRangeLabel } from '../config/plan'
import { toISODate, parseISODate } from './dates'

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
      lines.push(
        `  - ${ex.name}: ${ex.sets} x ${repRangeLabel(ex)} reps, ${ex.restSec}s rest${optional}`,
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
      parts.push(`${exerciseName(exercise)} ${ordered.map(formatSet).join(', ')}`)
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
    "You have tools that act on the app itself, and you are authorized to use them whenever the user asks — never claim you lack permission or the ability. Use update_plan to edit the workout plan, update_flex_routine to edit the stretch routine, and report_issue to file a bug or feature request about the app as a GitHub issue (call it whenever the user reports a problem or asks to file something, including test reports, then confirm the issue number back to them).",
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
