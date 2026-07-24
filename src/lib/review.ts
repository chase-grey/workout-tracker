/**
 * Month-in-review and year-in-review: a periodic recap that turns the raw log
 * into an encouraging story. On the first app open of a new month (or new year)
 * we look back at the period that just closed, tally what happened, flag any
 * all-time bests, and stitch it into a short narrative.
 *
 * Pure module — no React/DOM — so the numbers and the story are unit-testable;
 * `ReviewOverlay` only renders what `buildReview` returns.
 */

import type { BodyWeightEntry, WorkoutRow } from '../types'
import type { CalorieEntry } from './calories'
import { calorieHitDates, dayTotals } from './calories'
import { epley1RM } from './epley'

export type ReviewData = {
  workouts: WorkoutRow[]
  flexDates: string[]
  calorieEntries: CalorieEntry[]
  bodyWeights: BodyWeightEntry[]
}

export type ReviewKind = 'month' | 'year'

/** A period identified by its key: `YYYY-MM` for a month, `YYYY` for a year. */
type InPeriod = (dateISO: string) => boolean

export type PeriodStats = {
  workouts: number
  absSessions: number
  stretches: number
  calorieDays: number
  totalCalories: number
  avgCalories: number
  bestCalorieDay: number
  prs: number
  weightChangeLbs: number | null
}

/** Which metrics a period leads all others on. */
export type Superlative = 'workouts' | 'stretches' | 'calorieDays' | 'totalCalories' | 'prs'

export type Review = {
  kind: ReviewKind
  periodKey: string
  title: string
  subtitle: string
  stats: { label: string; value: string }[]
  highlights: string[]
  story: string
  /** Any all-time best in the period — the overlay celebrates louder when true. */
  isBest: boolean
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ---------------------------------------------------------------------------
// Period keys.
// ---------------------------------------------------------------------------

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function yearKeyOf(d: Date): string {
  return String(d.getFullYear())
}

/** The `YYYY-MM` key of the month before `d`. */
export function prevMonthKey(d: Date): string {
  return monthKeyOf(new Date(d.getFullYear(), d.getMonth() - 1, 1))
}

/** The `YYYY` key of the year before `d`. */
export function prevYearKey(d: Date): string {
  return String(d.getFullYear() - 1)
}

/** Membership test for a period key (month `YYYY-MM` or year `YYYY`). */
function inPeriodFor(kind: ReviewKind, periodKey: string): InPeriod {
  const len = kind === 'month' ? 7 : 4
  return (dateISO) => dateISO.slice(0, len) === periodKey
}

/** Human label for a period key, e.g. "July 2026" or "2026". */
function periodLabel(kind: ReviewKind, periodKey: string): string {
  if (kind === 'year') return periodKey
  const [year, month] = periodKey.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

// ---------------------------------------------------------------------------
// Stats.
// ---------------------------------------------------------------------------

/** Distinct sessions in the period, split into training (non-abs) and core. */
function sessionCounts(workouts: WorkoutRow[], inPeriod: InPeriod): { workouts: number; abs: number } {
  const seen = new Set<string>()
  let training = 0
  let abs = 0
  for (const r of workouts) {
    if (!r.session_id || seen.has(r.session_id) || !inPeriod(r.date)) continue
    seen.add(r.session_id)
    if (r.day_type === 'abs') abs += 1
    else training += 1
  }
  return { workouts: training, abs }
}

/** Count of exercises whose all-time best est-1RM was achieved inside the period. */
function prsInPeriod(workouts: WorkoutRow[], inPeriod: InPeriod): number {
  const best = new Map<string, { est: number; date: string }>()
  for (const r of workouts) {
    if (r.weight_lbs == null) continue
    const est = epley1RM(r.weight_lbs, r.reps)
    const prior = best.get(r.exercise)
    // Prefer the later date on ties so a plateau counts toward the most recent period.
    if (!prior || est > prior.est || (est === prior.est && r.date > prior.date)) {
      best.set(r.exercise, { est, date: r.date })
    }
  }
  let count = 0
  for (const { est, date } of best.values()) {
    if (est > 0 && inPeriod(date)) count += 1
  }
  return count
}

export function periodStats(data: ReviewData, inPeriod: InPeriod): PeriodStats {
  const { workouts: training, abs } = sessionCounts(data.workouts, inPeriod)
  const stretches = new Set(data.flexDates.filter(inPeriod)).size
  const calorieDays = calorieHitDates(data.calorieEntries).filter(inPeriod).length

  let totalCalories = 0
  let loggedDays = 0
  let bestCalorieDay = 0
  for (const [date, total] of dayTotals(data.calorieEntries)) {
    if (!inPeriod(date)) continue
    totalCalories += total
    loggedDays += 1
    if (total > bestCalorieDay) bestCalorieDay = total
  }

  const weights = data.bodyWeights
    .filter((b) => b.weightLbs >= 50 && inPeriod(b.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const weightChangeLbs =
    weights.length >= 2 ? Math.round((weights[weights.length - 1].weightLbs - weights[0].weightLbs) * 10) / 10 : null

  return {
    workouts: training,
    absSessions: abs,
    stretches,
    calorieDays,
    totalCalories,
    avgCalories: loggedDays > 0 ? Math.round(totalCalories / loggedDays) : 0,
    bestCalorieDay,
    prs: prsInPeriod(data.workouts, inPeriod),
    weightChangeLbs,
  }
}

// ---------------------------------------------------------------------------
// Superlatives (all-time bests).
// ---------------------------------------------------------------------------

/** Every period key (of the given kind) that appears anywhere in the data. */
function allPeriodKeys(data: ReviewData, kind: ReviewKind): string[] {
  const len = kind === 'month' ? 7 : 4
  const keys = new Set<string>()
  for (const r of data.workouts) keys.add(r.date.slice(0, len))
  for (const d of data.flexDates) keys.add(d.slice(0, len))
  for (const e of data.calorieEntries) keys.add(e.date.slice(0, len))
  for (const b of data.bodyWeights) keys.add(b.date.slice(0, len))
  return [...keys]
}

const SUPERLATIVE_METRICS: Superlative[] = ['workouts', 'stretches', 'calorieDays', 'totalCalories', 'prs']

/**
 * Metrics on which `periodKey` ties or beats every other period of its kind.
 * Needs at least one other period with data, and a positive value, so a lone
 * period (or an empty metric) is never crowned.
 */
export function superlatives(data: ReviewData, kind: ReviewKind, periodKey: string): Superlative[] {
  const keys = allPeriodKeys(data, kind).filter((k) => k !== periodKey)
  if (keys.length === 0) return []

  const target = periodStats(data, inPeriodFor(kind, periodKey))
  const others = keys.map((k) => periodStats(data, inPeriodFor(kind, k)))

  return SUPERLATIVE_METRICS.filter((m) => {
    const value = target[m]
    return value > 0 && others.every((o) => value >= o[m])
  })
}

const SUPERLATIVE_TEXT: Record<Superlative, (kind: ReviewKind) => string> = {
  workouts: (k) => `Most workouts of any ${k}`,
  stretches: (k) => `Most stretch sessions of any ${k}`,
  calorieDays: (k) => `Most days on calorie target of any ${k}`,
  totalCalories: (k) => `Biggest ${k} of fueling`,
  prs: (k) => `Most lifting PRs of any ${k}`,
}

// ---------------------------------------------------------------------------
// Story + assembly.
// ---------------------------------------------------------------------------

const SUPERLATIVE_LABEL: Record<Superlative, string> = {
  workouts: 'workouts',
  stretches: 'stretch sessions',
  calorieDays: 'days on target',
  totalCalories: 'total calories',
  prs: 'lifting PRs',
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function buildStory(kind: ReviewKind, stats: PeriodStats, marks: Superlative[]): string {
  const parts: string[] = []
  const label = kind === 'month' ? 'month' : 'year'

  if (stats.workouts > 0 || stats.stretches > 0) {
    const bits: string[] = []
    if (stats.workouts > 0) bits.push(`${stats.workouts} workout${stats.workouts === 1 ? '' : 's'}`)
    if (stats.absSessions > 0) bits.push(`${stats.absSessions} core session${stats.absSessions === 1 ? '' : 's'}`)
    if (stats.stretches > 0) bits.push(`${stats.stretches} stretch session${stats.stretches === 1 ? '' : 's'}`)
    parts.push(`You put in ${joinList(bits)} this ${label}.`)
  } else {
    parts.push(`A quieter ${label} on the training front — a fresh page starts now.`)
  }

  if (stats.prs > 0) {
    parts.push(`You set ${stats.prs} new lifting PR${stats.prs === 1 ? '' : 's'}.`)
  }

  if (stats.calorieDays > 0) {
    parts.push(`You hit your calorie goal on ${stats.calorieDays} day${stats.calorieDays === 1 ? '' : 's'}, fueling the bulk.`)
  }

  if (stats.weightChangeLbs != null && stats.weightChangeLbs > 0) {
    parts.push(`Body weight climbed ${stats.weightChangeLbs} lbs — exactly the direction a bulk should go.`)
  }

  if (marks.length > 0) {
    parts.push(`And it was a record ${label}: your best ever for ${joinList(marks.map((m) => SUPERLATIVE_LABEL[m]))}. Momentum like this is how big goals fall.`)
  } else {
    parts.push(`Every rep and every meal is a deposit. Keep stacking them.`)
  }

  return parts.join(' ')
}

export function buildReview(data: ReviewData, kind: ReviewKind, periodKey: string): Review {
  const stats = periodStats(data, inPeriodFor(kind, periodKey))
  const marks = superlatives(data, kind, periodKey)

  const statTiles: { label: string; value: string }[] = [
    { label: 'Workouts', value: String(stats.workouts) },
    { label: 'Stretches', value: String(stats.stretches) },
    { label: 'On-target days', value: String(stats.calorieDays) },
    { label: 'Lifting PRs', value: String(stats.prs) },
    { label: 'Best day', value: stats.bestCalorieDay > 0 ? `${stats.bestCalorieDay.toLocaleString()} cal` : '—' },
    {
      label: 'Weight',
      value:
        stats.weightChangeLbs == null
          ? '—'
          : `${stats.weightChangeLbs >= 0 ? '+' : ''}${stats.weightChangeLbs} lbs`,
    },
  ]

  return {
    kind,
    periodKey,
    title: `${periodLabel(kind, periodKey)} in review`,
    subtitle: kind === 'month' ? 'A look back at the month' : 'A look back at the year',
    stats: statTiles,
    highlights: marks.map((m) => SUPERLATIVE_TEXT[m](kind)),
    story: buildStory(kind, stats, marks),
    isBest: marks.length > 0,
  }
}

// ---------------------------------------------------------------------------
// Trigger.
// ---------------------------------------------------------------------------

/** Any logged activity of any kind falls inside the period. */
function periodHasData(data: ReviewData, inPeriod: InPeriod): boolean {
  return (
    data.workouts.some((r) => inPeriod(r.date)) ||
    data.flexDates.some(inPeriod) ||
    data.calorieEntries.some((e) => inPeriod(e.date)) ||
    data.bodyWeights.some((b) => inPeriod(b.date))
  )
}

export type ReviewMarkers = { lastReviewedMonth?: string; lastReviewedYear?: string }

/**
 * The review (if any) to show on this app open. A new year takes precedence and
 * subsumes the closing month; a new month shows on its own. Returns null unless
 * the markers have been seeded (so the feature never backfills a surprise recap
 * on its very first run) and the period that closed actually has data.
 */
export function pendingReview(
  markers: ReviewMarkers,
  data: ReviewData,
  today: Date = new Date(),
): { kind: ReviewKind; periodKey: string } | null {
  const curMonth = monthKeyOf(today)
  const curYear = yearKeyOf(today)

  if (markers.lastReviewedYear && markers.lastReviewedYear !== curYear) {
    const lastYear = prevYearKey(today)
    if (periodHasData(data, inPeriodFor('year', lastYear))) return { kind: 'year', periodKey: lastYear }
  }

  if (markers.lastReviewedMonth && markers.lastReviewedMonth !== curMonth) {
    const lastMonth = prevMonthKey(today)
    if (periodHasData(data, inPeriodFor('month', lastMonth))) return { kind: 'month', periodKey: lastMonth }
  }

  return null
}

/** True when a period has any data to recap — gates the manual recap buttons. */
export function reviewHasData(data: ReviewData, kind: ReviewKind, periodKey: string): boolean {
  return periodHasData(data, inPeriodFor(kind, periodKey))
}
