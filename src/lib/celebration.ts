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
import { trainingDates } from './session'
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
  /**
   * Take over the whole screen and wait to be dismissed instead of flashing by.
   * Set for the end of a session — the moment you put the phone down — so the
   * cheer isn't missed and closing it is what returns you to the app.
   */
  ack?: boolean
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

/** Distinct-day requirement so a lift with almost no history can't crown a PR. */
export const MIN_PR_HISTORY_DAYS = 2

/**
 * All-time est-1RM PRs set by `added` rows, judged against every `prev` row.
 * A PR requires a prior best (>0) to beat, so the first-ever entry for a lift
 * (or a fresh import) isn't counted as a PR. It additionally requires at least
 * MIN_PR_HISTORY_DAYS distinct prior workout days for that lift, so a lift with
 * only a single day of history can't crown a PR (which feels silly — there's no
 * real baseline yet). Sorted heaviest first.
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

  // Distinct prior workout DAYS per lift (only weighted rows form a baseline).
  const priorDays = new Map<string, Set<string>>()
  for (const r of prev) {
    if (r.weight_lbs == null) continue
    const set = priorDays.get(r.exercise) ?? new Set<string>()
    set.add(r.date)
    priorDays.set(r.exercise, set)
  }

  const priorBest = bestBy(prev)
  const addedBest = bestBy(added)

  const prs: PR[] = []
  for (const [key, best] of addedBest) {
    const prior = priorBest.get(key) ?? 0
    const days = priorDays.get(key)?.size ?? 0
    if (prior > 0 && days >= MIN_PR_HISTORY_DAYS && best > prior) {
      prs.push({ exercise: exerciseName(key), est1RM: round1(best) })
    }
  }
  return prs.sort((a, b) => b.est1RM - a.est1RM)
}

/**
 * A medium celebration for beating this session's progressive-overload
 * challenge on one or more lifts — a new baseline the plan will build on next
 * time. `names` are the exercise display names whose challenge was met.
 */
export function baselineCelebration(names: string[]): Celebration | null {
  if (names.length === 0) return null
  const [top, ...rest] = names
  return {
    tier: 'medium',
    title: names.length > 1 ? 'new baselines set' : 'new baseline set',
    subtitle: `${top} — you beat last session.`,
    details: rest.length ? rest : undefined,
    icon: 'flag',
  }
}

/** A single epic celebration summarizing one or more PRs. */
export function prCelebration(prs: PR[]): Celebration | null {
  if (prs.length === 0) return null
  const [top, ...rest] = prs
  return {
    tier: 'epic',
    title: prs.length > 1 ? 'new prs!' : 'new pr!',
    subtitle: `${top.exercise} — ${top.est1RM} lbs est. 1rm`,
    details: rest.map((p) => `${p.exercise} — ${p.est1RM} lbs`),
    icon: 'trophy',
  }
}

// ---------------------------------------------------------------------------
// Weekly-goal achievements.
// ---------------------------------------------------------------------------

export type WeekCounts = { workouts: number; flex: number; calDays: number }

/**
 * This-week counts, mirroring DataContext's derivation exactly: distinct dates
 * trained (supplemental core-only sessions excluded), distinct stretch dates,
 * and calorie-goal days.
 */
export function currentWeekCounts(
  workouts: WorkoutRow[],
  flexDates: string[],
  calorieEntries: CalorieEntry[],
  today: Date = new Date(),
): WeekCounts {
  const wk = weekStartISO(toISODate(today))
  const inWeek = (d: string) => weekStartISO(d) === wk

  return {
    workouts: trainingDates(workouts).filter(inWeek).length,
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
        title: 'weekly workouts done',
        subtitle: `${counts.workouts} of ${goals.workouts} workouts this week.`,
        icon: 'medal',
      }
    case 'flexGoal':
      return {
        tier: 'medium',
        title: 'weekly stretches done',
        subtitle: `${counts.flex} of ${goals.flex} sessions this week.`,
        icon: 'medal',
      }
    case 'calGoal':
      return {
        tier: 'medium',
        title: 'weekly calorie days done',
        subtitle: `${counts.calDays} of ${goals.calDays} days this week.`,
        icon: 'medal',
      }
    case 'checkpoint':
      return {
        tier: 'medium',
        title: 'checkpoint reached',
        subtitle: "halfway to the week's goal — keep it rolling.",
        icon: 'flag',
      }
    case 'fullGoal':
      return {
        tier: 'large',
        title: 'weekly goal complete!',
        subtitle: 'every target hit this week.',
        icon: 'stars',
      }
    case 'exceeded':
      return {
        tier: 'large',
        title: 'above and beyond!',
        subtitle: 'you blew past your weekly goal.',
        icon: 'stars',
      }
  }
}

// ---------------------------------------------------------------------------
// Daily completions (the quiet, nice ones).
// ---------------------------------------------------------------------------

export function workoutDoneCelebration(_dayType: WorkoutRow['day_type']): Celebration {
  return {
    tier: 'small',
    title: 'workout complete',
    subtitle: 'logged and done. nice work.',
    icon: 'check',
    ack: true,
  }
}

export const stretchDoneCelebration: Celebration = {
  tier: 'small',
  title: 'stretch + core done',
  subtitle: 'loose, limber, and braced. well done.',
  icon: 'check',
  ack: true,
}

export function calorieGoalCelebration(goal: number): Celebration {
  return {
    tier: 'small',
    title: 'calorie goal hit',
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
 *
 * `ack` carries from any item, not just the headline: a session-end cheer still
 * owns the screen even when a louder win (a weekly goal, say) leads it.
 */
export function composeCelebration(items: (Celebration | null)[]): Celebration | null {
  const real = items.filter((c): c is Celebration => c != null)
  if (real.length === 0) return null

  const sorted = [...real].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])
  const [head, ...rest] = sorted
  const details = [...(head.details ?? []), ...rest.map((c) => c.title)]
  return {
    ...head,
    details: details.length ? details : undefined,
    ack: real.some((c) => c.ack) || undefined,
  }
}
