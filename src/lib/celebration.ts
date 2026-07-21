/**
 * Pure celebration logic: what to cheer for, and how loud.
 *
 * The UI plays a tiered animation (see CelebrationOverlay) whose energy scales
 * with how special the moment is. This module has no React/DOM dependency — it
 * only decides which `Celebration`s an action earned, so it stays unit-testable.
 */

import type { WorkoutRow } from '../types'
import type { CalorieEntry } from './calories'
import { calorieHitDates } from './calories'
import { epley1RM } from './epley'
import { toISODate, weekStartISO } from './dates'
import { exerciseName } from '../config/plan'
import type { WeeklyGoalConfig } from './weeklyStreak'

/** Energy level, quietest → loudest. PRs are the loudest thing there is. */
export type CelebrationTier = 'small' | 'medium' | 'large' | 'epic'

/** Icon key the overlay maps to a concrete react-icon. */
export type CelebrationIcon = 'check' | 'flame' | 'flag' | 'medal' | 'stars' | 'trophy'

export type Celebration = {
  tier: CelebrationTier
  title: string
  subtitle?: string
  /** Secondary achievements earned in the same moment, shown as small badges. */
  details?: string[]
  icon: CelebrationIcon
}

export const TIER_RANK: Record<CelebrationTier, number> = {
  small: 1,
  medium: 2,
  large: 3,
  epic: 4,
}

const round1 = (n: number): number => Math.round(n * 10) / 10

// ---------------------------------------------------------------------------
// PRs — the headline event.
// ---------------------------------------------------------------------------

export type PR = { exercise: string; est1RM: number }

/**
 * All-time est-1RM PRs set by `added` rows, judged against every `prev` row.
 * A PR requires a prior best (>0) to beat, so the first-ever entry for a lift
 * (or a fresh import) isn't counted as a PR. Sorted heaviest first.
 */
export function detectPRs(prev: WorkoutRow[], added: WorkoutRow[]): PR[] {
  const bestBy = (rows: WorkoutRow[]): Map<string, number> => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (r.weight_lbs == null) continue
      const est = epley1RM(r.weight_lbs, r.reps)
      m.set(r.exercise, Math.max(m.get(r.exercise) ?? 0, est))
    }
    return m
  }

  const priorBest = bestBy(prev)
  const addedBest = bestBy(added)

  const prs: PR[] = []
  for (const [key, best] of addedBest) {
    const prior = priorBest.get(key) ?? 0
    if (prior > 0 && best > prior) prs.push({ exercise: exerciseName(key), est1RM: round1(best) })
  }
  return prs.sort((a, b) => b.est1RM - a.est1RM)
}

/** A single epic celebration summarizing one or more PRs. */
export function prCelebration(prs: PR[]): Celebration | null {
  if (prs.length === 0) return null
  const [top, ...rest] = prs
  return {
    tier: 'epic',
    title: prs.length > 1 ? 'NEW PRs!' : 'NEW PR!',
    subtitle: `${top.exercise} — ${top.est1RM} lbs est. 1RM`,
    details: rest.map((p) => `${p.exercise} — ${p.est1RM} lbs`),
    icon: 'trophy',
  }
}

// ---------------------------------------------------------------------------
// Weekly-goal achievements.
// ---------------------------------------------------------------------------

export type WeekCounts = { workouts: number; flex: number; calDays: number }

/**
 * This-week counts, mirroring DataContext's derivation exactly: distinct
 * non-abs workout-session dates, distinct stretch dates, and calorie-goal days.
 */
export function currentWeekCounts(
  workouts: WorkoutRow[],
  flexDates: string[],
  calorieEntries: CalorieEntry[],
  today: Date = new Date(),
): WeekCounts {
  const wk = weekStartISO(toISODate(today))
  const inWeek = (d: string) => weekStartISO(d) === wk

  const sessionDate = new Map<string, string>()
  for (const r of workouts) {
    if (r.day_type === 'abs') continue
    if (r.session_id && !sessionDate.has(r.session_id)) sessionDate.set(r.session_id, r.date)
  }

  return {
    workouts: [...sessionDate.values()].filter(inWeek).length,
    flex: new Set(flexDates.filter(inWeek)).size,
    calDays: calorieHitDates(calorieEntries).filter(inWeek).length,
  }
}

/** Overall fraction toward the weekly goal (mean of the three capped ratios). */
export function overallProgress(c: WeekCounts, g: WeeklyGoalConfig): number {
  return (
    (Math.min(c.workouts, g.workouts) / g.workouts +
      Math.min(c.flex, g.flex) / g.flex +
      Math.min(c.calDays, g.calDays) / g.calDays) /
    3
  )
}

/** Fraction of the bar where the "checkpoint" marker sits (mean of half goals). */
export function checkpointFraction(g: WeeklyGoalConfig): number {
  return (g.halfWorkouts / g.workouts + g.halfFlex / g.flex + g.halfCalDays / g.calDays) / 3
}

export type WeekAchievements = {
  workoutGoal: boolean
  flexGoal: boolean
  calGoal: boolean
  checkpoint: boolean
  fullGoal: boolean
  exceeded: boolean
}

const ACHIEVEMENT_KEYS: (keyof WeekAchievements)[] = [
  'workoutGoal',
  'flexGoal',
  'calGoal',
  'checkpoint',
  'fullGoal',
  'exceeded',
]

/** Which weekly achievements the given counts satisfy. */
export function weekAchievements(c: WeekCounts, g: WeeklyGoalConfig): WeekAchievements {
  const workoutGoal = c.workouts >= g.workouts
  const flexGoal = c.flex >= g.flex
  const calGoal = c.calDays >= g.calDays
  const fullGoal = workoutGoal && flexGoal && calGoal
  const overAny = c.workouts > g.workouts || c.flex > g.flex || c.calDays > g.calDays
  // 1e-9 guards floating-point equality when progress exactly meets the marker.
  const checkpoint = overallProgress(c, g) + 1e-9 >= checkpointFraction(g)
  return { workoutGoal, flexGoal, calGoal, checkpoint, fullGoal, exceeded: fullGoal && overAny }
}

/** Achievement keys that flipped false → true between two count snapshots. */
export function newlyEarned(before: WeekCounts, after: WeekCounts, g: WeeklyGoalConfig): (keyof WeekAchievements)[] {
  const b = weekAchievements(before, g)
  const a = weekAchievements(after, g)
  return ACHIEVEMENT_KEYS.filter((k) => !b[k] && a[k])
}

/** Build the celebration for a single newly-earned weekly achievement. */
export function achievementCelebration(
  key: keyof WeekAchievements,
  counts: WeekCounts,
  goals: WeeklyGoalConfig,
): Celebration {
  switch (key) {
    case 'workoutGoal':
      return {
        tier: 'medium',
        title: 'Weekly workouts done',
        subtitle: `${counts.workouts} of ${goals.workouts} workouts this week.`,
        icon: 'medal',
      }
    case 'flexGoal':
      return {
        tier: 'medium',
        title: 'Weekly stretches done',
        subtitle: `${counts.flex} of ${goals.flex} sessions this week.`,
        icon: 'medal',
      }
    case 'calGoal':
      return {
        tier: 'medium',
        title: 'Weekly calorie days done',
        subtitle: `${counts.calDays} of ${goals.calDays} days this week.`,
        icon: 'medal',
      }
    case 'checkpoint':
      return {
        tier: 'medium',
        title: 'Checkpoint reached',
        subtitle: "Halfway to the week's goal — keep it rolling.",
        icon: 'flag',
      }
    case 'fullGoal':
      return {
        tier: 'large',
        title: 'Weekly goal complete!',
        subtitle: 'Every target hit this week.',
        icon: 'stars',
      }
    case 'exceeded':
      return {
        tier: 'large',
        title: 'Above and beyond!',
        subtitle: 'You blew past your weekly goal.',
        icon: 'stars',
      }
  }
}

// ---------------------------------------------------------------------------
// Daily completions (the quiet, nice ones).
// ---------------------------------------------------------------------------

export function workoutDoneCelebration(dayType: WorkoutRow['day_type']): Celebration {
  return dayType === 'abs'
    ? { tier: 'small', title: 'Core session done', subtitle: 'Abs in the books.', icon: 'check' }
    : { tier: 'small', title: 'Workout complete', subtitle: 'Logged and done. Nice work.', icon: 'check' }
}

export const stretchDoneCelebration: Celebration = {
  tier: 'small',
  title: 'Stretch session done',
  subtitle: 'Loose and limber. Well done.',
  icon: 'check',
}

export function calorieGoalCelebration(goal: number): Celebration {
  return {
    tier: 'small',
    title: 'Calorie goal hit',
    subtitle: `${goal.toLocaleString()} cal in — bulk fueled.`,
    icon: 'flame',
  }
}

// ---------------------------------------------------------------------------
// Composition.
// ---------------------------------------------------------------------------

/**
 * Merge everything earned by one action into a single celebration: the loudest
 * tier becomes the headline, the rest ride along as secondary badges. Returns
 * null when nothing was earned.
 */
export function composeCelebration(items: (Celebration | null)[]): Celebration | null {
  const real = items.filter((c): c is Celebration => c != null)
  if (real.length === 0) return null

  const sorted = [...real].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
  const [head, ...rest] = sorted
  const details = [...(head.details ?? []), ...rest.map((c) => c.title)]
  return { ...head, details: details.length ? details : undefined }
}
