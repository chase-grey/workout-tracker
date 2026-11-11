/**
 * The profile the original owner's device would have, had it ever saved one:
 * the shipped weekly goals and calorie targets, with their histories, as data.
 *
 * A device with no profile already behaves this way (see lib/profile). This is
 * what Settings seeds its editor with there, so the first change the owner
 * makes — switching cardio on, say — starts from the goals already in force
 * rather than from a blank form, and re-scores nothing.
 */

import { CALORIE_GOALS } from './calories'
import { LEGACY_PILLARS, type Profile } from './profile'
import { WEEKLY_GOAL_HISTORY } from './weeklyStreak'

export function ownerProfile(now: Date = new Date()): Profile {
  return {
    name: '',
    owner: true,
    pillars: [...LEGACY_PILLARS],
    sex: 'male',
    dietDirection: 'gain',
    weeklyGoals: WEEKLY_GOAL_HISTORY.map((g) => ({ from: g.from, goals: { ...g.goals } })),
    calorieGoals: CALORIE_GOALS.map((g) => ({ ...g })),
    createdAt: now.toISOString(),
  }
}
