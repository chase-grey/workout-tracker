import { describe, it, expect } from 'vitest'
import {
  buildProfile,
  derive,
  emptyForm,
  formFromProfile,
  invalidSections,
  mergeSetup,
  planNeedsReplacing,
  togglePillar,
  toggleScheduleDay,
  visibleSections,
  withDays,
  aiPlanEdit,
  aiPlanFor,
  withWorkoutGoal,
  withGoal,
  type FormState,
} from './welcomeForm'
import { PILLARS, type Profile } from './profile'
import { planFor } from '../config/planTemplates'

const NOW = new Date(2026, 10, 18, 12) // a Wednesday

const filled = (over: Partial<FormState> = {}): FormState => ({
  ...emptyForm(),
  name: 'sam',
  pillars: ['strength', 'diet'],
  sex: 'female',
  birthYear: '1990',
  feet: '5',
  inches: '6',
  weight: '150',
  scale: true,
  bodyFat: false,
  ...over,
})

describe('a blank form', () => {
  it('tracks nothing, so nothing is preselected', () => {
    expect(emptyForm().pillars).toEqual([])
  })

  it('is missing the name, a pillar and the about-you answers', () => {
    expect(invalidSections(emptyForm(), { account: true, accountOk: false }, NOW)).toEqual([
      'you',
      'track',
      'about',
      'account',
    ])
  })

  it('shows no section that depends on an untracked pillar', () => {
    expect(visibleSections(emptyForm(), { account: true })).toEqual(['you', 'track', 'about', 'theme', 'coach', 'account'])
    expect(visibleSections(filled({ pillars: ['flexibility'] }), { account: false })).toEqual([
      'you',
      'track',
      'about',
      'goals',
      'schedule',
      'theme',
      'coach',
    ])
    // The calorie target is every day: nothing to schedule.
    expect(visibleSections(filled({ pillars: ['diet'] }), { account: false })).not.toContain('schedule')
  })
})

describe('the schedule', () => {
  it('opens with no days chosen', () => {
    const d = derive(filled({ pillars: ['strength', 'flexibility', 'diet'] }), NOW)
    expect(d.schedule).toEqual({ strength: [], flexibility: [] })
  })

  it('takes the days tapped, and gives them back', () => {
    let f = toggleScheduleDay(filled(), 'strength', 5)
    f = toggleScheduleDay(f, 'strength', 1)
    expect(derive(f, NOW).schedule.strength).toEqual([1, 5])
    f = toggleScheduleDay(toggleScheduleDay(f, 'strength', 1), 'strength', 5)
    expect(derive(f, NOW).schedule.strength).toEqual([])
  })

  it('leaves the weekly goals where they were set', () => {
    const before = derive(filled(), NOW).goals
    const f = toggleScheduleDay(filled(), 'strength', 5)
    expect(derive(f, NOW).goals).toEqual(before)
    // And a goal set by hand leaves the days.
    expect(derive(withGoal(f, 'workouts', 2, NOW), NOW).schedule.strength).toEqual([5])
    expect(derive(withDays(f, 2), NOW).schedule.strength).toEqual([5])
  })

  it('drops the days of a pillar that is switched off', () => {
    const f = toggleScheduleDay(filled({ pillars: ['strength', 'cardio'] }), 'cardio', 2)
    expect(derive({ ...f, pillars: ['strength'] }, NOW).schedule).toEqual({ strength: [] })
  })

  it('reopens on the days already saved', () => {
    const profile = buildProfile(filled(), NOW)
    const f = formFromProfile(profile, { pins: { strength: [1, 3, 5] } })
    expect(derive(f, NOW).schedule.strength).toEqual([1, 3, 5])
  })
})

describe('togglePillar', () => {
  it('lets the last pillar be deselected', () => {
    expect(togglePillar(['cardio'], 'cardio', PILLARS)).toEqual([])
  })

  it('keeps the fixed order when one is added', () => {
    expect(togglePillar(['diet'], 'strength', PILLARS)).toEqual(['strength', 'diet'])
  })
})

describe('invalidSections', () => {
  it('passes a filled form', () => {
    expect(invalidSections(filled(), { account: true, accountOk: true }, NOW)).toEqual([])
  })

  it('names the account section when the sign-up is not valid', () => {
    expect(invalidSections(filled(), { account: true, accountOk: false }, NOW)).toEqual(['account'])
  })

  it('does not ask for an account when the form has none', () => {
    expect(invalidSections(filled(), { account: false }, NOW)).toEqual([])
  })

  it('needs a calorie target in range when diet is on', () => {
    const f = filled({ calorieText: '200' })
    expect(invalidSections(f, { account: false }, NOW)).toEqual(['diet'])
  })

  it('needs the measuring questions answered', () => {
    expect(invalidSections(filled({ scale: null }), { account: false }, NOW)).toEqual(['about'])
  })

  it('needs sex, birth year, height and weight only when diet is on', () => {
    const bare = { sex: null, birthYear: '', feet: '', inches: '', weight: '' }
    expect(invalidSections(filled({ ...bare, pillars: ['cardio'] }), { account: false }, NOW)).toEqual([])
    expect(invalidSections(filled({ ...bare, pillars: ['diet'] }), { account: false }, NOW)).toEqual(['about', 'diet'])
  })
})

describe('the suggested calories', () => {
  it('appear once the about-you answers allow one, and follow them', () => {
    const lose = derive(filled({ direction: 'lose' }), NOW)
    const gain = derive(filled({ direction: 'gain' }), NOW)
    expect(lose.suggestedCalories).not.toBeNull()
    expect(lose.calories).toBe(String(lose.suggestedCalories))
    expect(gain.suggestedCalories!).toBeGreaterThan(lose.suggestedCalories!)
  })

  it('are absent without the stats', () => {
    expect(derive(filled({ weight: '' }), NOW).suggestedCalories).toBeNull()
    expect(derive(filled({ pillars: ['strength'] }), NOW).suggestedCalories).toBeNull()
  })

  it('give way to a figure typed by hand', () => {
    const d = derive(filled({ calorieText: '2100' }), NOW)
    expect(d.calories).toBe('2100')
    expect(d.suggestedCalories).not.toBe(2100)
  })
})

describe('lifting days and the weekly workout goal', () => {
  it.each([2, 3, 4, 5, 6] as const)('a %i-day week is a %i-workout goal', (days) => {
    expect(derive(filled({ days }), NOW).goals.workouts).toBe(days)
    expect(buildProfile(filled({ days }), NOW).weeklyGoals[0].goals.workouts).toBe(days)
    expect(buildProfile(filled({ days }), NOW).strength?.daysPerWeek).toBe(days)
  })

  it('moves a workout goal that was nudged by hand to the new days', () => {
    let f = filled({ pillars: ['strength', 'flexibility'], goalEdits: { workouts: 5, flex: 2, calDays: 6, cardio: 0 } })
    f = withDays(f, 4)
    expect(derive(f, NOW).goals.workouts).toBe(4)
    expect(derive(f, NOW).goals.flex).toBe(2)
  })

  it('defaults calorie days to six of seven', () => {
    expect(derive(filled(), NOW).goals.calDays).toBe(6)
  })
})

describe('buildProfile', () => {
  it('writes the calorie target and no strength block when those pillars are off', () => {
    const p = buildProfile(filled({ pillars: ['flexibility'] }), NOW)
    expect(p.strength).toBeUndefined()
    expect(p.calorieGoals).toEqual([])
    expect(p.weeklyGoals[0].goals).toEqual({ workouts: 0, flex: 2, calDays: 0, cardio: 0 })
  })
})

describe('update goals', () => {
  const existing = (): Profile => {
    const f = filled({ pillars: ['strength', 'diet'], days: 3 })
    const p = buildProfile(f, new Date(2026, 9, 5, 12))
    return { ...p, createdAt: '2026-10-05T12:00:00.000Z' }
  }

  it('prefills a form from the profile', () => {
    const f = formFromProfile(existing(), { heightIn: 66, weightLbs: 150, today: '2026-11-18' })
    expect(f.name).toBe('sam')
    expect(f.pillars).toEqual(['strength', 'diet'])
    expect(f.feet).toBe('5')
    expect(f.inches).toBe('6')
    expect(f.days).toBe(3)
    expect(f.calorieText).toBe(String(existing().calorieGoals[0].goal))
    expect(invalidSections(f, { account: false }, NOW)).toEqual([])
  })

  it('changes nothing for an untouched form', () => {
    const before = existing()
    const f = formFromProfile(before, { heightIn: 66, weightLbs: 150, today: '2026-11-18' })
    const out = mergeSetup(before, buildProfile(f, NOW), NOW)
    expect(out.weeklyGoals).toEqual(before.weeklyGoals)
    expect(out.calorieGoals).toEqual(before.calorieGoals)
    expect(out.createdAt).toBe(before.createdAt)
  })

  it('adds a dated goal entry instead of rewriting the weeks already lived', () => {
    const before = existing()
    let f = formFromProfile(before, { heightIn: 66, weightLbs: 150, today: '2026-11-18' })
    f = withDays(f, 5)
    f = { ...f, calorieText: '1900' }
    const out = mergeSetup(before, buildProfile(f, NOW), NOW)
    expect(out.weeklyGoals[0]).toEqual(before.weeklyGoals[0])
    expect(out.weeklyGoals.at(-1)).toEqual({ from: '2026-11-16', goals: expect.objectContaining({ workouts: 5 }) })
    expect(out.calorieGoals.at(-1)).toEqual({ from: '2026-11-18', goal: 1900 })
    expect(out.strength?.daysPerWeek).toBe(5)
  })

  it('zeroes a pillar that was switched off and keeps what the form did not ask', () => {
    const before = { ...existing(), owner: undefined, targetWeightLbs: 140 }
    let f = formFromProfile(before, { heightIn: 66, weightLbs: 150, today: '2026-11-18' })
    f = { ...f, pillars: ['strength'] }
    const out = mergeSetup(before, buildProfile(f, NOW), NOW)
    expect(out.pillars).toEqual(['strength'])
    expect(out.weeklyGoals.at(-1)?.goals.calDays).toBe(0)
    expect(out.targetWeightLbs).toBe(140)
    expect(out.dietDirection).toBe(before.dietDirection)
  })
})

describe('planNeedsReplacing', () => {
  it('is false for no strength, or the same setup', () => {
    expect(planNeedsReplacing({ daysPerWeek: 3, equipment: 'gym' }, undefined)).toBe(false)
    expect(planNeedsReplacing({ daysPerWeek: 3, equipment: 'gym' }, { daysPerWeek: 3, equipment: 'gym' })).toBe(false)
  })

  it('is false when days past three just rotate the same plan', () => {
    expect(planNeedsReplacing({ daysPerWeek: 3, equipment: 'gym' }, { daysPerWeek: 5, equipment: 'gym' })).toBe(false)
  })

  it('is true when equipment changes, or two days becomes three', () => {
    expect(planNeedsReplacing({ daysPerWeek: 3, equipment: 'gym' }, { daysPerWeek: 3, equipment: 'dumbbells' })).toBe(true)
    expect(planNeedsReplacing({ daysPerWeek: 2, equipment: 'gym' }, { daysPerWeek: 4, equipment: 'gym' })).toBe(true)
  })

  it('is true when strength is newly switched on', () => {
    expect(planNeedsReplacing(undefined, { daysPerWeek: 3, equipment: 'gym' })).toBe(true)
  })
})

describe('the plan answers in the form', () => {
  it('are stored on a new profile, with the session opening at full size', () => {
    const p = buildProfile(filled({ days: 4, minutes: 60, focus: ['arms', 'glutes'] }), NOW)
    expect(p.strength).toEqual({
      daysPerWeek: 4,
      equipment: 'gym',
      minutes: 60,
      focus: ['arms', 'glutes'],
      length: 'full',
    })
  })

  it('leave a profile from before those questions as it was when they are left alone', () => {
    const before: Profile = { ...buildProfile(filled(), NOW), strength: { daysPerWeek: 3, equipment: 'gym' } }
    const f = formFromProfile(before, { heightIn: 66, weightLbs: 150, today: '2026-11-18' })
    const out = mergeSetup(before, buildProfile(f, NOW), NOW)
    expect(out.strength).toEqual({ daysPerWeek: 3, equipment: 'gym' })
    expect(planNeedsReplacing(before.strength, out.strength)).toBe(false)
  })

  it('keep the session size already chosen', () => {
    const before: Profile = {
      ...buildProfile(filled(), NOW),
      strength: { daysPerWeek: 3, equipment: 'gym', minutes: 45, focus: [], length: 'short' },
    }
    const f = formFromProfile(before, { today: '2026-11-18' })
    const out = mergeSetup(before, buildProfile(withDays(f, 2), NOW), NOW)
    expect(out.strength).toMatchObject({ daysPerWeek: 2, length: 'short' })
  })

  it('ask for a rebuild when the length or the muscles change', () => {
    const was = { daysPerWeek: 3, equipment: 'gym', minutes: 45, focus: ['arms'] } as const
    const a = { ...was, focus: [...was.focus] }
    expect(planNeedsReplacing(a, { ...a, minutes: 60 })).toBe(true)
    expect(planNeedsReplacing(a, { ...a, focus: ['arms', 'back'] })).toBe(true)
    expect(planNeedsReplacing(a, { ...a })).toBe(false)
    expect(planNeedsReplacing({ daysPerWeek: 3, equipment: 'gym' }, { ...a, minutes: 45, focus: [] })).toBe(true)
  })
})

describe('an AI-built plan on the welcome form', () => {
  const form = filled({ days: 4, focus: ['chest'] })
  const plan = planFor({ daysPerWeek: 4, equipment: 'gym' })

  it('holds while the answers it was built on do', () => {
    const edit = aiPlanEdit(form, plan)
    expect(aiPlanFor(form, edit)).toBe(plan)
    expect(aiPlanFor({ ...form, name: 'alex', weight: '160' }, edit)).toBe(plan)
  })

  it('is dropped once a plan answer moves', () => {
    const edit = aiPlanEdit(form, plan)
    expect(aiPlanFor(withDays(form, 5), edit)).toBeNull()
    expect(aiPlanFor({ ...form, equipment: 'dumbbells' }, edit)).toBeNull()
    expect(aiPlanFor({ ...form, minutes: 60 }, edit)).toBeNull()
    expect(aiPlanFor({ ...form, focus: ['chest', 'back'] }, edit)).toBeNull()
  })

  it('comes back if the answers return to what it was built on', () => {
    const edit = aiPlanEdit(form, plan)
    expect(aiPlanFor({ ...form, minutes: 60 }, edit)).toBeNull()
    expect(aiPlanFor({ ...form, minutes: 45 }, edit)).toBe(plan)
  })

  it('is not used with strength switched off', () => {
    const edit = aiPlanEdit(form, plan)
    expect(aiPlanFor({ ...form, pillars: ['diet'] }, edit)).toBeNull()
  })

  it('is none when there is none', () => {
    expect(aiPlanFor(form, null)).toBeNull()
  })
})

describe('withWorkoutGoal', () => {
  it('sets the workouts goal and keeps the rest as they stand', () => {
    const f = filled({ pillars: ['strength', 'flexibility'], days: 3 })
    const before = derive(f, NOW).goals
    const after = derive(withWorkoutGoal(f, 5, NOW), NOW).goals
    expect(after).toEqual({ ...before, workouts: 5 })
  })

  it('leaves the form alone for no goal, or the one already set', () => {
    const f = filled({ days: 3 })
    expect(withWorkoutGoal(f, null, NOW)).toBe(f)
    expect(withWorkoutGoal(f, derive(f, NOW).goals.workouts, NOW)).toBe(f)
  })

  it('keeps the goal on the steppers’ scale', () => {
    expect(derive(withWorkoutGoal(filled(), 9, NOW), NOW).goals.workouts).toBe(7)
  })
})

describe('the cardio goal section', () => {
  it('shows right after the strength plan when cardio is tracked, and never blocks the form', () => {
    const f = filled({ pillars: ['strength', 'cardio'] })
    const shown = visibleSections(f, { account: true })
    expect(shown.indexOf('cardio')).toBe(shown.indexOf('strength') + 1)
    expect(invalidSections(f, { account: true })).not.toContain('cardio')
  })

  it('stays away without the cardio pillar', () => {
    expect(visibleSections(filled({ pillars: ['strength'] }), { account: true })).not.toContain('cardio')
  })
})
