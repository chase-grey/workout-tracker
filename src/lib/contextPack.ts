/**
 * The facts about a person that every AI prompt the app writes says the same
 * way: the BYO-key coach's system prompt (lib/chatPrompt) and the copy-paste
 * companion's prompt (lib/companion/prompt). One renderer, so the two can't
 * drift into describing the same person differently.
 *
 * Pure module — no React/DOM, no storage.
 */

import type { WorkoutRow } from '../types'
import { cardioMinutesByWeek, cardioLine, type CardioEntry } from './cardio'
import { parseISODate, toISODate, weekStartISO } from './dates'
import { ACTIVITY_LABELS, EQUIPMENT_LABELS, SEX_LABELS, ageOf, type Profile, type StrengthSetup } from './profile'

/** Sex, age, height and activity, as many as are known: "female, 34 years old, 5'6\" tall". */
export function bodyFacts(profile: Profile, today: Date, heightIn: number | undefined): string[] {
  const body: string[] = []
  if (profile.sex) body.push(SEX_LABELS[profile.sex])
  const age = ageOf(profile, today)
  if (age != null) body.push(`${age} years old`)
  if (heightIn) body.push(`${Math.floor(heightIn / 12)}'${Math.round(heightIn % 12)}" tall`)
  if (profile.activity) body.push(`active ${ACTIVITY_LABELS[profile.activity]} days a week`)
  return body
}

/** "3 days a week, full gym, workouts up to 45 min, wants to grow chest, back". */
export function strengthFacts(strength: StrengthSetup): string {
  return [
    `${strength.daysPerWeek} days a week, ${EQUIPMENT_LABELS[strength.equipment]}`,
    ...(strength.minutes ? [`workouts up to ${strength.minutes} min`] : []),
    ...(strength.focus?.length ? [`wants to grow ${strength.focus.join(', ')}`] : []),
  ].join(', ')
}

/** The heaviest set of a lift's latest session in the window, and that session's date. */
export type TopSet = { exercise: string; date: string; weightLbs: number | null; reps: number }

/**
 * Each lift's latest session in the `days` before `today`, by its heaviest set
 * (most reps breaking a tie), newest first. What a lift is "at" now, in one set.
 */
export function recentTopSets(workouts: WorkoutRow[], today: Date, days = 28): TopSet[] {
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - days)
  const from = toISODate(cutoff)
  const latest = new Map<string, TopSet>()
  for (const w of workouts) {
    if (w.date < from || w.reps <= 0) continue
    const cur = latest.get(w.exercise)
    if (cur && cur.date > w.date) continue
    const heavier =
      !cur ||
      cur.date < w.date ||
      (w.weight_lbs ?? 0) > (cur.weightLbs ?? 0) ||
      ((w.weight_lbs ?? 0) === (cur.weightLbs ?? 0) && w.reps > cur.reps)
    if (heavier) latest.set(w.exercise, { exercise: w.exercise, date: w.date, weightLbs: w.weight_lbs, reps: w.reps })
  }
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date) || a.exercise.localeCompare(b.exercise))
}

/** Cardio minutes in each of the last `weeks` Monday weeks, this one included, oldest first. */
export function cardioWeeks(entries: CardioEntry[], today: Date, weeks = 4): { week: string; minutes: number }[] {
  const thisWeek = weekStartISO(toISODate(today))
  const minutes = cardioMinutesByWeek(entries)
  const out: { week: string; minutes: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = parseISODate(thisWeek)
    monday.setDate(monday.getDate() - 7 * i)
    const week = toISODate(monday)
    out.push({ week, minutes: Math.round(minutes.get(week) ?? 0) })
  }
  return out
}

/** The latest `n` cardio sessions since three weeks before this one, newest first: "2026-11-15: run, 20 min · 1.8 mi". */
export function recentCardio(entries: CardioEntry[], today: Date, n = 6): string[] {
  const cutoff = parseISODate(weekStartISO(toISODate(today)))
  cutoff.setDate(cutoff.getDate() - 21)
  const from = toISODate(cutoff)
  return entries
    .filter((e) => e.date >= from)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n)
    .map((e) => `${e.date}: ${cardioLine(e)}`)
}

/** Workouts (distinct sessions) in each of the last `weeks` Monday weeks, oldest first. */
export function sessionsByWeek(workouts: WorkoutRow[], today: Date, weeks = 4): { week: string; sessions: number }[] {
  const thisWeek = weekStartISO(toISODate(today))
  const out: { week: string; sessions: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = parseISODate(thisWeek)
    monday.setDate(monday.getDate() - 7 * i)
    out.push({ week: toISODate(monday), sessions: 0 })
  }
  const seen = new Map<string, Set<string>>()
  for (const w of workouts) {
    const week = weekStartISO(w.date)
    if (!out.some((o) => o.week === week)) continue
    const set = seen.get(week) ?? new Set<string>()
    set.add(w.session_id)
    seen.set(week, set)
  }
  for (const o of out) o.sessions = seen.get(o.week)?.size ?? 0
  return out
}
